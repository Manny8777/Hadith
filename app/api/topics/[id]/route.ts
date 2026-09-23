import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const catId = parseInt(id)
  if (isNaN(catId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const page  = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const limit = 50
  const offset = (page - 1) * limit

  // Get the category info first
  const catRes = await pool.query(
    `SELECT id, title, parent_id, is_leaf, left_value, right_value
     FROM subject_categories WHERE id = $1`,
    [catId]
  )
  if (!catRes.rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const cat = catRes.rows[0]

  // Get direct children (one level deep) — can be browsed or leaf topics
  const { rows: children } = await pool.query(
    `SELECT
       si.id,
       si.title,
       si.is_leaf,
       si.left_value,
       si.right_value,
       COUNT(DISTINCT hs.paragraph_main_id) AS hadith_count
     FROM subject_items si
     LEFT JOIN hadith_subjects hs ON hs.subject_id = si.id
     WHERE si.parent_id = $1
     GROUP BY si.id
     ORDER BY si.left_value
     LIMIT $2 OFFSET $3`,
    [catId, limit, offset]
  )

  // Total count of direct children
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) FROM subject_items WHERE parent_id = $1`,
    [catId]
  )
  const total = parseInt(countRows[0].count)

  return NextResponse.json({
    category: cat,
    items: children,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  })
}
