import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limitParam = parseInt(searchParams.get('limit') ?? '30', 10)
  const limit = Math.min(Math.max(1, limitParam), 100)
  const offset = (page - 1) * limit

  try {
    let dataQuery: string
    let queryParams: (string | number)[]
    let total = 0

    if (q.trim()) {
      const pattern = `%${q.trim()}%`
      const [countRes, dataRes] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) FROM narrators WHERE name ILIKE $1 OR abb_name ILIKE $1 OR kunia ILIKE $1`,
          [pattern]
        ),
        pool.query(
          `SELECT id, name, abb_name, kunia, death_year_num, hadiths_count, martaba_ibn_hajar
           FROM narrators
           WHERE name ILIKE $1 OR abb_name ILIKE $1 OR kunia ILIKE $1
           ORDER BY hadiths_count DESC NULLS LAST, name
           LIMIT $2 OFFSET $3`,
          [pattern, limit, offset]
        ),
      ])
      total = parseInt(countRes.rows[0].count, 10)
      return NextResponse.json({ narrators: dataRes.rows, total, page, limit })
    } else {
      const [countRes, dataRes] = await Promise.all([
        pool.query(`SELECT COUNT(*) FROM narrators`),
        pool.query(
          `SELECT id, name, abb_name, kunia, death_year_num, hadiths_count, martaba_ibn_hajar
           FROM narrators
           ORDER BY hadiths_count DESC NULLS LAST, name
           LIMIT $1 OFFSET $2`,
          [limit, offset]
        ),
      ])
      total = parseInt(countRes.rows[0].count, 10)
      return NextResponse.json({ narrators: dataRes.rows, total, page, limit })
    }
  } catch (err) {
    console.error('Narrators list API error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
