import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() || ''
  const limit = Math.min(10, parseInt(searchParams.get('limit') || '8'))

  if (q.length < 2) return NextResponse.json([])

  const { rows } = await pool.query(
    `SELECT id, name, abb_name, martaba_ibn_hajar, tabaqa, is_companion
     FROM narrators
     WHERE name ILIKE $1 OR abb_name ILIKE $1
     ORDER BY
       CASE WHEN name ILIKE $2 THEN 0 ELSE 1 END,
       hadiths_count DESC NULLS LAST
     LIMIT $3`,
    [`%${q}%`, `${q}%`, limit]
  )

  return NextResponse.json(rows)
}
