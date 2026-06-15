import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const itemId = parseInt(id)

  if (isNaN(itemId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  }

  const [itemRes, hadithRes] = await Promise.all([
    pool.query(
      `SELECT * FROM lexicon_items WHERE id = $1`,
      [itemId]
    ),
    pool.query(
      `SELECT h.main_id, h.book_id, b.title AS book_title, h.tarf, h.part_num, h.page_num
       FROM lexicon_hadith lh
       JOIN hadith_toc h ON h.main_id = lh.hadith_id
       JOIN books b ON b.id = h.book_id
       WHERE lh.lexicon_item_id = $1
       LIMIT 20`,
      [itemId]
    ),
  ])

  if (!itemRes.rows[0]) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    item: itemRes.rows[0],
    hadiths: hadithRes.rows,
  })
}
