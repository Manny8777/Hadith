import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Return top-level categories (children of the single root node, parent_id=1)
  // with descendant leaf counts and hadith counts
  const { rows } = await pool.query(`
    SELECT
      sc.id,
      sc.title,
      sc.parent_id,
      sc.is_leaf,
      sc.left_value,
      sc.right_value,
      COUNT(DISTINCT child.id) AS item_count,
      COUNT(DISTINCT hs.id)    AS hadith_count
    FROM subject_categories sc
    LEFT JOIN subject_items child
      ON child.left_value  > sc.left_value
     AND child.right_value < sc.right_value
     AND child.is_leaf = true
    LEFT JOIN hadith_subjects hs ON hs.subject_id = child.id
    WHERE sc.parent_id = 1
    GROUP BY sc.id
    ORDER BY sc.left_value
  `)
  return NextResponse.json(rows)
}
