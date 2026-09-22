import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { ANY_GRADE, gradeExistsClause, gradeHintCase, normalizeGrade } from '@/lib/searchGrades'

export const dynamic = 'force-dynamic'

type MatchMode = 'all' | 'any' | 'phrase'

function parseMatch(raw: string | null): MatchMode {
  const m = (raw ?? '').trim().toLowerCase()
  return m === 'any' || m === 'phrase' ? m : 'all'
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

  // Helper: build the text-match SQL expression based on scope and match mode.
  // Scope `both` stays an OR of the two tsvector predicates so the planner can combine
  // idx_hadith_toc_tarf_norm with the stripped-content index (a concatenated document would
  // have no matching index and would full-scan 339k rows).
  function textMatchExpr(tarfAlias: string, contentAlias: string, param = '$1'): string {
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
      results: hadithsRes.rows,
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
    `SELECT COUNT(*) FROM hadith_toc WHERE ${countConditions.join(' AND ')}`,
    countParams
  )

  return NextResponse.json({
    results: rows,
    total: parseInt(countResult.rows[0].count),
    page,
    limit,
    mode: 'text',
    search_scope: searchScope,
    match: matchMode,
  })
}
