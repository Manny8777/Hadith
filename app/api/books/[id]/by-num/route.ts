import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const bookId = parseInt(id)
  const { searchParams } = new URL(req.url)
  const num = searchParams.get('num')?.trim()

  if (!num || isNaN(bookId)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }

  // Search by tarqeem_harf (exact match), tarqeem_matboa1, or numeric position
  const { rows } = await pool.query(
    `SELECT main_id FROM hadith_toc
     WHERE book_id = $1 AND is_leaf = true AND is_paragraph = true
       AND (tarqeem_harf = $2 OR tarqeem_matboa1 = $2 OR tarqeem_harf LIKE $3)
     ORDER BY left_value
     LIMIT 5`,
    [bookId, num, `${num}%`]
  )

  if (rows.length === 0) {
    return NextResponse.json({ found: false })
  }
  if (rows.length === 1) {
    return NextResponse.json({ found: true, main_id: rows[0].main_id })
  }
  return NextResponse.json({ found: true, main_id: rows[0].main_id, multiple: rows.map((r: { main_id: number }) => r.main_id) })
}
