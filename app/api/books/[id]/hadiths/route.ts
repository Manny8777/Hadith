import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const bookId = parseInt(id)
  if (isNaN(bookId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  // Return chapter-level TOC entries for the book (not raw leaf hadiths)
  const { rows } = await pool.query(
    `SELECT main_id, id, parent_id, content, is_leaf, is_paragraph,
            section_text, chapter_text, part_num, page_num, tarf,
            left_value, right_value, tarqeem_harf, tarqeem_matboa1,
            next_paragraph_id, prev_paragraph_id
     FROM hadith_toc
     WHERE book_id = $1
     ORDER BY left_value`,
    [bookId]
  )
  return NextResponse.json(rows)
}
