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
            COUNT(DISTINCT hs.paragraph_main_id)::int AS hadith_count
     FROM hadith_toc ht
     JOIN isnad_hadiths ih   ON ih.hadith_id = ht.main_id
     JOIN isnad_chains ic    ON ic.id = ih.isnad_id
     JOIN hadith_subjects hs ON hs.paragraph_main_id = ht.main_id
     JOIN subject_items si   ON si.id = hs.subject_id
     JOIN subject_categories sc
       ON sc.left_value  <= si.left_value
      AND sc.right_value >= si.right_value
      AND sc.parent_id   = 1
     WHERE $1 = ANY(ic.narrator_id_array)
     GROUP BY sc.id, sc.title
     ORDER BY hadith_count DESC
     LIMIT 15`,
    [narratorId]
  )

  return NextResponse.json({ topics: rows })
}
