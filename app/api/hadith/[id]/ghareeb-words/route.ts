import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { extractMatnForComparison, splitSanadMatn } from '@/lib/hadithText'
import { cleanDefinition, type GhareebWord } from '@/lib/ghareeb'

export const dynamic = 'force-dynamic'

interface RawRow {
  form_id: number
  form_text: string
  word_id: number
  word_text: string
  definition: string | null
  source_book: string | null
  source_ref_id: number | null
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const hadithId = parseInt(id, 10)
  if (isNaN(hadithId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  }

  try {
    const hadithRes = await pool.query<{ content: string }>(
      `SELECT content FROM hadith_toc WHERE main_id = $1`,
      [hadithId]
    )
    if (!hadithRes.rows[0]) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const matnCompare = extractMatnForComparison(hadithRes.rows[0].content)
    const { matn: matnDisplay } = splitSanadMatn(hadithRes.rows[0].content)
    const matn = matnDisplay || matnCompare

    const linkedRes = await pool.query<RawRow>(
      `WITH linked AS (
         SELECT lh.lexicon_item_id, lh.hadith_id AS ref_id
         FROM lexicon_hadith lh
         WHERE lh.hadith_id = $1

         UNION

         SELECT lh.lexicon_item_id, lh.hadith_id AS ref_id
         FROM lexicon_hadith lh
         WHERE lh.hadith_id IN (
           SELECT hsl.service_content_id
           FROM hadith_service_links hsl
           WHERE hsl.hadith_id = $1
         )
       )
       SELECT DISTINCT ON (li.id)
         li.id AS form_id,
         li.text AS form_text,
         COALESCE(word.id, li.id) AS word_id,
         COALESCE(word.text, li.text) AS word_text,
         COALESCE(hsc.part_text, hsc.tarf, LEFT(hsc.content, 800)) AS definition,
         hsc.book_name AS source_book,
         CASE WHEN hsc.id IS NOT NULL THEN hsc.id::bigint ELSE NULL END AS source_ref_id
       FROM linked
       JOIN lexicon_items li ON li.id = linked.lexicon_item_id
       LEFT JOIN lexicon_items word ON word.id = li.parent_id AND li.is_leaf = true
       LEFT JOIN hadith_service_content hsc ON hsc.id = linked.ref_id
       WHERE li.lexicon_id = 1
       ORDER BY li.id, hsc.book_name NULLS LAST`,
      [hadithId]
    )

    let rows = linkedRes.rows

    if (rows.length === 0 && matnCompare) {
      const fallbackRes = await pool.query<RawRow>(
        `SELECT DISTINCT ON (li.id)
           li.id AS form_id,
           li.text AS form_text,
           word.id AS word_id,
           word.text AS word_text,
           def.definition,
           def.source_book,
           def.source_ref_id
         FROM lexicon_items li
         JOIN lexicon_items word ON word.id = li.parent_id
         LEFT JOIN LATERAL (
           SELECT
             COALESCE(hsc.part_text, hsc.tarf, LEFT(hsc.content, 800)) AS definition,
             hsc.book_name AS source_book,
             hsc.id::bigint AS source_ref_id
           FROM lexicon_hadith lh2
           JOIN hadith_service_content hsc ON hsc.id = lh2.hadith_id
           WHERE lh2.lexicon_item_id IN (li.id, word.id)
           ORDER BY
             CASE WHEN hsc.book_name ILIKE '%نهاية%' THEN 0
                  WHEN hsc.book_name ILIKE '%غريب%' THEN 1
                  ELSE 2 END,
             hsc.id
           LIMIT 1
         ) def ON true
         WHERE li.lexicon_id = 1
           AND li.is_leaf = true
           AND length(normalize_hadith(li.text)) >= 2
           AND normalize_hadith($2) LIKE '%' || normalize_hadith(li.text) || '%'
         ORDER BY li.id
         LIMIT 40`,
        [hadithId, matnCompare]
      )
      rows = fallbackRes.rows
    }

    const words: GhareebWord[] = rows.map(r => ({
      formId: r.form_id,
      formText: r.form_text,
      wordId: r.word_id,
      wordText: r.word_text,
      definition: cleanDefinition(r.definition),
      sourceBook: r.source_book,
      sourceRefId: r.source_ref_id,
    }))

    const seen = new Set<number>()
    const unique = words.filter(w => {
      if (seen.has(w.formId)) return false
      seen.add(w.formId)
      return true
    })

    return NextResponse.json({ words: unique, matn })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
