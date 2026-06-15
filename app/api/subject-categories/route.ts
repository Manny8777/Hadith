import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { rows } = await pool.query(
    `SELECT id, title
     FROM subject_categories
     WHERE parent_id = 1
     ORDER BY left_value`
  )
  return NextResponse.json(rows)
}
