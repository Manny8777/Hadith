import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const narratorId = parseInt(id)
  if (isNaN(narratorId)) return NextResponse.json({ topics: [] })

  // Top-level subject categories for this narrator's hadiths
  const { rows } = await pool.query(
    `SELECT sc.id, sc.title,
            COUNT(DISTINCT hs.hadith_id)::int AS hadith_count
     FROM hadith_toc ht
     JOIN hadith_subjects hs ON hs.hadith_id = ht.main_id
     JOIN subject_items si   ON si.id = hs.subject_id
     JOIN subject_categories sc
       ON sc.left_value  <= si.left_value
      AND sc.right_value >= si.right_value
      AND sc.parent_id   = 1
     WHERE $1 = ANY(ht.narrator_id_array)
     GROUP BY sc.id, sc.title
     ORDER BY hadith_count DESC
     LIMIT 15`,
    [narratorId]
  )

  return NextResponse.json({ topics: rows })
}
