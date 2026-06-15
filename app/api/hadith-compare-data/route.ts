import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = parseInt(searchParams.get('id') || '')
  if (isNaN(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const [metaRes, chainRes, judgmentsRes, groupRes] = await Promise.all([
    pool.query(
      `SELECT ht.main_id AS id,
              regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g') AS tarf,
              b.title AS book_title, b.takhrij_author
       FROM hadith_toc ht
       JOIN books b ON b.id = ht.book_id
       WHERE ht.main_id = $1`,
      [id]
    ),

    pool.query(
      `WITH first_chain AS (
         SELECT ic.narrator_id_array
         FROM isnad_hadiths ih
         JOIN isnad_chains ic ON ic.id = ih.isnad_id
         WHERE ih.hadith_id = $1
         LIMIT 1
       )
       SELECT n.id, n.name, n.martaba_ibn_hajar AS martaba, n.death_year_num AS death_year, pos.ord
       FROM first_chain fc
       JOIN LATERAL unnest(fc.narrator_id_array) WITH ORDINALITY AS pos(nar_id, ord) ON true
       JOIN narrators n ON n.id = pos.nar_id
       ORDER BY pos.ord`,
      [id]
    ),

    pool.query(
      `SELECT COALESCE(n.abb_name, n.name) AS scientist,
              j.scientist_id,
              j.say_text,
              CASE
                WHEN j.say_text ~* 'صحيح' THEN 'صحيح'
                WHEN j.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND j.say_text !~* 'صحيح' THEN 'حسن'
                WHEN j.say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
                ELSE NULL
              END AS grade
       FROM hadith_judgments j
       LEFT JOIN narrators n ON n.id = j.scientist_id
       WHERE j.hadith_id = $1
       ORDER BY CASE
         WHEN j.say_text ~* 'صحيح' THEN 1
         WHEN j.say_text ~* 'حسن' THEN 2
         WHEN j.say_text ~* 'ضعيف' THEN 3
         ELSE 4
       END, j.scientist_id
       LIMIT 15`,
      [id]
    ),

    pool.query(
      `SELECT t.group_id, COUNT(DISTINCT t.hadith_id)::int AS parallel_count
       FROM takhrij t
       WHERE t.hadith_id = $1
       GROUP BY t.group_id
       LIMIT 1`,
      [id]
    ),
  ])

  if (metaRes.rows.length === 0) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const meta = metaRes.rows[0]
  const groupData = groupRes.rows[0] || { group_id: null, parallel_count: 0 }

  // Deduplicate narrators by id (keeping first occurrence by ord)
  const seenIds = new Set<number>()
  const narrators = chainRes.rows.filter(n => {
    if (seenIds.has(n.id)) return false
    seenIds.add(n.id)
    return true
  })

  return NextResponse.json({
    id: meta.id,
    tarf: meta.tarf,
    book_title: meta.book_title,
    takhrij_author: meta.takhrij_author,
    chain_narrators: narrators,
    judgments: judgmentsRes.rows,
    group_id: groupData.group_id,
    parallel_count: groupData.parallel_count,
  })
}
