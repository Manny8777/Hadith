import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const hadithId = parseInt(id)
  if (isNaN(hadithId)) return NextResponse.json({ prev: [], next: [] })

  // Get current hadith's location info
  const { rows: [cur] } = await pool.query(
    `SELECT book_id, chapter_text, left_value FROM hadith_toc WHERE main_id = $1`,
    [hadithId]
  )
  if (!cur) return NextResponse.json({ prev: [], next: [] })

  const { book_id, chapter_text, left_value } = cur

  // If no chapter context, fall back to book-level neighbors
  const chapterCondition = chapter_text?.trim()
    ? `AND chapter_text = $4`
    : ''
  const chapterParam = chapter_text?.trim() || null
  const baseParams = [book_id, left_value, hadithId]
  const extParams = chapterParam ? [...baseParams, chapterParam] : baseParams

  const [prevRes, nextRes] = await Promise.all([
    pool.query(
      `SELECT main_id, tarf, tarqeem_harf, tarqeem_matboa1
       FROM hadith_toc
       WHERE book_id = $1 AND left_value < $2 AND main_id != $3
         AND is_leaf = true AND is_paragraph = true
         ${chapterCondition}
       ORDER BY left_value DESC LIMIT 3`,
      extParams
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT main_id, tarf, tarqeem_harf, tarqeem_matboa1
       FROM hadith_toc
       WHERE book_id = $1 AND left_value > $2 AND main_id != $3
         AND is_leaf = true AND is_paragraph = true
         ${chapterCondition}
       ORDER BY left_value ASC LIMIT 3`,
      extParams
    ).catch(() => ({ rows: [] })),
  ])

  return NextResponse.json({
    prev: (prevRes as { rows: unknown[] }).rows.reverse(),
    next: (nextRes as { rows: unknown[] }).rows,
    chapter: chapter_text || null,
  })
}
