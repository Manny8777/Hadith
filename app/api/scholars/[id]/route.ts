import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const scientistId = parseInt(id)
  if (isNaN(scientistId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const grade = searchParams.get('grade') || '' // 'sahih'|'hasan'|'daif'|''
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const limit = 30
  const offset = (page - 1) * limit

  // Scientist info
  const sciRes = await pool.query(
    `SELECT id, COALESCE(abb_name, name) AS name, death_year_num AS death_year, martaba_ibn_hajar, hadiths_count
     FROM narrators WHERE id = $1`,
    [scientistId]
  )
  if (!sciRes.rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const scientist = sciRes.rows[0]

  // Build grade condition
  let gradeCondition = ''
  if (grade === 'sahih') gradeCondition = `AND j.say_text ~* 'صحيح'`
  else if (grade === 'hasan') gradeCondition = `AND j.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND j.say_text !~* 'صحيح'`
  else if (grade === 'daif') gradeCondition = `AND j.say_text ~* 'ضعيف|منكر|متروك|موضوع'`

  const [judgmentsRes, countRes, summaryRes] = await Promise.all([
    pool.query(
      `SELECT
         j.hadith_id,
         j.say_text,
         ht.tarf,
         b.title AS book_title,
         ht.part_num,
         ht.page_num,
         ht.tarqeem_harf,
         ht.tarqeem_matboa1,
         CASE
           WHEN j.say_text ~* 'صحيح' THEN 'صحيح'
           WHEN j.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND j.say_text !~* 'صحيح' THEN 'حسن'
           WHEN j.say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
           ELSE NULL
         END AS grade_class
       FROM hadith_judgments j
       JOIN hadith_toc ht ON ht.main_id = j.hadith_id
       JOIN books b ON b.id = ht.book_id
       WHERE j.scientist_id = $1 ${gradeCondition}
       ORDER BY b.id, j.hadith_id
       LIMIT $2 OFFSET $3`,
      [scientistId, limit, offset]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS cnt
       FROM hadith_judgments j
       WHERE j.scientist_id = $1 ${gradeCondition}`,
      [scientistId]
    ),
    pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(CASE WHEN say_text ~* 'صحيح' THEN 1 END)::int AS sahih,
         COUNT(CASE WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح' THEN 1 END)::int AS hasan,
         COUNT(CASE WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 1 END)::int AS daif
       FROM hadith_judgments
       WHERE scientist_id = $1`,
      [scientistId]
    ),
  ])

  return NextResponse.json({
    scientist,
    judgments: judgmentsRes.rows,
    total: countRes.rows[0]?.cnt || 0,
    summary: summaryRes.rows[0],
    page,
    limit,
  })
}
