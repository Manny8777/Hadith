import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const hadithId = parseInt(searchParams.get('id') || '98545')

  const [takhrij, compoundMatn, comparisonJoin, comparisonDirect, sampleLabels] = await Promise.all([
    // 1. Does this hadith have a takhrij row, and is compound_matn_id populated?
    pool.query(
      `SELECT hadith_id, group_id, compound_matn_id
       FROM takhrij WHERE hadith_id = $1 LIMIT 1`,
      [hadithId]
    ).catch(e => ({ rows: [], error: String(e) })),

    // 2. How many rows in takhrij have compound_matn_id set vs NULL?
    pool.query(
      `SELECT
         COUNT(*)::int                                     AS total_takhrij,
         COUNT(compound_matn_id)::int                     AS with_compound_matn_id,
         COUNT(*) FILTER (WHERE compound_matn_id IS NULL)::int AS null_compound_matn_id
       FROM takhrij`
    ).catch(e => ({ rows: [], error: String(e) })),

    // 3. Join exactly as TakhrijSection does — does it find comparison rows?
    pool.query(
      `SELECT t.hadith_id, mc.description AS matn_description
       FROM takhrij t
       LEFT JOIN matn_comparison mc
         ON mc.master_compound_id = (SELECT compound_matn_id FROM takhrij WHERE hadith_id = $1 LIMIT 1)
         AND mc.slave_hadith_id = t.hadith_id
       WHERE t.group_id = (SELECT group_id FROM takhrij WHERE hadith_id = $1 LIMIT 1)
       LIMIT 20`,
      [hadithId]
    ).catch(e => ({ rows: [], error: String(e) })),

    // 4. Try linking by hadith_id directly (in case slave_hadith_id IS the hadith, not a matn ID)
    pool.query(
      `SELECT master_compound_id, slave_hadith_id, description
       FROM matn_comparison
       WHERE slave_hadith_id = $1
       LIMIT 5`,
      [hadithId]
    ).catch(e => ({ rows: [], error: String(e) })),

    // 5. Sample of what labels exist in matn_comparison
    pool.query(
      `SELECT description, COUNT(*)::int AS cnt
       FROM matn_comparison
       GROUP BY description
       ORDER BY cnt DESC
       LIMIT 20`
    ).catch(e => ({ rows: [], error: String(e) })),
  ])

  return NextResponse.json({
    hadithId,
    takhrij_row: (takhrij as { rows: unknown[] }).rows[0] ?? null,
    takhrij_stats: (compoundMatn as { rows: unknown[] }).rows[0] ?? null,
    join_result: (comparisonJoin as { rows: unknown[] }).rows,
    direct_lookup: (comparisonDirect as { rows: unknown[] }).rows,
    sample_labels: (sampleLabels as { rows: unknown[] }).rows,
  }, { status: 200 })
}
