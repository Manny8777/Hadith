import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const limit = 20
  const offset = (page - 1) * limit

  const idsRaw = searchParams.get('narrator_ids')
  const narratorIds = idsRaw
    ? idsRaw.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0)
    : []

  if (narratorIds.length < 1 || narratorIds.length > 5) {
    return NextResponse.json({ error: 'حد الأقصى 5 رواة', results: [], total: 0 })
  }
  const gradeFilter = searchParams.get('grade') || '' // '' | 'sahih' | 'hasan' | 'daif'

  // Same grade logic as /api/search
  let gradeClause = ''
  if (gradeFilter === 'sahih') {
    gradeClause = `AND EXISTS (SELECT 1 FROM hadith_judgments j WHERE j.hadith_id = ht.main_id AND j.say_text ~* 'صحيح')`
  } else if (gradeFilter === 'hasan') {
    gradeClause = `AND EXISTS (SELECT 1 FROM hadith_judgments j WHERE j.hadith_id = ht.main_id AND j.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND j.say_text !~* 'صحيح')`
  } else if (gradeFilter === 'daif') {
    gradeClause = `AND EXISTS (SELECT 1 FROM hadith_judgments j WHERE j.hadith_id = ht.main_id AND j.say_text ~* 'ضعيف|منكر|متروك|موضوع')`
  }

  // Consecutiveness: for the builder to be a true chain search, each pair of
  // selected narrators must appear back-to-back in the chain (not just both present).
  let consecClause = ''
  if (narratorIds.length > 1) {
    const pairClauses = []
    for (let k = 0; k < narratorIds.length - 1; k++) {
      const ai = k + 1
      const bi = k + 2
      pairClauses.push(
        `AND array_position(ic.narrator_id_array, $${ai}::integer) IS NOT NULL ` +
        `AND array_position(ic.narrator_id_array, $${bi}::integer) = array_position(ic.narrator_id_array, $${ai}::integer) + 1`
      )
    }
    consecClause = '\n      ' + pairClauses.join('\n      ')
  }

  // Build ARRAY literal for the GIN @> containment check
  const arrayLiteral = `ARRAY[${narratorIds.map((_, i) => `$${i + 1}::integer`).join(', ')}]`
  const limitParam = `$${narratorIds.length + 1}`
  const offsetParam = `$${narratorIds.length + 2}`
  const params = [...narratorIds, limit, offset]

  const { rows } = await pool.query(
    `SELECT DISTINCT ht.main_id, ht.book_id, b.title as book_name, ht.tarf,
            ht.section_text, ht.chapter_text, ht.part_num, ht.page_num,
            ht.tarqeem_harf, ht.tarqeem_matboa1,
            jg.grade_hint,
            par.parallel_count
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
     LEFT JOIN LATERAL (
       SELECT COUNT(DISTINCT t2.hadith_id)::int - 1 AS parallel_count
       FROM takhrij t1
       JOIN takhrij t2 ON t2.group_id = t1.group_id
       WHERE t1.hadith_id = ht.main_id
     ) par ON true
     WHERE ic.narrator_id_array @> ${arrayLiteral}
       AND ht.is_leaf = true
       ${gradeClause}
       ${consecClause}
     ORDER BY ht.book_id, ht.main_id
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params
  )

  const countParams = [...narratorIds]
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(DISTINCT iha.hadith_id)::text as cnt
     FROM isnad_hadiths iha
     JOIN isnad_chains ic ON iha.isnad_id = ic.id
     JOIN hadith_toc ht ON iha.hadith_id = ht.main_id
     WHERE ic.narrator_id_array @> ${arrayLiteral}
       AND ht.is_leaf = true
       ${gradeClause}
       ${consecClause}`,
    countParams
  )

  return NextResponse.json({
    results: rows,
    total: parseInt(countRows[0]?.cnt || '0'),
    page,
    limit,
  })
}
