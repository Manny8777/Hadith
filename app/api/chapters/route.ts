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
  // The original stores a chapter title only on the hadith (leaf) rows; internal nodes keep
  // their heading in `content`. So the chapter search runs over leaf rows and reports how many
  // hadiths in each book carry that chapter title.
  const res = await pool.query(
    `SELECT
       ht.chapter_text,
       b.id AS book_id,
       b.title AS book_title,
       b.takhrij_author,
       b.takhrij_death,
       COUNT(*)::int AS hadith_count,
       MIN(ht.parent_id)::int AS section_id
     FROM hadith_toc ht
     JOIN books b ON b.id = ht.book_id
     WHERE ht.is_leaf = true AND ht.is_paragraph = true
       AND ht.chapter_text ILIKE $1
       AND LENGTH(BTRIM(COALESCE(ht.chapter_text, ''))) > 3
     GROUP BY ht.chapter_text, b.id, b.title, b.takhrij_author, b.takhrij_death
     ORDER BY hadith_count DESC, b.takhrij_death
     LIMIT 80`,
    [like]
  )

  return NextResponse.json({ results: res.rows, total: res.rows.length })
}
