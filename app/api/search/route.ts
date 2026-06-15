import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  const page = parseInt(searchParams.get('page') || '1')
  const bookIdParam = searchParams.get('book_id')
  const bookId = bookIdParam ? parseInt(bookIdParam) : null
  const narratorIdParam = searchParams.get('narrator_id')
  const narratorId = narratorIdParam ? parseInt(narratorIdParam) : null
  const gradeFilter = searchParams.get('grade') || '' // 'sahih'|'hasan'|'daif'|''
  const subjectCatIdParam = searchParams.get('subject_cat_id')
  const subjectCatId = subjectCatIdParam ? parseInt(subjectCatIdParam) : null
  const maxDepthParam = searchParams.get('max_depth')
  const maxDepth = maxDepthParam ? parseInt(maxDepthParam) : null
  // search_scope: 'tarf' = أطراف فقط, 'both' (default) = متن + أطراف
  const searchScope = searchParams.get('search_scope') === 'tarf' ? 'tarf' : 'both'
  const limit = 20
  const offset = (page - 1) * limit

  // Helper: build the text-match SQL expression based on scope
  // 'tarf' searches only the hadith opening; 'both' also searches full content
  function textMatchExpr(tarfAlias: string, contentAlias: string): string {
    if (searchScope === 'tarf') {
      return `to_tsvector('simple', normalize_hadith(coalesce(${tarfAlias},''))) @@ plainto_tsquery('simple', normalize_hadith($1))`
    }
    return `(
      to_tsvector('simple', normalize_hadith(coalesce(${tarfAlias},''))) @@ plainto_tsquery('simple', normalize_hadith($1))
      OR to_tsvector('simple', normalize_hadith(coalesce(${contentAlias},''))) @@ plainto_tsquery('simple', normalize_hadith($1))
    )`
  }

  // Combined narrator + text search
  if (narratorId !== null && !isNaN(narratorId) && q && q.length >= 2) {
    let gradeExistsClause2 = ''
    if (gradeFilter === 'sahih') gradeExistsClause2 = `AND EXISTS (SELECT 1 FROM hadith_judgments j WHERE j.hadith_id = ht.main_id AND j.say_text ~* 'صحيح')`
    else if (gradeFilter === 'hasan') gradeExistsClause2 = `AND EXISTS (SELECT 1 FROM hadith_judgments j WHERE j.hadith_id = ht.main_id AND j.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND j.say_text !~* 'صحيح')`
    else if (gradeFilter === 'daif') gradeExistsClause2 = `AND EXISTS (SELECT 1 FROM hadith_judgments j WHERE j.hadith_id = ht.main_id AND j.say_text ~* 'ضعيف|منكر|متروك|موضوع')`

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
           SELECT CASE
             WHEN say_text ~* 'صحيح' THEN 'صحيح'
             WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح' THEN 'حسن'
             WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
             ELSE NULL END as grade_hint
           FROM hadith_judgments j2
           WHERE j2.hadith_id = ht.main_id
             AND (j2.say_text ~* 'صحيح|إسناده حسن|حديث حسن|سنده حسن|ضعيف|منكر|متروك')
           ORDER BY CASE
             WHEN j2.say_text ~* 'صحيح' THEN 1
             WHEN j2.say_text ~* 'حسن' THEN 2
             WHEN j2.say_text ~* 'ضعيف|منكر|متروك' THEN 3
             ELSE 4 END
           LIMIT 1
         ) jg ON true
         WHERE ic.narrator_id_array @> ARRAY[$1::integer]
           AND ht.is_leaf = true
           AND ${textMatchExpr('ht.tarf', 'ht.content').replace(/\$1/g, '$2')}
           ${gradeExistsClause2}
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
           AND ${textMatchExpr('ht.tarf', 'ht.content').replace(/\$1/g, '$2')}
           ${gradeExistsClause2}`,
        [narratorId, q]
      ),
    ])
    return NextResponse.json({
      results: hadithsRes.rows,
      total: parseInt(countRes.rows[0]?.cnt || '0'),
      page,
      limit,
      mode: 'narrator+text',
    })
  }

  // Narrator-only isnad search mode
  if (narratorId !== null && !isNaN(narratorId)) {
    let gradeExistsClause = ''
    if (gradeFilter === 'sahih') {
      gradeExistsClause = `AND EXISTS (SELECT 1 FROM hadith_judgments j WHERE j.hadith_id = ht.main_id AND j.say_text ~* 'صحيح|صحح|حسن صحيح')`
    } else if (gradeFilter === 'hasan') {
      gradeExistsClause = `AND EXISTS (SELECT 1 FROM hadith_judgments j WHERE j.hadith_id = ht.main_id AND j.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND j.say_text !~* 'صحيح')`
    } else if (gradeFilter === 'daif') {
      gradeExistsClause = `AND EXISTS (SELECT 1 FROM hadith_judgments j WHERE j.hadith_id = ht.main_id AND j.say_text ~* 'ضعيف|ضعفه|منكر|متروك|موضوع')`
    }

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
           SELECT CASE
             WHEN say_text ~* 'صحيح' THEN 'صحيح'
             WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح' THEN 'حسن'
             WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
             ELSE NULL END as grade_hint
           FROM hadith_judgments j2
           WHERE j2.hadith_id = ht.main_id
             AND (j2.say_text ~* 'صحيح|إسناده حسن|حديث حسن|سنده حسن|ضعيف|منكر|متروك')
           ORDER BY CASE
             WHEN j2.say_text ~* 'صحيح' THEN 1
             WHEN j2.say_text ~* 'حسن' THEN 2
             WHEN j2.say_text ~* 'ضعيف|منكر|متروك' THEN 3
             ELSE 4 END
           LIMIT 1
         ) jg ON true
         WHERE ic.narrator_id_array @> ARRAY[$1::integer]
           AND ht.is_leaf = true
           ${gradeExistsClause}
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
           ${gradeExistsClause}`,
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

  if (bookId !== null && !isNaN(bookId)) {
    conditions.push(`h.book_id = $${paramIdx}`)
    params.push(bookId)
    paramIdx++
  }

  if (subjectCatId !== null && !isNaN(subjectCatId)) {
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

  if (maxDepth !== null && !isNaN(maxDepth) && maxDepth > 0) {
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

  if (gradeFilter === 'sahih') {
    conditions.push(`EXISTS (SELECT 1 FROM hadith_judgments j WHERE j.hadith_id = h.main_id AND j.say_text ~* 'صحيح|صحح|حسن صحيح')`)
  } else if (gradeFilter === 'hasan') {
    conditions.push(`EXISTS (SELECT 1 FROM hadith_judgments j WHERE j.hadith_id = h.main_id AND j.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND j.say_text !~* 'صحيح')`)
  } else if (gradeFilter === 'daif') {
    conditions.push(`EXISTS (SELECT 1 FROM hadith_judgments j WHERE j.hadith_id = h.main_id AND j.say_text ~* 'ضعيف|ضعفه|منكر|متروك|موضوع')`)
  }

  const whereClause = conditions.join(' AND ')

  const { rows } = await pool.query(
    `SELECT h.main_id, h.book_id, b.title AS book_name, h.tarf,
            h.section_text, h.chapter_text, h.part_num, h.page_num,
            h.tarqeem_harf, h.tarqeem_matboa1,
            ts_rank(to_tsvector('simple', normalize_hadith(coalesce(h.tarf,''))),
                    plainto_tsquery('simple', normalize_hadith($1))) AS rank,
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
       SELECT CASE
         WHEN say_text ~* 'صحيح' THEN 'صحيح'
         WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' THEN 'حسن'
         WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
         ELSE NULL END as grade_hint
       FROM hadith_judgments j2
       WHERE j2.hadith_id = h.main_id
         AND (j2.say_text ~* 'صحيح|إسناده حسن|حديث حسن|سنده حسن|ضعيف|منكر|متروك')
       ORDER BY CASE
         WHEN j2.say_text ~* 'صحيح' THEN 1
         WHEN j2.say_text ~* 'حسن' THEN 2
         WHEN j2.say_text ~* 'ضعيف|منكر|متروك' THEN 3
         ELSE 4 END
       LIMIT 1
     ) jg ON true
     WHERE ${whereClause}
     ORDER BY rank DESC
     LIMIT $2 OFFSET $3`,
    params
  )

  const textMatchCount = textMatchExpr('tarf', 'content')
  const countParams: (string | number)[] = [q]
  const countConditions: string[] = ['is_leaf = true', textMatchCount]
  let countParamIdx = 2

  if (bookId !== null && !isNaN(bookId)) {
    countConditions.push(`book_id = $${countParamIdx}`)
    countParams.push(bookId)
    countParamIdx++
  }

  if (subjectCatId !== null && !isNaN(subjectCatId)) {
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

  if (maxDepth !== null && !isNaN(maxDepth) && maxDepth > 0) {
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

  if (gradeFilter === 'sahih') {
    countConditions.push(`EXISTS (SELECT 1 FROM hadith_judgments j WHERE j.hadith_id = main_id AND j.say_text ~* 'صحيح|صحح|حسن صحيح')`)
  } else if (gradeFilter === 'hasan') {
    countConditions.push(`EXISTS (SELECT 1 FROM hadith_judgments j WHERE j.hadith_id = main_id AND j.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND j.say_text !~* 'صحيح')`)
  } else if (gradeFilter === 'daif') {
    countConditions.push(`EXISTS (SELECT 1 FROM hadith_judgments j WHERE j.hadith_id = main_id AND j.say_text ~* 'ضعيف|ضعفه|منكر|متروك|موضوع')`)
  }

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
  })
}
