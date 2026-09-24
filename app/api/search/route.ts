import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { ANY_GRADE, gradeExistsClause, gradeHintCase, normalizeGrade } from '@/lib/searchGrades'
import { attachMatnSnippets, snipColumns } from '@/lib/matnSnippet'

export const dynamic = 'force-dynamic'

type MatchMode = 'all' | 'any' | 'phrase'

const MIN_QUERY_LENGTH = 2
const MAX_PAGE_SIZE = 100
const POSTGRES_INT_MAX = 2_147_483_647

// Requiring a Unicode letter or number keeps punctuation-only and wildcard-only requests out of
// FTS/regex SQL. Normalization cannot turn punctuation or a wildcard into searchable text, so this
// guard deliberately does not duplicate the database's normalize_hadith() implementation.
function hasSearchableText(value: string): boolean {
  return /[\p{L}\p{N}]/u.test(value)
}

// Keep wildcard literals expression-identical to normalize_hadith(): tashkeel is removed first, then
// أ/إ/آ, ة, and ى are folded to ا, ه, and ي. Wildcard characters stay intact until regex expansion.
function normalizeForWildcard(term: string): string {
  return term
    .replace(/[\u064B-\u065F\u0670\u0671]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
}

// Unknown/blank/malformed numeric values are ignored. Pagination accepts only complete integer text
// and is then clamped by the caller; filter IDs must additionally be positive.
function parseIntParam(
  raw: string | null,
  { positive = false }: { positive?: boolean } = {},
): number | null {
  const value = raw?.trim() ?? ''
  if (!value || !/^[+-]?\d+$/.test(value)) return null
  const n = Number(value)
  if (!Number.isSafeInteger(n) || Math.abs(n) > POSTGRES_INT_MAX) return null
  return positive && n <= 0 ? null : n
}

// '*' = any run of characters, '?' = one character, matched against whole words of normalized text.
// Normalize literal characters before escaping so regex terms use the same Arabic forms as indexed
// text; keep * and ? intact until wildcard expansion.
function wildcardToRegex(term: string): string | null {
  if (!/[*?]/.test(term)) return null
  const normalized = normalizeForWildcard(term)
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, (ch) => (ch === '*' || ch === '?' ? ch : `\\${ch}`))
  const body = escaped.replace(/\*/g, '[^ ]*').replace(/\?/g, '.')
  return `(^| )${body}( |$)`
}

function parseMatch(raw: string | null): MatchMode {
  const m = (raw ?? '').trim().toLowerCase()
  // Default = the original search dialog's default: متتالية, i.e. the same words adjacent and in
  // order. Verified against the legacy engine (legacy-audit/09-search-parity-a1.md): this mode and
  // the original's bare `field = '<phrase>'` agree exactly — 'الحمد لله' -> 1,207 rows on both.
  return m === 'any' || m === 'all' ? m : 'phrase'
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''

  const page = Math.max(1, parseIntParam(searchParams.get('page')) ?? 1)
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseIntParam(searchParams.get('limit')) ?? 20))
  const bookId = parseIntParam(searchParams.get('book_id'), { positive: true })
  const narratorId = parseIntParam(searchParams.get('narrator_id'), { positive: true })
  const subjectCatId = parseIntParam(searchParams.get('subject_cat_id'), { positive: true })
  const maxDepth = parseIntParam(searchParams.get('max_depth'), { positive: true })
  const gradeFilter = normalizeGrade(searchParams.get('grade') as string | null)
  // search_scope: 'tarf' = أطراف فقط, 'both' (default) = متن + أطراف
  const searchScope = (searchParams.get('search_scope') ?? '').trim().toLowerCase() === 'tarf' ? 'tarf' : 'both'
  // match: 'all' (default, all words) | 'any' (أي من الكلمات) | 'phrase' (متتالية)
  const matchMode = parseMatch(searchParams.get('match'))
  // src=service -> الكتب الخدمية (the 212 books with no hadiths of their own). The original offers
  // both catalogues from the same dialog; the web only ever searched the 33 hadith books.
  const bookSource = (searchParams.get('src') ?? '').trim().toLowerCase() === 'service' ? 'service' : 'hadith'
  const offset = (page - 1) * limit
  const emptyMode = narratorId !== null ? 'narrator+text' : bookSource === 'service' ? 'service' : 'text'
  const emptySearchResponse = () => NextResponse.json({
    results: [],
    total: 0,
    total_hadiths: 0,
    page,
    limit,
    mode: emptyMode,
    ...(bookSource === 'service' ? { source: 'service' } : {}),
    search_scope: searchScope,
    match: matchMode,
  })

  // The stored `content` is marked-up text (<متن>, <سند>, <رقم_حديث نوع="مطبوع">, hidden
  // matn in attributes such as نص="…"). The legacy engine indexes element text only — tag
  // and attribute text is NOT searchable — and indexing markup made the same query return
  // extra rows (e.g. markup-only hits: ربط 276k vs 11 in tarf). Strip tags before indexing.
  // Kept expression-identical to the GIN index in db/add_visible_text_index.js so the index
  // is actually used (a wrapper that does not match an index forces a full table scan).
  const visibleText = (alias: string): string => `regexp_replace(coalesce(${alias},''), '<[^>]*>', ' ', 'g')`

  const visibleMatch = (contentAlias: string, param: string): string =>
    `to_tsvector('simple', normalize_hadith(${visibleText(contentAlias)})) @@ ${queryExpr(param)}`

  // Ranking uses the short tarf document rather than rebuilding tarf+content for
  // every matching row. The GIN predicates below still search the full visible text,
  // so result membership and exact totals are unchanged; this only makes ordering
  // deterministic and avoids turning ranking into a second full-text scan. The
  // service corpus showed the difference clearly: ranking concatenated documents
  // measured 16.5s for one page, while tarf-only ranking measured under 1s.
  const searchRankDoc = (tarfAlias: string): string => `coalesce(${tarfAlias},'')`

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

  // One term's match expression. A trailing-only wildcard ('صلا*') can go through the tsquery
  // prefix operator, which the GIN index serves; any other position falls back to a regex over the
  // normalised text (no index — noted in the audit as the cost of mid-word wildcards).
  function termMatchExpr(t: BoolTerm, tarfAlias: string, contentAlias: string): string {
    const prefix = normalizeForWildcard(t.term.slice(0, -1).trim())
    const trailingOnly = t.regex !== null && /^[^*?]*\*$/.test(t.term) && hasSearchableText(prefix)
    if (trailingOnly) {
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

  // Supported Boolean grammar: whitespace-delimited connectives are applied strictly left to right;
  // there are deliberately no precedence rules or user parentheses. XOR means exactly one of its
  // current left-hand result and the next term. Keep this behavior stable until legacy evidence
  // supports a different grammar.
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

  // The existing left-to-right composer intentionally defines the supported grammar; this route does
  // not add precedence or parentheses. Validate parsed search terms, rather than the whole raw string,
  // so a query such as `* OR *` is still recognized as wildcard-only. With no searchable term (for
  // example `*`, `**`, `!?`, or punctuation-only text), return the documented empty shape before any
  // SQL is built. One-character Arabic/English terms retain the existing two-character minimum.
  const booleanTerms = q ? parseQueryTerms(q) : []
  const hasSearchableTextQuery = booleanTerms.some(t => hasSearchableText(t.term))
  const hasValidTextQuery = hasSearchableTextQuery && q.length >= MIN_QUERY_LENGTH
  if (q && !hasSearchableTextQuery) return emptySearchResponse()

  const useBoolean = booleanTerms.length > 1
    || (booleanTerms.length === 1 && (booleanTerms[0].regex !== null || booleanTerms[0].conn === 'NOT'))

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
  if (narratorId !== null && hasValidTextQuery) {
    const gradeExistsClause2 = gradeExistsClause(gradeFilter, 'ht.main_id')

    const [hadithsRes, countRes] = await Promise.all([
      pool.query(
        `WITH paged_narrator_hadiths AS MATERIALIZED (
           SELECT DISTINCT ht.main_id, ht.book_id
           FROM isnad_hadiths iha
           JOIN isnad_chains ic ON iha.isnad_id = ic.id
           JOIN hadith_toc ht ON iha.hadith_id = ht.main_id
           WHERE ic.narrator_id_array @> ARRAY[$1::integer]
             AND ht.is_leaf = true
             AND ${textMatchExpr('ht.tarf', 'ht.content', '$2')}
             ${gradeExistsClause2 ? 'AND ' + gradeExistsClause2 : ''}
           ORDER BY ht.book_id, ht.main_id
           LIMIT $3 OFFSET $4
         )
         SELECT page.main_id, ht.book_id, b.title as book_name, ht.tarf,
                ht.section_text, ht.chapter_text, ht.part_num, ht.page_num,
                ht.tarqeem_harf, ht.tarqeem_matboa1,
                ${snipColumns('ht.content')},
                jg.grade_hint
         FROM paged_narrator_hadiths page
         JOIN hadith_toc ht ON ht.main_id = page.main_id
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
         ORDER BY ht.book_id, page.main_id`,
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
      results: await attachMatnSnippets(hadithsRes.rows, booleanTerms.map(t => t.term)),
      total: parseInt(countRes.rows[0]?.cnt || '0'),
      page,
      limit,
      mode: 'narrator+text',
      search_scope: searchScope,
      match: matchMode,
    })
  }

  // Narrator-only isnad search mode. A supplied but invalid narrator ID is ignored rather than
  // passed to integer SQL; the established no-query empty response is preserved.
  if (narratorId !== null) {
    const gradeExists = gradeExistsClause(gradeFilter, 'ht.main_id')

    const [hadithsRes, countRes] = await Promise.all([
      pool.query(
        `WITH paged_narrator_hadiths AS MATERIALIZED (
           SELECT DISTINCT ht.main_id, ht.book_id
           FROM isnad_hadiths iha
           JOIN isnad_chains ic ON iha.isnad_id = ic.id
           JOIN hadith_toc ht ON iha.hadith_id = ht.main_id
           WHERE ic.narrator_id_array @> ARRAY[$1::integer]
             AND ht.is_leaf = true
             ${gradeExists ? 'AND ' + gradeExists : ''}
           ORDER BY ht.book_id, ht.main_id
           LIMIT $2 OFFSET $3
         )
         SELECT page.main_id, ht.book_id, b.title as book_name, ht.tarf,
                ht.section_text, ht.chapter_text, ht.part_num, ht.page_num,
                ht.tarqeem_harf, ht.tarqeem_matboa1,
                jg.grade_hint
         FROM paged_narrator_hadiths page
         JOIN hadith_toc ht ON ht.main_id = page.main_id
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
         ORDER BY ht.book_id, page.main_id`,
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

  if (!hasValidTextQuery) return emptySearchResponse()

  // ---- الكتب الخدمية (service books) -----------------------------------------------------------
  // Shuruh, biographies, jarh wa-ta'dil, place names: 212 books, 600,575 leaf rows, searched from the
  // same dialog in the original (its كتب الحديث / الكتب الخدمية checkboxes). The web could not: those
  // books are in the picker but every search returned nothing. The predicates are shared with the
  // hadith branch verbatim by aliasing the table as h; chain, grade and subject filters do not apply.
  if (bookSource === 'service') {
    // Ranking and LIMIT require reading the matching service rows, but snippets should only be built
    // for the requested page. The materialized CTE is the intentional planner boundary: expensive
    // rank/order work finishes before any display text is selected.

    const conditions = ['h.is_leaf = true', textMatchExpr('h.tarf', 'h.content')]
    const serviceParams: (string | number)[] = [q, limit, offset]
    let serviceParamIdx = 4
    if (bookId !== null) {
      conditions.push(`h.book_id = $${serviceParamIdx}`)
      serviceParams.push(bookId)
      serviceParamIdx++
    }

    const serviceCountConditions = ['is_leaf = true', textMatchExpr('tarf', 'content')]
    const serviceCountParams: (string | number)[] = [q]
    if (bookId !== null) {
      serviceCountConditions.push('book_id = $2')
      serviceCountParams.push(bookId)
    }

    const [serviceRes, serviceCountRes] = await Promise.all([
      pool.query(
        `WITH paged_service_content AS MATERIALIZED (
           SELECT h.id, h.book_id,
                  ts_rank(to_tsvector('simple', normalize_hadith(${searchRankDoc('h.tarf')})),
                          ${queryExpr('$1')}) AS rank
           FROM hadith_service_content h
           WHERE ${conditions.join(' AND ')}
           ORDER BY rank DESC, h.book_id, h.id
           LIMIT $2 OFFSET $3
         )
         SELECT page.id AS main_id, h.book_id, h.book_name, h.tarf, h.section_text,
                h.part_num, h.page_num,
                ${snipColumns('h.content')},
                'service' AS result_kind,
                page.rank
         FROM paged_service_content page
         JOIN hadith_service_content h ON h.id = page.id
         ORDER BY page.rank DESC, page.book_id, page.id`,
        serviceParams
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM hadith_service_content WHERE ${serviceCountConditions.join(' AND ')}`,
        serviceCountParams
      ),
    ])

    return NextResponse.json({
      results: await attachMatnSnippets(serviceRes.rows, booleanTerms.map(t => t.term)),
      total: serviceCountRes.rows[0].total,
      total_hadiths: serviceCountRes.rows[0].total,
      page,
      limit,
      mode: 'service',
      source: 'service',
      search_scope: searchScope,
      match: matchMode,
    })
  }

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

  // Do not let the optimizer pull snippets or lateral enrichment back into the matching stage.
  // MATERIALIZED makes the ID/rank boundary explicit, so only LIMIT-sized rows are enriched.
  const dataQuery = pool.query(
    `WITH paged_hadiths AS MATERIALIZED (
       SELECT h.main_id,
              ts_rank(to_tsvector('simple', normalize_hadith(${searchRankDoc('h.tarf')})),
                      ${queryExpr('$1')}) AS rank
       FROM hadith_toc h
       WHERE ${whereClause}
       ORDER BY rank DESC, h.main_id ASC
       LIMIT $2 OFFSET $3
     )
     SELECT h.main_id, h.book_id, b.title AS book_name, h.tarf,
            h.section_text, h.chapter_text, h.part_num, h.page_num,
            h.tarqeem_harf, h.tarqeem_matboa1,
            ${snipColumns('h.content')},
            page.rank,
            jg.grade_hint,
            par.parallel_count
     FROM paged_hadiths page
     JOIN hadith_toc h ON h.main_id = page.main_id
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
     ORDER BY page.rank DESC, page.main_id ASC`,
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

  const countQuery = pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE btrim(coalesce(tarqeem_matboa1, '')) <> '')::int AS hadiths
     FROM hadith_toc WHERE ${countConditions.join(' AND ')}`,
    countParams
  )

  // Keep the independent exact data/count statements concurrent. No safe pool-pressure reduction was
  // measurable locally, so the pool maximum and existing 30-second database timeout remain unchanged;
  // count errors still fail the request rather than returning an invented total. A post-deploy
  // production smoke must confirm latency and pool headroom before changing this concurrency choice.
  const [{ rows }, countResult] = await Promise.all([dataQuery, countQuery])

  return NextResponse.json({
    results: await attachMatnSnippets(rows, booleanTerms.map(t => t.term)),
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
