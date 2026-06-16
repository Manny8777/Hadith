import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const hadithId = parseInt(id)
  if (isNaN(hadithId)) return NextResponse.json({ chains: [] })

  // Step 1: Find group_id for this hadith
  const groupRes = await pool.query(
    `SELECT group_id FROM takhrij WHERE hadith_id = $1 LIMIT 1`,
    [hadithId]
  )
  const groupId = groupRes.rows[0]?.group_id
  if (!groupId) return NextResponse.json({ chains: [], message: 'لا توجد تخريجات مشتركة' })

  // Step 2: Get all chains for all parallel hadiths in this group
  // Note: SELECT DISTINCT requires ORDER BY expressions to be in the select list;
  // use a subquery to sort after deduplication.
  const { rows: rawChains } = await pool.query(
    `SELECT narrator_id_array, hadith_id, book_title, takhrij_author, takhrij_death, hadith_num, tahdeth_raw
     FROM (
       SELECT DISTINCT
         ic.narrator_id_array,
         ht.main_id as hadith_id,
         b.title as book_title,
         b.takhrij_author,
         b.takhrij_death,
         ht.tarqeem_harf as hadith_num,
         it.sand_tahdeth as tahdeth_raw
       FROM takhrij t
       JOIN isnad_hadiths ih ON ih.hadith_id = t.hadith_id
       JOIN isnad_chains ic ON ic.id = ih.isnad_id
       JOIN hadith_toc ht ON ht.main_id = t.hadith_id
       JOIN books b ON b.id = ht.book_id
       LEFT JOIN isnad_tahdeth it ON it.id = ih.sanad_tahdeth_id
       WHERE t.group_id = $1
         AND array_length(ic.narrator_id_array, 1) >= 2
     ) sub
     ORDER BY narrator_id_array[1], array_length(narrator_id_array, 1)
     LIMIT 100`,
    [groupId]
  ).catch(async () => {
    return pool.query(
      `SELECT narrator_id_array, hadith_id, book_title, NULL::text as takhrij_author, NULL::int as takhrij_death, NULL::text as hadith_num, NULL::text as tahdeth_raw
       FROM (
         SELECT DISTINCT
           ic.narrator_id_array,
           ht.main_id as hadith_id,
           b.title as book_title
         FROM takhrij t
         JOIN isnad_hadiths ih ON ih.hadith_id = t.hadith_id
         JOIN isnad_chains ic ON ic.id = ih.isnad_id
         JOIN hadith_toc ht ON ht.main_id = t.hadith_id
         JOIN books b ON b.id = ht.book_id
         WHERE t.group_id = $1
           AND array_length(ic.narrator_id_array, 1) >= 2
       ) sub
       ORDER BY narrator_id_array[1], array_length(narrator_id_array, 1)
       LIMIT 100`,
      [groupId]
    )
  })

  if (rawChains.length === 0) return NextResponse.json({ chains: [], groupId })

  // Fetch transmission term types lookup
  const tahdethTypes: Record<number, string> = {}
  await pool.query(`SELECT id, text FROM isnad_tahdeth_types LIMIT 2000`)
    .then(r => { r.rows.forEach((row: { id: number; text: string }) => { tahdethTypes[row.id] = row.text }) })
    .catch(() => {})

  // Step 3: Collect all unique narrator IDs
  const allIds = new Set<number>()
  for (const row of rawChains) {
    const arr = row.narrator_id_array as number[]
    arr.forEach(id => allIds.add(id))
  }

  // Step 4: Fetch narrator info in one query
  const { rows: narrators } = await pool.query(
    `SELECT id, name, abb_name, martaba_ibn_hajar, is_companion, tabaqa, death_year_num, death_year
     FROM narrators WHERE id = ANY($1)`,
    [Array.from(allIds)]
  )
  const narMap: Record<number, {
    id: number; name: string; abb_name: string | null; martaba_ibn_hajar: string | null;
    is_companion: boolean; tabaqa: string | null; death_year_num: number | null; death_year: string | null;
  }> = {}
  narrators.forEach(n => { narMap[n.id] = n })

  // Step 5: Build chain objects
  const chains = rawChains.map(row => ({
    hadithId: row.hadith_id,
    bookTitle: row.book_title,
    takhrij_author: row.takhrij_author,
    takhrij_death: row.takhrij_death,
    hadith_num: row.hadith_num,
    tahdethRaw: (row.tahdeth_raw as string | null) ?? null,
    narrators: (row.narrator_id_array as number[]).map(nid => narMap[nid] || {
      id: nid, name: `[${nid}]`, abb_name: null, martaba_ibn_hajar: null,
      is_companion: false, tabaqa: null, death_year_num: null, death_year: null,
    }),
  }))

  return NextResponse.json({ chains, groupId, tahdethTypes })
}
