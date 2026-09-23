import { NextResponse } from 'next/server'
import pool from '@/lib/db'

// src=hadith  -> the 33 books that actually hold hadiths (hadith_toc)
// src=service -> the 212 service books (شروح، تراجم، جرح وتعديل، أعلام وأماكن) — hadith_service_content
// omitted     -> every book, the previous behaviour
export async function GET(req: Request) {
  const src = new URL(req.url).searchParams.get('src')
  const filter =
    src === 'hadith'
      ? 'WHERE EXISTS (SELECT 1 FROM hadith_toc ht WHERE ht.book_id = b.id AND ht.is_leaf AND ht.is_paragraph)'
      : src === 'service'
        ? 'WHERE EXISTS (SELECT 1 FROM hadith_service_content s WHERE s.book_id = b.id)'
        : ''
  const { rows } = await pool.query(
    `SELECT b.id, b.title, b.takhrij_author, b.takhrij_death, b.fame, b.strong,
            a.short_name AS author_short
     FROM books b
     LEFT JOIN authors a ON b.author_id = a.id
     ${filter}
     ORDER BY b.tarteeb, b.id`
  )
  return NextResponse.json(rows)
}
