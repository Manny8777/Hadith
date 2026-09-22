import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(25, Math.max(8, parseInt(searchParams.get('limit') || '20', 10) || 20))

  // Top narrators by chain count
  const topRes = await pool.query<{
    id: number; name: string; chain_count: number
    is_companion: boolean; death_year_num: number | null; tabaqa: string | null
  }>(
    `SELECT n.id, COALESCE(n.abb_name, n.name) as name,
            t.chain_count::int, n.is_companion, n.death_year_num, n.tabaqa
     FROM (
       SELECT nid::int as id, COUNT(*) as chain_count
       FROM isnad_chains, unnest(narrator_id_array) as nid
       GROUP BY nid
       ORDER BY chain_count DESC
       LIMIT $1
     ) t
     JOIN narrators n ON n.id = t.id
     ORDER BY t.chain_count DESC`,
    [limit]
  ).catch(() => ({ rows: [] as never[] }))

  const topNodes = topRes.rows
  if (topNodes.length === 0) return NextResponse.json({ nodes: [], edges: [] })

  const topIds = topNodes.map(n => n.id)

  // Teacher-student edges between top narrators
  // First fetch chains containing any top narrator (GIN index), then extract pairs
  const edgeRes = await pool.query<{ teacher_id: number; student_id: number; weight: number }>(
    `WITH top_chains AS (
       SELECT narrator_id_array
       FROM isnad_chains
       WHERE narrator_id_array && $1::int[]
       LIMIT 80000
     )
     SELECT
       tc.narrator_id_array[gs] AS teacher_id,
       tc.narrator_id_array[gs + 1] AS student_id,
       COUNT(*)::int AS weight
     FROM top_chains tc
     CROSS JOIN generate_series(1, array_length(tc.narrator_id_array, 1) - 1) AS gs
     WHERE tc.narrator_id_array[gs] = ANY($1::int[])
       AND tc.narrator_id_array[gs + 1] = ANY($1::int[])
     GROUP BY teacher_id, student_id
     ORDER BY weight DESC
     LIMIT 200`,
    [topIds]
  ).catch(() => ({ rows: [] as never[] }))

  return NextResponse.json({
    nodes: topNodes,
    edges: edgeRes.rows.map(r => ({
      source: r.teacher_id,
      target: r.student_id,
      weight: r.weight,
    })),
  })
}
