import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  const page = parseInt(searchParams.get('page') || '1')
  const limit = 20
  const offset = (page - 1) * limit

  if (!q || q.length < 2) return NextResponse.json({ results: [], total: 0 })

  const { rows } = await pool.query(
    `SELECT h.main_id, h.book_id, h.book_name, h.tarf,
            h.section_text, h.chapter_text, h.part_num, h.page_num,
            ts_rank(to_tsvector('simple', coalesce(h.tarf,'') || ' ' || coalesce(h.content,'')),
                    plainto_tsquery('simple', $1)) AS rank
     FROM hadith_toc h
     WHERE h.is_leaf = true
       AND (to_tsvector('simple', coalesce(h.tarf,'') || ' ' || coalesce(h.content,''))
            @@ plainto_tsquery('simple', $1))
     ORDER BY rank DESC
     LIMIT $2 OFFSET $3`,
    [q, limit, offset]
  )

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM hadith_toc
     WHERE is_leaf = true
       AND to_tsvector('simple', coalesce(tarf,'') || ' ' || coalesce(content,''))
           @@ plainto_tsquery('simple', $1)`,
    [q]
  )

  return NextResponse.json({
    results: rows,
    total: parseInt(countResult.rows[0].count),
    page,
    limit,
  })
}
