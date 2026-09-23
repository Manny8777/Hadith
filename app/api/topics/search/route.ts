import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json([])

  const { rows } = await pool.query(
    `SELECT si.id, si.title, si.is_leaf,
            COUNT(DISTINCT hs.paragraph_main_id) as hadith_count
     FROM subject_items si
     LEFT JOIN hadith_subjects hs ON hs.subject_id = si.id
     WHERE si.title ILIKE $1
     GROUP BY si.id
     ORDER BY hadith_count DESC, si.title
     LIMIT 20`,
    [`%${q}%`]
  )

  return NextResponse.json(rows)
}
