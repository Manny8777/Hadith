import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const mainId = parseInt(id)
  if (isNaN(mainId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  // A hadith may belong to several independent takhrij groups. The web table preserves all
  // memberships, so the route must not silently choose whichever group happened to come first.
  const groupRes = await pool.query(
    `SELECT group_id FROM takhrij
     WHERE hadith_id = $1 AND group_id IS NOT NULL
     ORDER BY group_id`,
    [mainId]
  )

  if (groupRes.rows.length === 0) return NextResponse.json([])

  const groupIds = groupRes.rows.map(row => Number(row.group_id))
  const result = await pool.query(
    `SELECT DISTINCT ON (t.hadith_id)
       t.hadith_id  AS main_id,
       t.book_id,
       b.title      AS book_name,
       b.title      AS book_title,
       h.tarf,
       h.part_num,
       h.page_num
     FROM takhrij t
     JOIN hadith_toc h ON h.main_id = t.hadith_id
     JOIN books b ON b.id = t.book_id
     WHERE t.group_id = ANY($1::int[])
       AND t.hadith_id != $2
     ORDER BY t.hadith_id, t.book_id, t.hadith_id
     LIMIT 500`,
    [groupIds, mainId]
  )

  return NextResponse.json(result.rows)
}
