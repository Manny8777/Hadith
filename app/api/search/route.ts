import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  const page = parseInt(searchParams.get('page') || '1')
  const bookIdParam = searchParams.get('book_id')
  const bookId = bookIdParam ? parseInt(bookIdParam) : null
  const narratorIdParam = searchParams.get('narrator_id')
  const narratorId = narratorIdParam ? parseInt(narratorIdParam) : null
  const limit = 20
  const offset = (page - 1) * limit

  // Narrator-in-isnad search mode
  if (narratorId !== null && !isNaN(narratorId)) {
    const [hadithsRes, countRes] = await Promise.all([
      pool.query(
        `SELECT DISTINCT ht.main_id, ht.book_id, b.title as book_name, ht.tarf,
                ht.section_text, ht.chapter_text, ht.part_num, ht.page_num
         FROM isnad_hadiths iha
         JOIN isnad_chains ic ON iha.isnad_id = ic.id
         JOIN hadith_toc ht ON iha.hadith_id = ht.main_id
         JOIN books b ON b.id = ht.book_id
         WHERE ic.narrator_id_array @> ARRAY[$1::integer]
         ORDER BY ht.book_id, ht.main_id
         LIMIT $2 OFFSET $3`,
        [narratorId, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(DISTINCT ht.main_id) as cnt
         FROM isnad_hadiths iha
         JOIN isnad_chains ic ON iha.isnad_id = ic.id
         JOIN hadith_toc ht ON iha.hadith_id = ht.main_id
         WHERE ic.narrator_id_array @> ARRAY[$1::integer]`,
        [narratorId]
      ),
    ])
    return NextResponse.json({
      results: hadithsRes.rows,
      total: parseInt(countRes.rows[0]?.cnt || '0'),
      page,
      limit,
    })
  }

  if (!q || q.length < 2) return NextResponse.json({ results: [], total: 0 })

  // Build dynamic WHERE clause for text search
  const conditions: string[] = [
    'h.is_leaf = true',
    `to_tsvector('simple', coalesce(h.tarf,'') || ' ' || coalesce(h.content,'')) @@ plainto_tsquery('simple', $1)`,
  ]
  const params: (string | number)[] = [q, limit, offset]
  let paramIdx = 4

  if (bookId !== null && !isNaN(bookId)) {
    conditions.push(`h.book_id = $${paramIdx}`)
    params.push(bookId)
    paramIdx++
  }

  const whereClause = conditions.join(' AND ')

  const { rows } = await pool.query(
    `SELECT h.main_id, h.book_id, h.book_name, h.tarf,
            h.section_text, h.chapter_text, h.part_num, h.page_num,
            ts_rank(to_tsvector('simple', coalesce(h.tarf,'') || ' ' || coalesce(h.content,'')),
                    plainto_tsquery('simple', $1)) AS rank
     FROM hadith_toc h
     WHERE ${whereClause}
     ORDER BY rank DESC
     LIMIT $2 OFFSET $3`,
    params
  )

  const countParams: (string | number)[] = [q]
  const countConditions: string[] = [
    'is_leaf = true',
    `to_tsvector('simple', coalesce(tarf,'') || ' ' || coalesce(content,'')) @@ plainto_tsquery('simple', $1)`,
  ]
  let countParamIdx = 2

  if (bookId !== null && !isNaN(bookId)) {
    countConditions.push(`book_id = $${countParamIdx}`)
    countParams.push(bookId)
    countParamIdx++
  }

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM hadith_toc WHERE ${countConditions.join(' AND ')}`,
    countParams
  )

  return NextResponse.json({
    results: rows,
    total: parseInt(countResult.rows[0].count),
    page,
    limit,
  })
}
