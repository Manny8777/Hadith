import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { extractMatnForComparison, splitSanadMatn } from '@/lib/hadithText'
import { normalizeArabic, wordDice, prepareForComparison } from '@/lib/arabicSimilarity'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const hadithId = parseInt(id)
  if (isNaN(hadithId)) return NextResponse.json({ results: [] })

  // Fetch base hadith content
  const baseRes = await pool.query(
    `SELECT content FROM hadith_toc WHERE main_id = $1`,
    [hadithId]
  ).catch(() => ({ rows: [] }))

  const baseRaw: string | null = baseRes.rows[0]?.content ?? null
  const baseMatn = baseRaw ? extractMatnForComparison(baseRaw) : ''
  if (!baseMatn) return NextResponse.json({ results: [], error: 'no_base_matn' })

  const baseDisplay = baseRaw ? (splitSanadMatn(baseRaw).matn || '') : ''

  // Fetch all parallel hadiths in the same takhrij group + their old label
  const parallelRes = await pool.query(
    `SELECT
       t.hadith_id,
       h.content,
       b.title        AS book_title,
       b.takhrij_death,
       h.tarqeem_harf,
       h.tarqeem_matboa1,
       -- The original's own wording for "this hadith's matn vs that one's", keyed the way the
       -- original keys it: master = the HADITH being viewed. matn_comparison is keyed by compound
       -- (the app's own earlier extract), which is why it is the fallback, not the first source.
       COALESCE(lc.description, mc.description) AS old_label
     FROM takhrij t
     JOIN hadith_toc h  ON h.main_id  = t.hadith_id
     JOIN books b       ON b.id       = h.book_id
     LEFT JOIN LATERAL (
       SELECT v.description
         FROM matn_comparison_hadith_v v
        WHERE v.master_hadith_id = $1
          AND v.slave_hadith_id  = t.hadith_id
        LIMIT 1
     ) lc ON true
     LEFT JOIN matn_comparison mc
       ON mc.master_compound_id = (
            SELECT compound_matn_id FROM takhrij WHERE hadith_id = $1 LIMIT 1
          )
       AND mc.slave_hadith_id = t.hadith_id
     WHERE t.group_id = (
       SELECT group_id FROM takhrij WHERE hadith_id = $1 LIMIT 1
     )
     LIMIT 150`,
    [hadithId]
  ).catch(() => ({ rows: [] }))

  const baseNormalized = normalizeArabic(baseMatn)
  const baseWords = baseNormalized.split(/\s+/).filter(Boolean).length

  const results = parallelRes.rows.map(row => {
    const content = (row.content as string) || ''
    const compMatn = content ? extractMatnForComparison(content) : ''
    const matnNormalized = compMatn ? normalizeArabic(compMatn) : ''
    const score = matnNormalized ? wordDice(baseNormalized, matnNormalized) : 0
    const { matn: matnDisplay } = splitSanadMatn(content)
    return {
      hadith_id:      Number(row.hadith_id),
      book_title:     (row.book_title as string | null) ?? null,
      book_death:     row.takhrij_death != null ? Number(row.takhrij_death) : null,
      num_harf:       (row.tarqeem_harf    as string | null) ?? null,
      num_matboa:     (row.tarqeem_matboa1 as string | null) ?? null,
      old_label:      row.old_label ? (row.old_label as string).replace(/\.$/, '').trim() : null,
      matn_display:   matnDisplay || null,
      matn_normalized: matnNormalized,
      score:          Math.round(score * 100),
      is_source:      Number(row.hadith_id) === hadithId,
    }
  }).sort((a, b) => b.score - a.score)

  return NextResponse.json({
    results,
    base_word_count:  baseWords,
    base_matn_display: baseDisplay,
    base_matn_normalized: prepareForComparison(baseDisplay),
  })
}
