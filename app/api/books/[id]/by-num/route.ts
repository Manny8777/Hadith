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
  const prefParam = searchParams.get('pref')
  const pref = prefParam === 'harf' ? 'harf' : 'matboa'

  if (!num || isNaN(bookId)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }

  const numColumn = pref === 'harf' ? 'tarqeem_harf' : 'tarqeem_matboa1'
  const { rows } = await pool.query(
    `SELECT main_id FROM hadith_toc
     WHERE book_id = $1 AND is_leaf = true AND is_paragraph = true
       AND (${numColumn} = $2 OR ${numColumn} LIKE $3)
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
