import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const mainId = parseInt(id, 10)
  if (isNaN(mainId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const res = await pool.query(
    `SELECT ht.main_id AS hadith_id,
            b.title AS book_name,
            b.takhrij_death AS book_death,
            ht.chapter_text AS chapter_name,
            regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g') AS hadith_text,
            (SELECT COUNT(DISTINCT ic.id)::int FROM isnad_chains ic
             JOIN isnad_hadiths ih ON ih.isnad_id = ic.id WHERE ih.hadith_id = ht.main_id) AS chain_count,
            (SELECT hj.say_text FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id LIMIT 1) AS judgment,
            (SELECT n.name FROM isnad_chains ic
             JOIN isnad_hadiths ih ON ih.isnad_id = ic.id AND ih.hadith_id = ht.main_id
             JOIN narrators n ON n.id = ic.narrator_id_array[1]
             WHERE n.is_companion = true LIMIT 1) AS companion_name
     FROM hadith_toc ht
     JOIN books b ON b.id = ht.book_id
     WHERE ht.takhrij_id = (SELECT takhrij_id FROM hadith_toc WHERE main_id = $1)
       AND ht.takhrij_id IS NOT NULL
     ORDER BY b.takhrij_death ASC NULLS LAST, ht.main_id
     LIMIT 15`,
    [mainId]
  ).catch(() => ({ rows: [] }))

  return NextResponse.json({ versions: res.rows, mainId })
}
