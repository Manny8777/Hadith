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
  const page  = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const requestedView = searchParams.get('view') === 'hadiths' ? 'hadiths' : 'children'
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

  // A branch may have both child topics and direct hadith links. Let callers choose explicitly.
  const { rows: topicMeta } = await pool.query<{ has_children: boolean; child_count: number; direct_hadiths: number }>(
    `SELECT
       EXISTS (SELECT 1 FROM subject_items WHERE parent_id = $1) AS has_children,
       (SELECT COUNT(*)::int FROM subject_items WHERE parent_id = $1) AS child_count,
       (SELECT COUNT(DISTINCT paragraph_main_id) FROM hadith_subjects WHERE subject_id = $1)::int AS direct_hadiths`,
    [itemId]
  )
  const hasChildren = Boolean(topicMeta[0]?.has_children)
  const childTotal = Number(topicMeta[0]?.child_count || 0)
  const directTotal = Number(topicMeta[0]?.direct_hadiths || 0)
  const view = hasChildren ? requestedView : 'hadiths'

  const { rows: childrenCheck } = hasChildren && view === 'children'
    ? await pool.query(
        `SELECT si.id, si.title, si.is_leaf, si.left_value,
                (SELECT COUNT(DISTINCT hs.paragraph_main_id) FROM hadith_subjects hs WHERE hs.subject_id = si.id) AS hadith_count
         FROM subject_items si WHERE si.parent_id = $1 ORDER BY si.left_value LIMIT $2 OFFSET $3`,
        [itemId, limit, offset]
      )
    : { rows: [] }

  if (hasChildren && view === 'children') {
    return NextResponse.json({
      item,
      parent,
      children: childrenCheck,
      hadiths: [],
      total: childTotal,
      direct_total: directTotal,
      has_children: true,
      page,
      limit,
      pages: Math.ceil(childTotal / limit),
      mode: 'children',
    })
  }

  // Leaf node — return hadiths linked to this subject
  const { rows: hadiths } = await pool.query(
    `SELECT DISTINCT h.main_id, h.book_id, b.title AS book_title, h.tarf, h.part_num, h.page_num,
            h.section_text, h.chapter_text
     FROM hadith_subjects hs
     JOIN hadith_toc h ON h.main_id = hs.paragraph_main_id
     JOIN books b ON b.id = h.book_id
     WHERE hs.subject_id = $1
     ORDER BY h.book_id, h.main_id
     LIMIT $2 OFFSET $3`,
    [itemId, limit, offset]
  )

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(DISTINCT paragraph_main_id) FROM hadith_subjects WHERE subject_id = $1`,
    [itemId]
  )
  const total = parseInt(countRows[0].count)

  return NextResponse.json({
    item,
    parent,
    children: [],
    hadiths,
    total,
    direct_total: directTotal,
    child_total: childTotal,
    has_children: hasChildren,
    page,
    limit,
    pages: Math.ceil(total / limit),
    mode: 'hadiths',
  })
}
