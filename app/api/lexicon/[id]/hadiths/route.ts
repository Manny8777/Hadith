import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { LEXICON_SCOPE_CTE } from '@/lib/ghareeb'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const itemId = parseInt(id, 10)
  if (isNaN(itemId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  }

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '30', 10)))
  const offset = (page - 1) * limit

  try {
    const itemRes = await pool.query(
      `SELECT id, text, lexicon_id FROM lexicon_items WHERE id = $1`,
      [itemId]
    )
    if (!itemRes.rows[0]) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const countRes = await pool.query<{ total: number }>(
      `WITH ${LEXICON_SCOPE_CTE},
       refs AS (
         SELECT lh.hadith_id
         FROM lexicon_hadith lh
         JOIN lexicon_scope ls ON ls.id = lh.lexicon_item_id

         UNION

         SELECT hsl.hadith_id
         FROM lexicon_hadith lh
         JOIN lexicon_scope ls ON ls.id = lh.lexicon_item_id
         JOIN hadith_service_links hsl ON hsl.service_content_id = lh.hadith_id
       )
       SELECT COUNT(DISTINCT h.main_id)::int AS total
       FROM refs
       JOIN hadith_toc h ON h.main_id = refs.hadith_id`,
      [itemId]
    )

    const hadithRes = await pool.query(
      `WITH ${LEXICON_SCOPE_CTE},
       refs AS (
         SELECT lh.hadith_id
         FROM lexicon_hadith lh
         JOIN lexicon_scope ls ON ls.id = lh.lexicon_item_id

         UNION

         SELECT hsl.hadith_id
         FROM lexicon_hadith lh
         JOIN lexicon_scope ls ON ls.id = lh.lexicon_item_id
         JOIN hadith_service_links hsl ON hsl.service_content_id = lh.hadith_id
       )
       SELECT DISTINCT h.main_id, h.book_id, b.title AS book_title,
              h.tarf, h.part_num, h.page_num, h.tarqeem_harf
       FROM refs
       JOIN hadith_toc h ON h.main_id = refs.hadith_id
       JOIN books b ON b.id = h.book_id
       ORDER BY b.title, h.main_id
       LIMIT $2 OFFSET $3`,
      [itemId, limit, offset]
    )

    return NextResponse.json({
      item: itemRes.rows[0],
      hadiths: hadithRes.rows,
      total: countRes.rows[0]?.total ?? 0,
      page,
      limit,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
