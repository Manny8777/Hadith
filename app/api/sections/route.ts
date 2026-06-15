import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [sectionsRes, sectionBooksRes] = await Promise.all([
      pool.query('SELECT * FROM sections ORDER BY left_value'),
      pool.query(
        `SELECT sb.section_id, b.id, b.title, b.fame, b.strong
         FROM section_books sb
         JOIN books b ON b.id = sb.book_id
         ORDER BY sb.section_id, b.title`
      )
    ])

    const booksBySection: Record<number, typeof sectionBooksRes.rows> = {}
    for (const row of sectionBooksRes.rows) {
      if (!booksBySection[row.section_id]) booksBySection[row.section_id] = []
      booksBySection[row.section_id].push(row)
    }

    const sections = sectionsRes.rows.map(s => ({
      ...s,
      books: booksBySection[s.id] || []
    }))

    return NextResponse.json({ sections })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
