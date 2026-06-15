import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const hadithId = parseInt(id)
  if (isNaN(hadithId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const groupRes = await pool.query(
    `SELECT group_id FROM takhrij WHERE hadith_id = $1 AND group_id IS NOT NULL LIMIT 1`,
    [hadithId]
  ).catch(() => ({ rows: [] }))

  const groupId = groupRes.rows[0]?.group_id ?? null
  if (!groupId) return NextResponse.json({ witnesses: [], groupId: null })

  const witnessesRes = await pool.query(
    `SELECT DISTINCT ON (COALESCE(comp.id::text, t2.hadith_id::text))
           comp.id AS companion_id,
           comp.name AS companion_name, comp.abb_name AS companion_abb,
           t2.hadith_id,
           regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g') AS tarf,
           b.title AS book_title, b.takhrij_author, b.takhrij_death,
           (
             SELECT COUNT(DISTINCT ic3.id)::int
             FROM isnad_hadiths ih3
             JOIN isnad_chains ic3 ON ic3.id = ih3.isnad_id
             WHERE ih3.hadith_id = t2.hadith_id
           ) AS chain_count
     FROM takhrij t2
     JOIN hadith_toc ht ON ht.main_id = t2.hadith_id AND ht.is_leaf = true AND ht.is_paragraph = true
     JOIN books b ON b.id = ht.book_id
     LEFT JOIN isnad_hadiths ih2 ON ih2.hadith_id = t2.hadith_id
     LEFT JOIN isnad_chains ic2 ON ic2.id = ih2.isnad_id
     LEFT JOIN narrators comp ON comp.id = ic2.narrator_id_array[1] AND comp.is_companion = true
     WHERE t2.group_id = $1 AND t2.hadith_id != $2
     ORDER BY COALESCE(comp.id::text, t2.hadith_id::text), b.takhrij_death ASC NULLS LAST
     LIMIT 60`,
    [groupId, hadithId]
  ).catch(() => ({ rows: [] }))

  return NextResponse.json({ witnesses: witnessesRes.rows, groupId })
}
