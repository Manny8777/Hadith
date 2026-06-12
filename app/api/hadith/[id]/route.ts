import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const mainId = parseInt(id)
  if (isNaN(mainId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const [hadith, judgments, isnad] = await Promise.all([
    pool.query(
      `SELECT h.*, b.title as book_title
       FROM hadith_toc h
       JOIN books b ON h.book_id = b.id
       WHERE h.main_id = $1`,
      [mainId]
    ),
    pool.query(
      `SELECT j.say_text, n.name as scientist_name
       FROM hadith_judgments j
       LEFT JOIN narrators n ON j.scientist_id = n.id
       WHERE j.hadith_id = $1`,
      [mainId]
    ),
    pool.query(
      `SELECT ic.narrator_ids, ic.types
       FROM isnad_hadiths ih
       JOIN isnad_chains ic ON ih.isnad_id = ic.id
       WHERE ih.hadith_id = $1
       LIMIT 5`,
      [mainId]
    ),
  ])

  if (!hadith.rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json({
    hadith: hadith.rows[0],
    judgments: judgments.rows,
    isnad: isnad.rows,
  })
}
