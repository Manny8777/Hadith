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

  // 1. Get the group_id for this hadith
  const groupRes = await pool.query(
    `SELECT group_id FROM takhrij WHERE hadith_id = $1`,
    [mainId]
  )

  if (!groupRes.rows[0]) return NextResponse.json([])

  const groupId = groupRes.rows[0].group_id

  // 2. Find all other hadiths with the same group_id, join with hadith_toc and books
  const result = await pool.query(
    `SELECT
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
     WHERE t.group_id = $1
       AND t.hadith_id != $2
     ORDER BY t.book_id, t.hadith_id
     LIMIT 50`,
    [groupId, mainId]
  )

  return NextResponse.json(result.rows)
}
