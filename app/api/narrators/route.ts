import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = 30
  const offset = (page - 1) * limit

  try {
    let countQuery: string
    let dataQuery: string
    let queryParams: (string | number)[]

    if (q.trim()) {
      const pattern = `%${q.trim()}%`
      countQuery = `SELECT COUNT(*) FROM narrators WHERE name ILIKE $1`
      dataQuery = `
        SELECT id, name, abb_name, death_year_num, hadiths_count
        FROM narrators
        WHERE name ILIKE $1
        ORDER BY hadiths_count DESC NULLS LAST, name
        LIMIT $2 OFFSET $3
      `
      queryParams = [pattern, limit, offset]
    } else {
      countQuery = `SELECT COUNT(*) FROM narrators`
      dataQuery = `
        SELECT id, name, abb_name, death_year_num, hadiths_count
        FROM narrators
        ORDER BY hadiths_count DESC NULLS LAST, name
        LIMIT $1 OFFSET $2
      `
      queryParams = [limit, offset]
    }

    const [countRes, dataRes] = await Promise.all([
      q.trim()
        ? pool.query(countQuery, [queryParams[0]])
        : pool.query(countQuery),
      pool.query(dataQuery, queryParams),
    ])

    return NextResponse.json({
      narrators: dataRes.rows,
      total: parseInt(countRes.rows[0].count, 10),
      page,
      limit,
    })
  } catch (err) {
    console.error('Narrators list API error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
