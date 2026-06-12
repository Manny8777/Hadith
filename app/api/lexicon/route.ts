import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  const page = parseInt(searchParams.get('page') || '1')
  const limit = 20
  const offset = (page - 1) * limit

  if (!q) {
    // No query — return top 50 by results_count
    const { rows } = await pool.query(
      `SELECT id, text, results_count
       FROM lexicon_items
       WHERE is_leaf = true
       ORDER BY results_count DESC
       LIMIT 50`
    )
    return NextResponse.json({ items: rows, total: rows.length })
  }

  if (q.length < 2) {
    return NextResponse.json({ items: [], total: 0 })
  }

  const { rows } = await pool.query(
    `SELECT id, text, results_count
     FROM lexicon_items
     WHERE is_leaf = true
       AND to_tsvector('simple', coalesce(text,'')) @@ plainto_tsquery('simple', $1)
     ORDER BY results_count DESC
     LIMIT $2 OFFSET $3`,
    [q, limit, offset]
  )

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM lexicon_items
     WHERE is_leaf = true
       AND to_tsvector('simple', coalesce(text,'')) @@ plainto_tsquery('simple', $1)`,
    [q]
  )

  return NextResponse.json({
    items: rows,
    total: parseInt(countResult.rows[0].count),
    page,
    limit,
  })
}
