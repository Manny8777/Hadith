import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

// Returns narrators that immediately FOLLOWS or PRECEDES a given narrator
// in any isnad chain (adjacent links). Used to build a chain step-by-step.
// direction=next  -> toward the muqaddim/compiler (arr[pos+1])
// direction=prev  -> toward the Prophet (arr[pos-1])
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const narratorId = parseInt(searchParams.get('narrator_id') || '')
  const direction = searchParams.get('direction') === 'prev' ? 'prev' : 'next'

  if (isNaN(narratorId) || narratorId <= 0) return NextResponse.json([])

  let offset
  let sql
  if (direction === 'next') {
    offset = 1
  } else {
    offset = -1
  }

  const posExpr = offset === 1
    ? 'p.pos + 1'
    : 'p.pos - 1'

  const bounds = direction === 'next'
    ? 'p.pos + 1 <= array_length(ic.narrator_id_array, 1)'
    : 'p.pos - 1 >= 1'

  sql = `
    SELECT f.fid AS id,
           n.name,
           n.abb_name,
           n.is_companion,
           (
             SELECT count(*)
             FROM isnad_chains ic2
             WHERE ic2.narrator_id_array @> ARRAY[$1::integer, f.fid::integer]
           )::int AS pair_count
    FROM (
      SELECT DISTINCT ic.narrator_id_array[${posExpr}] AS fid
      FROM isnad_chains ic
      CROSS JOIN LATERAL generate_subscripts(ic.narrator_id_array, 1) AS p(pos)
      WHERE ic.narrator_id_array @> ARRAY[$1::integer]
        AND array_position(ic.narrator_id_array, $1::integer) = p.pos
        AND ${bounds}
    ) f
    JOIN narrators n ON n.id = f.fid
    ORDER BY pair_count DESC, n.abb_name
    LIMIT 40
  `

  const { rows } = await pool.query(sql, [narratorId])
  return NextResponse.json(rows)
}
