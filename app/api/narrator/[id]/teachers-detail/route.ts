import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const narratorId = parseInt(id, 10)
  if (isNaN(narratorId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

  try {
    const [teachersRes, studentsRes] = await Promise.all([
      pool.query(
        `SELECT n.id, n.name, n.abb_name, n.death_year_num, n.tabaqa_num,
                nt.hadiths_count
         FROM narrator_teachers nt
         JOIN narrators n ON n.id = nt.shyoukh_id
         WHERE nt.rawy_id = $1
         ORDER BY nt.hadiths_count DESC NULLS LAST
         LIMIT 200`,
        [narratorId]
      ),
      pool.query(
        `SELECT n.id, n.name, n.abb_name, n.death_year_num, n.tabaqa_num,
                nt.hadiths_count
         FROM narrator_teachers nt
         JOIN narrators n ON n.id = nt.rawy_id
         WHERE nt.shyoukh_id = $1
         ORDER BY nt.hadiths_count DESC NULLS LAST
         LIMIT 200`,
        [narratorId]
      )
    ])

    return NextResponse.json({
      teachers: teachersRes.rows,
      students: studentsRes.rows
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
