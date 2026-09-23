import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { ANY_GRADE, gradeExistsClause, gradeHintCase, normalizeGrade } from '@/lib/searchGrades'

export const dynamic = 'force-dynamic'

type MatchMode = 'all' | 'any' | 'phrase'

function parseMatch(raw: string | null): MatchMode {
  const m = (raw ?? '').trim().toLowerCase()
  // Default = the original search dialog's default: متتالية, i.e. the same words adjacent and in
  // order. Verified against the legacy engine (legacy-audit/09-search-parity-a1.md): this mode and
  // the original's bare `field = '<phrase>'` agree exactly — 'الحمد لله' -> 1,207 rows on both.
  return m === 'any' || m === 'all' ? m : 'phrase'
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()

  // All params are parsed through one tolerant helper: unknown/blank/non-numeric values
  // become null instead of NaN (previously `book_id=abc` or `page=` produced NaN and the
  // filter silently vanished).
  const intParam = (name: string): number | null => {
    const raw = searchParams.get(name)
    if (raw === null || raw.trim() === '') return null
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? n : null
  }

  const page = Math.max(1, intParam('page') ?? 1)
  const limit = Math.min(100, Math.max(1, intParam('limit') ?? 20))
  const bookId = intParam('book_id')
  const narratorId = intParam('narrator_id')
  const subjectCatId = intParam('subject_cat_id')
  const maxDepth = intParam('max_depth')
  const gradeFilter = normalizeGrade(searchParams.get('grade') as string | null)
  // search_scope: 'tarf' = أطراف فقط, 'both' (default) = متن + أطراف
  const searchScope = (searchParams.get('search_scope') ?? '').trim().toLowerCase() === 'tarf' ? 'tarf' : 'both'
  // match: 'all' (default, all words) | 'any' (أي من الكلمات) | 'phrase' (متتالية)
  const matchMode = parseMatch(searchParams.get('match'))
  const offset = (page - 1) * limit

  // The stored `content` is marked-up text (<متن>, <سند>, <رقم_حديث نوع="مطبوع">, hidden
  // matn in attributes such as نص="…"). The legacy engine indexes element text only — tag
  // and attribute text is NOT searchable — and indexing markup made the same query return
  // extra rows (e.g. markup-only hits: ربط 276k vs 11 in tarf). Strip tags before indexing.
  // Kept expression-identical to the GIN index in db/add_visible_text_index.js so the index
  // is actually used (a wrapper that does not match an index forces a full table scan).
  const visibleText = (alias: string): string => `regexp_replace(coalesce(${alias},''), '<[^>]*>', ' ', 'g')`

  const visibleMatch = (contentAlias: string, param: string): string =>
    `to_tsvector('simple', normalize_hadith(${visibleText(contentAlias)})) @@ ${queryExpr(param)}`

  // Document used only for ranking (computed for the matched rows, not for the scan).
  const rankDoc = (tarfAlias: string, contentAlias: string): string =>
    searchScope === 'tarf'
      ? `coalesce(${tarfAlias},'')`
      : `(coalesce(${tarfAlias},'') || ' ' || ${visibleText(contentAlias)})`

  // Normalised + punctuation-stripped query text, whitespace-trimmed. Used by `any`, where the
  // words are re-joined with `|` — splitting on whitespace yields empty elements for leading,
  // trailing or repeated separators, and an empty tsquery operand is a syntax error (that made
  // `q=الصلاة "الصوم"&match=any` fail with a 500), so empties are removed and the degenerate
  // all-punctuation case falls back to an empty (match-nothing) tsquery.
  const normWords = (param: string): string =>
    `btrim(regexp_replace(normalize_hadith(${param}), '[^\\w\\s]+', ' ', 'g'))`

  // The tsquery for the given parameter placeholder.
  const queryExpr = (param: string): string => {
    if (matchMode === 'phrase') return `phraseto_tsquery('simple', normalize_hadith(${param}))`
    if (matchMode === 'any')
      return `(CASE WHEN ${normWords(param)} = ''
                    THEN plainto_tsquery('simple', '')
                    ELSE to_tsquery('simple', array_to_string(
                           array_remove(regexp_split_to_array(${normWords(param)}, '\\s+'), ''), ' | '))
                    END)`
    return `plainto_tsquery('simple', normalize_hadith(${param}))`
  }

  // ---------------------------------------------------------------------------
  // Boolean query terms — the original's dialog is not a single string search.
  //
  // The old app builds its WHERE text from a 21-entry vocabulary of comparators ('=', '!=', '>',
  // '<', '<=', '>='), connectives (' AND ', ' OR ', ' NOT ', ' XOR ') and wildcards ('*', '?')
  // (legacy-audit/10-legacy-search-callsite.md §2b, dumped from the exe's initialised CString
  // arrays). Measured against the engine, on BookTOC_Hadith.Content:
  //
  //   'الصلاة'                   -> 17,304        'الصلاة' AND 'الزكاة'        -> 578
  //   'الزكاة'                   ->  1,280        'الصلاة' OR  'الزكاة'        -> 18,006
  //   'الصلاة' AND NOT 'الزكاة'  -> 16,726        'صلا*'                       -> 14,902
  //   Tarf = 'الصلاة'            ->  8,902
  //
  // and those numbers are consistent set-wise (17,304 + 1,280 − 578 = 18,006; 17,304 − 578 = 16,726).
  //
  // A query with no connective and no wildcard takes the path below unchanged, so the behaviour
  // verified against the engine for the six existing modes (legacy-audit/09-search-parity-a1.md)
  // cannot regress.
  // ---------------------------------------------------------------------------

  // Escape a value for a string literal. The boolean path inlines terms (the engine's own SQL is
  // built the same way) — the single-term path keeps using bound parameters.
  const sqlLit = (s: string): string => `'${s.replace(/'/g, "''")}'`

  type BoolConn = 'AND' | 'OR' | 'NOT' | 'XOR'
  type BoolTerm = { conn: BoolConn | null; term: string; regex: string | null }

  // The connectives, in the words the search page's own buttons show: و = AND, أو = OR,
  // ليس / وليس / بدون = NOT. An Arabic connective only counts when it stands alone between spaces,
  // so a word that merely begins with و (والزكاة) stays a search word, as it must.
  const CONNECTIVES: Record<string, BoolConn> = {
    AND: 'AND', OR: 'OR', NOT: 'NOT', XOR: 'XOR',
    'و': 'AND', 'أو': 'OR', 'ليس': 'NOT', 'وليس': 'NOT', 'بدون': 'NOT', 'وبدون': 'NOT',
  }
  const CONN_SPLIT = /\s+(AND|OR|NOT|XOR|و|أو|ليس|وليس|بدون|وبدون)\s+/i
  const CONN_LEADING = /^(?:NOT|ليس|وليس|بدون|وبدون)\s+/i

  // Turn the raw query into terms. Splitting only on whitespace-delimited connectives keeps words
  // that merely contain those letters (e.g. 'AND' inside a transliteration) intact; a leading '-'
  // is the shorthand for NOT.
  function parseQueryTerms(raw: string): BoolTerm[] {
    const parts = raw.split(CONN_SPLIT)
    const out: BoolTerm[] = []
    const terms: string[] = [parts[0] ?? '']
    const conns: (BoolConn | null)[] = [null]
    for (let i = 1; i < parts.length; i += 2) {
      const key = (parts[i] ?? 'AND').trim()
      conns.push(CONNECTIVES[key.toUpperCase()] ?? 'AND')
      terms.push(parts[i + 1] ?? '')
    }
    for (let i = 0; i < terms.length; i++) {
      let t = terms[i].trim()
      if (!t) continue
      let conn = conns[i]
      // 'A AND NOT B' splits into ['A', 'AND', 'NOT B'] — the NOT has no leading whitespace left,
      // so it survives in the term and must be lifted back out as the connector.
      const lead = t.match(CONN_LEADING)
      // Only lift a leading NOT when a connective was actually used ('A AND NOT B' splits into
      // ['A', 'AND', 'NOT B']). Otherwise «ليس المؤمن بالطعان» — a real hadith wording — would be
      // read as "NOT المؤمن بالطعان" instead of the phrase it is.
      if (lead && parts.length > 1) { conn = 'NOT'; t = t.slice(lead[0].length).trim() }
      else if (t.startsWith('-') && t.length > 1) { conn = 'NOT'; t = t.slice(1).trim() }
      out.push({ conn, term: t, regex: wildcardToRegex(t) })
    }
    return out
  }

  // '*' = any run of characters, '?' = one character, matched against whole words of the normalised
  // text — the same reading the engine's wildcards have ('صلا*' finds words starting with صلا).
  function wildcardToRegex(term: string): string | null {
    if (!/[*?]/.test(term)) return null
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, (ch) => (ch === '*' || ch === '?' ? ch : `\\${ch}`))
    const body = escaped.replace(/\*/g, '[^ ]*').replace(/\?/g, '.')
    return `(^| )${body}( |$)`
  }

  // One term's match expression. A trailing-only wildcard ('صلا*') can go through the tsquery
  // prefix operator, which the GIN index serves; any other position falls back to a regex over the
  // normalised text (no index — noted in the audit as the cost of mid-word wildcards).
  function termMatchExpr(t: BoolTerm, tarfAlias: string, contentAlias: string): string {
    const trailingOnly = t.regex !== null && /^[^*?]*\*$/.test(t.term)
    if (trailingOnly) {
      const prefix = t.term.slice(0, -1).trim()
      const q = `to_tsquery('simple', normalize_hadith(${sqlLit(prefix)}) || ':*')`
      if (searchScope === 'tarf')
        return `to_tsvector('simple', normalize_hadith(coalesce(${tarfAlias},''))) @@ ${q}`
      return `(
        to_tsvector('simple', normalize_hadith(coalesce(${tarfAlias},''))) @@ ${q}
        OR normalize_hadith(${visibleText(contentAlias)}) ~ ${sqlLit(t.regex!)}
      )`
    }
    if (t.regex) {
      const rx = sqlLit(t.regex)
      if (searchScope === 'tarf') return `normalize_hadith(coalesce(${tarfAlias},'')) ~ ${rx}`
      return `(normalize_hadith(coalesce(${tarfAlias},'')) ~ ${rx} OR normalize_hadith(${visibleText(contentAlias)}) ~ ${rx})`
    }
    const q = queryExpr(sqlLit(t.term))
    if (searchScope === 'tarf')
      return `to_tsvector('simple', normalize_hadith(coalesce(${tarfAlias},''))) @@ ${q}`
    return `(
      to_tsvector('simple', normalize_hadith(coalesce(${tarfAlias},''))) @@ ${q}
      OR ${visibleMatch(contentAlias, sqlLit(t.term))}
    )`
  }

  function composeBooleanExpr(terms: BoolTerm[], tarfAlias: string, contentAlias: string): string {
    let expr = ''
    terms.forEach((t, i) => {
      const m = termMatchExpr(t, tarfAlias, contentAlias)
      if (i === 0) { expr = t.conn === 'NOT' ? `NOT (${m})` : m; return }
      if (t.conn === 'NOT') expr = `(${expr}) AND NOT (${m})`
      else if (t.conn === 'OR') expr = `((${expr}) OR (${m}))`
      else if (t.conn === 'XOR')
        // either-or-but-not-both; operands are evaluated twice, accepted for a rare operator
        expr = `(((${expr}) OR (${m})) AND NOT ((${expr}) AND (${m})))`
      else expr = `((${expr}) AND (${m}))`
    })
    return expr
  }

  const booleanTerms = q ? parseQueryTerms(q) : []
  const useBoolean = booleanTerms.length > 1
    || (booleanTerms.length === 1 && (booleanTerms[0].regex !== null || booleanTerms[0].conn === 'NOT'))

  // ---------------------------------------------------------------------------
  // Match lines for the result list
  // ---------------------------------------------------------------------------
  // The result card only had the tarf, so a match buried in a long matn was invisible. Each row now
  // carries a concordance-style line: the opening words, then every place the query matches with a
  // couple of words either side, elided with '…'.
  type SnipPart = { t: string; hit: boolean }
  type SnipNeedle = { words: string[]; regex: RegExp | null }

  // Readable matn text, capped: the match line never needs the whole matn, and the two arrays below
  // must be built from the *same* truncated string so index i is the same word in both.
  //
  // The stored matn carries inline metadata — paragraph ids, page references, and the hadith's own
  // numbers (<رقم_حديث نوع="حرف">1881</رقم_حديث>) — which read as noise in a match line. They are
  // dropped here so the line reads as matn. This affects display only: matching keeps using
  // visibleText, which retains them, so the verified result sets cannot move.
  const snipClean = (alias: string): string =>
    `regexp_replace(` +
    `regexp_replace(` +
    `regexp_replace(coalesce(${alias}, ''), '<رقم_حديث[^>]*>[^<]*</رقم_حديث>', ' ', 'g'), ` +
    `'<(رقم_الفقرة|الصفحات|نه|تخريج)[^>]*/>', ' ', 'g'), ` +
    `'<[^>]*>', ' ', 'g')`
  const snipSrc = (alias: string): string => `left(${snipClean(alias)}, 6000)`

  // Comparison form of a word: surrounding punctuation removed, so a needle finds 'الوسوسة' inside
  // 'الوسوسة.' — unlike the search index, these arrays keep punctuation attached to the word.
  const cleanWord = (w: string): string => w.replace(/^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu, '')
  // The stored matn also carries HTML entities; unescaped for display only.
  const decodeEntities = (w: string): string =>
    w.replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')

  // The needles are normalised by the database's own normalise function, so the comparison uses
  // exactly the same normalisation as the indexed text — no second implementation to drift.
  async function snippetNeedles(terms: BoolTerm[]): Promise<SnipNeedle[]> {
    const texts = terms.map(t => (t.term || '').trim()).filter(Boolean)
    if (!texts.length) return []
    const { rows } = await pool.query(
      `SELECT ${texts.map((_, i) => `normalize_hadith($${i + 1}) AS n${i}`).join(', ')}`,
      texts
    )
    const needles: SnipNeedle[] = []
    terms.forEach((t, i) => {
      const norm = String(rows[0]?.[`n${i}`] ?? '').trim()
      if (!norm) return
      if (t.regex) {
        // 'صلا*' / 'الصل?' — the same word-scoped reading the matcher uses, one word at a time
        const body = norm.split('').map(ch => (ch === '*' ? '.*' : ch === '?' ? '.' : escapeRx(ch))).join('')
        needles.push({ words: [], regex: new RegExp(`^${body}$`) })
      } else {
        needles.push({ words: norm.split(/\s+/).map(cleanWord).filter(Boolean), regex: null })
      }
    })
    return needles
  }

  function buildSnippet(disp: string[], norm: string[], needles: SnipNeedle[]): SnipPart[] | null {
    if (!disp.length || disp.length !== norm.length || !needles.length) return null
    const ranges: [number, number][] = []
    for (let i = 0; i < norm.length; i++) {
      if (!norm[i]) continue
      for (const nd of needles) {
        if (nd.regex) {
          if (nd.regex.test(norm[i])) { ranges.push([i, 1]); break }
          continue
        }
        if (!nd.words.length || i + nd.words.length > norm.length) continue
        let ok = true
        for (let k = 0; k < nd.words.length; k++) {
          if (norm[i + k] !== nd.words[k]) { ok = false; break }
        }
        if (ok) { ranges.push([i, nd.words.length]); break }
      }
    }
    if (!ranges.length) return null

    const merged: [number, number][] = []
    for (const [s, len] of ranges) {
      const last = merged[merged.length - 1]
      if (last && s <= last[0] + last[1]) last[1] = Math.max(last[1], s + len - last[0])
      else merged.push([s, len])
    }

    const parts: SnipPart[] = []
    const push = (t: string, hit = false) => parts.push({ t, hit })
    // A window opened for one hit usually contains the others too, so mark by membership in all the
    // merged ranges rather than only the range that opened the window.
    const hitIdx = new Set<number>()
    for (const [s, len] of merged) for (let i = s; i < s + len; i++) hitIdx.add(i)
    // Marks the word's letters only: the punctuation stays outside the highlight, so the text is
    // still exactly what the matn holds ('فضل [الزكاة].' rather than '[الزكاة.]').
    const pushWord = (i: number) => {
      const w = disp[i]
      if (!hitIdx.has(i)) { push(w); return }
      const m = w.match(/^([^\p{L}\p{N}\p{M}]*)([\s\S]*?)([^\p{L}\p{N}\p{M}]*)$/u)
      if (!m || !m[2]) { push(w); return }
      if (m[1]) push(m[1])
      push(m[2], true)
      if (m[3]) push(m[3])
    }
    // The opening words first (the reader needs to know which hadith this is), but never words the
    // first window is about to show anyway.
    const headEnd = Math.min(3, merged[0][0])
    for (let i = 0; i < headEnd; i++) pushWord(i)
    if (merged[0][0] > headEnd) push('…')

    let shown = headEnd
    let windows = 0
    for (const [s, len] of merged) {
      if (windows >= 3) break
      const from = Math.max(shown, s - 2)
      const to = Math.min(disp.length - 1, s + len - 1 + 2)
      if (from > shown) push('…')
      for (let i = from; i <= to; i++) pushWord(i)
      shown = to + 1
      windows++
    }
    if (shown < disp.length) push('…')
    // Collapse neighbouring ellipses ('… …' reads as a mistake, not an elision).
    return parts.filter((p, i) => !(p.t === '…' && parts[i - 1]?.t === '…'))
  }

  function escapeRx(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  async function attachSnippets<T extends Record<string, any>>(rows: T[], terms: BoolTerm[]): Promise<any[]> {
    if (!rows.length || !terms.length) return rows
    const needles = await snippetNeedles(terms)
    return rows.map(r => {
      const disp: string[] = Array.isArray(r.snip_disp) ? r.snip_disp : []
      const norm: string[] = Array.isArray(r.snip_norm) ? r.snip_norm : []
      delete r.snip_disp
      delete r.snip_norm
      const words = disp
        .map((w, i) => ({ w: decodeEntities(w), n: cleanWord(norm[i] ?? '') }))
        .filter(p => p.w !== '' && p.n !== '')
      return {
        ...r,
        snippet: needles.length && words.length
          ? buildSnippet(words.map(p => p.w), words.map(p => p.n), needles)
          : null,
      }
    })
  }

  // Helper: build the text-match SQL expression based on scope and match mode.
  // Scope `both` stays an OR of the two tsvector predicates so the planner can combine
  // idx_hadith_toc_tarf_norm with the stripped-content index (a concatenated document would
  // have no matching index and would full-scan 339k rows).
  function textMatchExpr(tarfAlias: string, contentAlias: string, param = '$1'): string {
    if (useBoolean) {
      // The boolean branch inlines its terms, so it leaves no placeholder for the query text while
      // the call sites still bind it — Postgres rejects a bind with more values than placeholders.
      // Keep one reference, folded to a constant by the planner, instead of renumbering the
      // placeholders of every call site.
      return `(${composeBooleanExpr(booleanTerms, tarfAlias, contentAlias)} AND (${param}::text IS NOT NULL))`
    }
    const q = queryExpr(param)
    if (searchScope === 'tarf')
      return `to_tsvector('simple', normalize_hadith(coalesce(${tarfAlias},''))) @@ ${q}`
    return `(
      to_tsvector('simple', normalize_hadith(coalesce(${tarfAlias},''))) @@ ${q}
      OR ${visibleMatch(contentAlias, param)}
    )`
  }

  // Combined narrator + text search
  if (narratorId !== null && q && q.length >= 2) {
    const gradeExistsClause2 = gradeExistsClause(gradeFilter, 'ht.main_id')

    const [hadithsRes, countRes] = await Promise.all([
      pool.query(
        `SELECT DISTINCT ht.main_id, ht.book_id, b.title as book_name, ht.tarf,
                ht.section_text, ht.chapter_text, ht.part_num, ht.page_num,
                ht.tarqeem_harf, ht.tarqeem_matboa1,
                regexp_split_to_array(btrim(${snipSrc('ht.content')}), '\\s+') AS snip_disp,
                regexp_split_to_array(btrim(normalize_hadith(${snipSrc('ht.content')})), '\\s+') AS snip_norm,
                jg.grade_hint
         FROM isnad_hadiths iha
         JOIN isnad_chains ic ON iha.isnad_id = ic.id
         JOIN hadith_toc ht ON iha.hadith_id = ht.main_id
         JOIN books b ON b.id = ht.book_id
         LEFT JOIN LATERAL (
           SELECT ${gradeHintCase('say_text')} as grade_hint
           FROM hadith_judgments j2
           WHERE j2.hadith_id = ht.main_id
             AND (j2.say_text ~* '${ANY_GRADE}')
           ORDER BY CASE
             WHEN j2.say_text ~* 'صحيح' THEN 1
             WHEN j2.say_text ~* 'حسن' THEN 2
             WHEN j2.say_text ~* 'ضعيف|منكر|متروك' THEN 3
             ELSE 4 END
           LIMIT 1
         ) jg ON true
         WHERE ic.narrator_id_array @> ARRAY[$1::integer]
           AND ht.is_leaf = true
           AND ${textMatchExpr('ht.tarf', 'ht.content', '$2')}
           ${gradeExistsClause2 ? 'AND ' + gradeExistsClause2 : ''}
         ORDER BY ht.book_id, ht.main_id
         LIMIT $3 OFFSET $4`,
        [narratorId, q, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(DISTINCT ht.main_id) as cnt
         FROM isnad_hadiths iha
         JOIN isnad_chains ic ON iha.isnad_id = ic.id
         JOIN hadith_toc ht ON iha.hadith_id = ht.main_id
         WHERE ic.narrator_id_array @> ARRAY[$1::integer]
           AND ht.is_leaf = true
           AND ${textMatchExpr('ht.tarf', 'ht.content', '$2')}
           ${gradeExistsClause2 ? 'AND ' + gradeExistsClause2 : ''}`,
        [narratorId, q]
      ),
    ])
    return NextResponse.json({
      results: await attachSnippets(hadithsRes.rows, booleanTerms),
      total: parseInt(countRes.rows[0]?.cnt || '0'),
      page,
      limit,
      mode: 'narrator+text',
      search_scope: searchScope,
      match: matchMode,
    })
  }

  // Narrator-only isnad search mode
  if (narratorId !== null) {
    const gradeExists = gradeExistsClause(gradeFilter, 'ht.main_id')

    const [hadithsRes, countRes] = await Promise.all([
      pool.query(
        `SELECT DISTINCT ht.main_id, ht.book_id, b.title as book_name, ht.tarf,
                ht.section_text, ht.chapter_text, ht.part_num, ht.page_num,
                ht.tarqeem_harf, ht.tarqeem_matboa1,
                jg.grade_hint
         FROM isnad_hadiths iha
         JOIN isnad_chains ic ON iha.isnad_id = ic.id
         JOIN hadith_toc ht ON iha.hadith_id = ht.main_id
         JOIN books b ON b.id = ht.book_id
         LEFT JOIN LATERAL (
           SELECT ${gradeHintCase('say_text')} as grade_hint
           FROM hadith_judgments j2
           WHERE j2.hadith_id = ht.main_id
             AND (j2.say_text ~* '${ANY_GRADE}')
           ORDER BY CASE
             WHEN j2.say_text ~* 'صحيح' THEN 1
             WHEN j2.say_text ~* 'حسن' THEN 2
             WHEN j2.say_text ~* 'ضعيف|منكر|متروك' THEN 3
             ELSE 4 END
           LIMIT 1
         ) jg ON true
         WHERE ic.narrator_id_array @> ARRAY[$1::integer]
           AND ht.is_leaf = true
           ${gradeExists ? 'AND ' + gradeExists : ''}
         ORDER BY ht.book_id, ht.main_id
         LIMIT $2 OFFSET $3`,
        [narratorId, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(DISTINCT ht.main_id) as cnt
         FROM isnad_hadiths iha
         JOIN isnad_chains ic ON iha.isnad_id = ic.id
         JOIN hadith_toc ht ON iha.hadith_id = ht.main_id
         WHERE ic.narrator_id_array @> ARRAY[$1::integer]
           AND ht.is_leaf = true
           ${gradeExists ? 'AND ' + gradeExists : ''}`,
        [narratorId]
      ),
    ])
    return NextResponse.json({
      results: hadithsRes.rows,
      total: parseInt(countRes.rows[0]?.cnt || '0'),
      page,
      limit,
      mode: 'narrator',
    })
  }

  if (!q || q.length < 2) return NextResponse.json({ results: [], total: 0 })

  // Pure text search — normalized indexes (tashkeel-stripped + hamza-normalized)
  // Scope is controlled by search_scope param: 'tarf' = أطراف فقط, 'both' (default) = متن + أطراف
  const textMatch = textMatchExpr('h.tarf', 'h.content')
  const conditions: string[] = ['h.is_leaf = true', textMatch]
  const params: (string | number)[] = [q, limit, offset]
  let paramIdx = 4

  if (bookId !== null) {
    conditions.push(`h.book_id = $${paramIdx}`)
    params.push(bookId)
    paramIdx++
  }

  if (subjectCatId !== null) {
    conditions.push(
      `EXISTS (
        SELECT 1 FROM hadith_subjects hs
        JOIN subject_items si ON si.id = hs.subject_id
        JOIN subject_categories sc ON sc.id = $${paramIdx}
        WHERE hs.paragraph_main_id = h.main_id
          AND si.left_value > sc.left_value
          AND si.right_value < sc.right_value
      )`
    )
    params.push(subjectCatId)
    paramIdx++
  }

  if (maxDepth !== null && maxDepth > 0) {
    conditions.push(
      `EXISTS (
        SELECT 1 FROM isnad_hadiths iha
        JOIN isnad_chains ic ON ic.id = iha.isnad_id
        WHERE iha.hadith_id = h.main_id AND ic.chain_length <= $${paramIdx}
      )`
    )
    params.push(maxDepth)
    paramIdx++
  }

  const gradeCondition = gradeExistsClause(gradeFilter, 'h.main_id')
  if (gradeCondition) conditions.push(gradeCondition)

  const whereClause = conditions.join(' AND ')

  const { rows } = await pool.query(
    `SELECT h.main_id, h.book_id, b.title AS book_name, h.tarf,
            h.section_text, h.chapter_text, h.part_num, h.page_num,
            h.tarqeem_harf, h.tarqeem_matboa1,
            regexp_split_to_array(btrim(${snipSrc('h.content')}), '\\s+') AS snip_disp,
            regexp_split_to_array(btrim(normalize_hadith(${snipSrc('h.content')})), '\\s+') AS snip_norm,
            ts_rank(to_tsvector('simple', normalize_hadith(${rankDoc('h.tarf', 'h.content')})),
                    ${queryExpr('$1')}) AS rank,
            jg.grade_hint,
            par.parallel_count
     FROM hadith_toc h
     JOIN books b ON b.id = h.book_id
     LEFT JOIN LATERAL (
       SELECT COUNT(DISTINCT t2.hadith_id)::int - 1 AS parallel_count
       FROM takhrij t1
       JOIN takhrij t2 ON t2.group_id = t1.group_id
       WHERE t1.hadith_id = h.main_id
     ) par ON true
     LEFT JOIN LATERAL (
       SELECT ${gradeHintCase('say_text')} as grade_hint
       FROM hadith_judgments j2
       WHERE j2.hadith_id = h.main_id
         AND (j2.say_text ~* '${ANY_GRADE}')
       ORDER BY CASE
         WHEN j2.say_text ~* 'صحيح' THEN 1
         WHEN j2.say_text ~* 'حسن' THEN 2
         WHEN j2.say_text ~* 'ضعيف|منكر|متروك' THEN 3
         ELSE 4 END
       LIMIT 1
     ) jg ON true
     WHERE ${whereClause}
     ORDER BY rank DESC, h.main_id ASC
     LIMIT $2 OFFSET $3`,
    params
  )

  const textMatchCount = textMatchExpr('tarf', 'content')
  const countParams: (string | number)[] = [q]
  const countConditions: string[] = ['is_leaf = true', textMatchCount]
  let countParamIdx = 2

  if (bookId !== null) {
    countConditions.push(`book_id = $${countParamIdx}`)
    countParams.push(bookId)
    countParamIdx++
  }

  if (subjectCatId !== null) {
    countConditions.push(
      `EXISTS (
        SELECT 1 FROM hadith_subjects hs
        JOIN subject_items si ON si.id = hs.subject_id
        JOIN subject_categories sc ON sc.id = $${countParamIdx}
        WHERE hs.paragraph_main_id = main_id
          AND si.left_value > sc.left_value
          AND si.right_value < sc.right_value
      )`
    )
    countParams.push(subjectCatId)
    countParamIdx++
  }

  if (maxDepth !== null && maxDepth > 0) {
    countConditions.push(
      `EXISTS (
        SELECT 1 FROM isnad_hadiths iha
        JOIN isnad_chains ic ON ic.id = iha.isnad_id
        WHERE iha.hadith_id = main_id AND ic.chain_length <= $${countParamIdx}
      )`
    )
    countParams.push(maxDepth)
    countParamIdx++
  }

  const countGradeCondition = gradeExistsClause(gradeFilter, 'main_id')
  if (countGradeCondition) countConditions.push(countGradeCondition)

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE btrim(coalesce(tarqeem_matboa1, '')) <> '')::int AS hadiths
     FROM hadith_toc WHERE ${countConditions.join(' AND ')}`,
    countParams
  )

  return NextResponse.json({
    results: await attachSnippets(rows, booleanTerms),
    total: countResult.rows[0].total,
    // The original app's result list shows hadith rows only — rows without a printed hadith
    // number (book introductions and the like) are matched but never listed. `total` counts
    // every match (what this API returns), `total_hadiths` counts what the original would have
    // listed, so parity against the legacy app is measurable at any result size.
    total_hadiths: countResult.rows[0].hadiths,
    page,
    limit,
    mode: 'text',
    search_scope: searchScope,
    match: matchMode,
  })
}
