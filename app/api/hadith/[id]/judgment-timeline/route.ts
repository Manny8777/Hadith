import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const hadithId = parseInt(id)
  if (isNaN(hadithId)) return NextResponse.json({ error: 'invalid' }, { status: 400 })

  const { rows } = await pool.query(
    `SELECT
       j.say_text,
       CASE
         WHEN j.say_text ~* 'صحيح' THEN 'صحيح'
         WHEN j.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND j.say_text !~* 'صحيح' THEN 'حسن'
         WHEN j.say_text ~* 'ضعيف|منكر|متروك|موضوع|لا يصح|باطل|كذب' THEN 'ضعيف'
         ELSE NULL
       END AS grade_class,
       n.id AS scientist_id,
       COALESCE(n.abb_name, n.name) AS scientist_name,
       n.death_year_num,
       n.tabaqa
     FROM hadith_judgments j
     LEFT JOIN narrators n ON n.id = j.scientist_id
     WHERE j.hadith_id = $1
     ORDER BY n.death_year_num ASC NULLS LAST, n.name`,
    [hadithId]
  )

  return NextResponse.json({ judgments: rows, total: rows.length })
}
