import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() || ''

  const whereClause = q.length >= 2 ? `AND (n.name ILIKE $1 OR n.abb_name ILIKE $1)` : ''
  const params = q.length >= 2 ? [`%${q}%`] : []

  const { rows } = await pool.query(
    `SELECT
       j.scientist_id,
       COALESCE(n.abb_name, n.name) AS name,
       n.death_year_num AS death_year,
       COUNT(*)::int AS total_judgments,
       COUNT(CASE WHEN j.say_text ~* 'صحيح' THEN 1 END)::int AS sahih_count,
       COUNT(CASE WHEN j.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND j.say_text !~* 'صحيح' THEN 1 END)::int AS hasan_count,
       COUNT(CASE WHEN j.say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 1 END)::int AS daif_count
     FROM hadith_judgments j
     JOIN narrators n ON n.id = j.scientist_id
     WHERE j.scientist_id IS NOT NULL ${whereClause}
     GROUP BY j.scientist_id, n.abb_name, n.name, n.death_year_num
     ORDER BY total_judgments DESC
     LIMIT 100`,
    params
  )

  return NextResponse.json(rows)
}
