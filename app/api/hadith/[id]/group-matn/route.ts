import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const hadithId = parseInt(id)
  if (isNaN(hadithId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const groupRes = await pool.query(
    `SELECT group_id FROM hadith_group_matn WHERE hadith_main_id = $1 LIMIT 1`,
    [hadithId]
  ).catch(() => ({ rows: [] }))

  const groupId = groupRes.rows[0]?.group_id ?? null
  if (!groupId) return NextResponse.json({ members: [], groupId: null })

  const membersRes = await pool.query<{
    hadith_id: number
    book_name: string
    tarf: string | null
    part_num: number | null
    page_num: number | null
  }>(
    `SELECT gm.hadith_main_id AS hadith_id, ht.book_name, ht.tarf, ht.part_num, ht.page_num
     FROM hadith_group_matn gm
     JOIN hadith_toc ht ON ht.main_id = gm.hadith_main_id
     WHERE gm.group_id = $1 AND gm.hadith_main_id != $2
     ORDER BY ht.book_id, gm.hadith_main_id
     LIMIT 20`,
    [groupId, hadithId]
  ).catch(() => ({ rows: [] }))

  return NextResponse.json({ members: membersRes.rows, groupId })
}
