import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const itemId = parseInt(id)
  if (isNaN(itemId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const page  = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit = 20
  const offset = (page - 1) * limit

  // Get the subject item info
  const itemRes = await pool.query(
    `SELECT id, title, parent_id, is_leaf FROM subject_items WHERE id = $1`,
    [itemId]
  )
  if (!itemRes.rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const item = itemRes.rows[0]

  // Get parent category title for breadcrumb
  const parentRes = await pool.query(
    `SELECT id, title FROM subject_categories WHERE id = $1`,
    [item.parent_id]
  )
  const parent = parentRes.rows[0] || null

  // If this item has children (non-leaf), return children instead of hadiths
  const { rows: childrenCheck } = await pool.query(
    `SELECT id, title, is_leaf, left_value,
            (SELECT COUNT(*) FROM hadith_subjects WHERE subject_id = si.id) AS hadith_count
     FROM subject_items WHERE parent_id = $1 ORDER BY left_value LIMIT $2 OFFSET $3`,
    [itemId, limit, offset]
  )

  if (childrenCheck.length > 0) {
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM subject_items WHERE parent_id = $1`,
      [itemId]
    )
    return NextResponse.json({
      item,
      parent,
      children: childrenCheck,
      hadiths: [],
      total: parseInt(countRows[0].count),
      page,
      limit,
      pages: Math.ceil(parseInt(countRows[0].count) / limit),
      mode: 'children',
    })
  }

  // Leaf node — return hadiths linked to this subject
  const { rows: hadiths } = await pool.query(
    `SELECT h.main_id, h.book_id, b.title AS book_title, h.tarf, h.part_num, h.page_num,
            h.section_text, h.chapter_text
     FROM hadith_subjects hs
     JOIN hadith_toc h ON h.main_id = hs.hadith_id
     JOIN books b ON b.id = h.book_id
     WHERE hs.subject_id = $1
     ORDER BY h.book_id, h.main_id
     LIMIT $2 OFFSET $3`,
    [itemId, limit, offset]
  )

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) FROM hadith_subjects WHERE subject_id = $1`,
    [itemId]
  )
  const total = parseInt(countRows[0].count)

  return NextResponse.json({
    item,
    parent,
    children: [],
    hadiths,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    mode: 'hadiths',
  })
}
