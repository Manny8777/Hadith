import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const aId = parseInt(searchParams.get('a') || '')
  const bId = parseInt(searchParams.get('b') || '')
  const mode = searchParams.get('mode') || 'disagree'
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const limit = 20
  const offset = (page - 1) * limit

  if (isNaN(aId) || isNaN(bId) || aId === bId) {
    return NextResponse.json({ error: 'invalid ids' }, { status: 400 })
  }

  // Stats: count agreement/disagreement breakdown
  const statsRes = await pool.query(
    `WITH shared AS (
       SELECT ja.hadith_id,
              CASE WHEN ja.say_text ~* 'صحيح' THEN 'صحيح'
                   WHEN ja.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND ja.say_text !~* 'صحيح' THEN 'حسن'
                   WHEN ja.say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
                   ELSE NULL END AS grade_a,
              CASE WHEN jb.say_text ~* 'صحيح' THEN 'صحيح'
                   WHEN jb.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND jb.say_text !~* 'صحيح' THEN 'حسن'
                   WHEN jb.say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
                   ELSE NULL END AS grade_b
       FROM hadith_judgments ja
       JOIN hadith_judgments jb ON jb.hadith_id = ja.hadith_id AND jb.scientist_id = $2
       WHERE ja.scientist_id = $1
     )
     SELECT
       COUNT(*)::int AS total_shared,
       COUNT(*) FILTER (WHERE grade_a = grade_b AND grade_a IS NOT NULL)::int AS agree,
       COUNT(*) FILTER (WHERE grade_a = 'صحيح' AND grade_b = 'صحيح')::int AS both_sahih,
       COUNT(*) FILTER (WHERE grade_a = 'حسن' AND grade_b = 'حسن')::int AS both_hasan,
       COUNT(*) FILTER (WHERE grade_a = 'ضعيف' AND grade_b = 'ضعيف')::int AS both_daif,
       COUNT(*) FILTER (WHERE grade_a = 'صحيح' AND grade_b = 'ضعيف')::int AS a_sahih_b_daif,
       COUNT(*) FILTER (WHERE grade_b = 'صحيح' AND grade_a = 'ضعيف')::int AS b_sahih_a_daif,
       COUNT(*) FILTER (WHERE grade_a = 'صحيح' AND grade_b = 'حسن')::int AS a_sahih_b_hasan,
       COUNT(*) FILTER (WHERE grade_a != grade_b AND grade_a IS NOT NULL AND grade_b IS NOT NULL
                        AND NOT (grade_a = 'صحيح' AND grade_b = 'ضعيف')
                        AND NOT (grade_b = 'صحيح' AND grade_a = 'ضعيف')
                        AND NOT (grade_a = 'صحيح' AND grade_b = 'حسن'))::int AS other_disagree
     FROM shared`,
    [aId, bId]
  ).catch(() => ({ rows: [{ total_shared: 0, agree: 0, both_sahih: 0, both_hasan: 0, both_daif: 0, a_sahih_b_daif: 0, b_sahih_a_daif: 0, a_sahih_b_hasan: 0, other_disagree: 0 }] }))

  const stats = statsRes.rows[0]

  // Build mode clause
  let modeClause = ''
  if (mode === 'disagree') {
    modeClause = `AND grade_a IS DISTINCT FROM grade_b AND grade_a IS NOT NULL AND grade_b IS NOT NULL`
  } else if (mode === 'agree') {
    modeClause = `AND grade_a = grade_b AND grade_a IS NOT NULL`
  }

  // Count for pagination
  const countRes = await pool.query<{ cnt: number }>(
    `SELECT COUNT(*)::int AS cnt FROM (
       SELECT ja.hadith_id,
              CASE WHEN ja.say_text ~* 'صحيح' THEN 'صحيح'
                   WHEN ja.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND ja.say_text !~* 'صحيح' THEN 'حسن'
                   WHEN ja.say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
                   ELSE NULL END AS grade_a,
              CASE WHEN jb.say_text ~* 'صحيح' THEN 'صحيح'
                   WHEN jb.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND jb.say_text !~* 'صحيح' THEN 'حسن'
                   WHEN jb.say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
                   ELSE NULL END AS grade_b
       FROM hadith_judgments ja
       JOIN hadith_judgments jb ON jb.hadith_id = ja.hadith_id AND jb.scientist_id = $2
       WHERE ja.scientist_id = $1
     ) sub
     WHERE 1=1 ${modeClause}`,
    [aId, bId]
  ).catch(() => ({ rows: [{ cnt: 0 }] }))

  const total = countRes.rows[0]?.cnt || 0

  // Main results
  const resultsRes = await pool.query(
    `SELECT sub.hadith_id, sub.grade_a, sub.grade_b, sub.a_text, sub.b_text,
            regexp_replace(ht.tarf, '<[^>]+>', ' ', 'g') AS tarf,
            b.title AS book_title
     FROM (
       SELECT ja.hadith_id, ja.say_text AS a_text, jb.say_text AS b_text,
              CASE WHEN ja.say_text ~* 'صحيح' THEN 'صحيح'
                   WHEN ja.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND ja.say_text !~* 'صحيح' THEN 'حسن'
                   WHEN ja.say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
                   ELSE NULL END AS grade_a,
              CASE WHEN jb.say_text ~* 'صحيح' THEN 'صحيح'
                   WHEN jb.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND jb.say_text !~* 'صحيح' THEN 'حسن'
                   WHEN jb.say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
                   ELSE NULL END AS grade_b
       FROM hadith_judgments ja
       JOIN hadith_judgments jb ON jb.hadith_id = ja.hadith_id AND jb.scientist_id = $2
       WHERE ja.scientist_id = $1
     ) sub
     JOIN hadith_toc ht ON ht.main_id = sub.hadith_id
     JOIN books b ON b.id = ht.book_id
     WHERE 1=1 ${modeClause}
     ORDER BY
       CASE WHEN sub.grade_a = 'صحيح' AND sub.grade_b = 'ضعيف' THEN 1
            WHEN sub.grade_b = 'صحيح' AND sub.grade_a = 'ضعيف' THEN 2
            WHEN sub.grade_a != sub.grade_b THEN 3
            ELSE 4 END,
       sub.hadith_id
     LIMIT $3 OFFSET $4`,
    [aId, bId, limit, offset]
  ).catch(() => ({ rows: [] }))

  return NextResponse.json({
    results: resultsRes.rows,
    stats,
    total,
    page,
    limit,
  })
}
