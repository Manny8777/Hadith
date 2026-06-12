import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const narratorId = parseInt(id, 10)
  if (isNaN(narratorId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  }

  try {
    const [hadithsRes, countRes] = await Promise.all([
      pool.query<{ main_id: number; tarf: string; book_name: string; book_id: number }>(
        `SELECT DISTINCT ht.main_id, ht.tarf, b.title as book_name, b.id as book_id
         FROM isnad_hadiths iha
         JOIN isnad_chains ic ON iha.isnad_id = ic.id
         JOIN hadith_toc ht ON iha.hadith_id = ht.main_id
         JOIN books b ON b.id = ht.book_id
         WHERE ic.narrator_id_array @> ARRAY[$1::integer]
         ORDER BY b.id, ht.main_id
         LIMIT 50`,
        [narratorId]
      ),
      pool.query<{ cnt: string }>(
        `SELECT COUNT(DISTINCT ht.main_id) as cnt
         FROM isnad_hadiths iha
         JOIN isnad_chains ic ON iha.isnad_id = ic.id
         JOIN hadith_toc ht ON iha.hadith_id = ht.main_id
         WHERE ic.narrator_id_array @> ARRAY[$1::integer]`,
        [narratorId]
      ),
    ])

    return NextResponse.json({
      hadiths: hadithsRes.rows,
      total: parseInt(countRes.rows[0]?.cnt || '0'),
    })
  } catch (err) {
    console.error('Narrator hadiths API error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
