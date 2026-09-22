import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

// Batch narrator lookup by id (preserving order) — hydrates a shareable chain link.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const idsRaw = searchParams.get('ids') || ''
  const ids = idsRaw.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0).slice(0, 5)
  if (ids.length < 1 || ids.length > 5) {
    return NextResponse.json([])
  }
  const arrayLiteral = `ARRAY[${ids.join(', ')}]` // integers only — safe
  const { rows } = await pool.query(
    `SELECT id, name, abb_name, is_companion
     FROM narrators
     WHERE id = ANY(${arrayLiteral})
     ORDER BY array_position(${arrayLiteral}, id)`
  )
  return NextResponse.json(rows)
}
