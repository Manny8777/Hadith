import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() || ''
  if (q.length < 2) {
    return NextResponse.json({ results: [], total: 0 })
  }

  const like = `%${q}%`
  const res = await pool.query(
    `SELECT
       ht.chapter_text,
       b.id AS book_id,
       b.title AS book_title,
       b.takhrij_author,
       b.takhrij_death,
       COUNT(DISTINCT child.main_id)::int AS hadith_count,
       ht.main_id AS section_id
     FROM hadith_toc ht
     JOIN books b ON b.id = ht.book_id
     LEFT JOIN hadith_toc child ON child.book_id = ht.book_id
       AND child.is_leaf = true AND child.is_paragraph = true
       AND child.left_value >= ht.left_value
       AND child.left_value < ht.right_value
     WHERE ht.chapter_text ILIKE $1
       AND ht.is_leaf = false
       AND ht.chapter_text IS NOT NULL
       AND LENGTH(TRIM(ht.chapter_text)) > 3
     GROUP BY ht.chapter_text, b.id, b.title, b.takhrij_author, b.takhrij_death, ht.main_id
     ORDER BY hadith_count DESC, b.takhrij_death
     LIMIT 80`,
    [like]
  ).catch(() => ({ rows: [] }))

  return NextResponse.json({ results: res.rows, total: res.rows.length })
}
