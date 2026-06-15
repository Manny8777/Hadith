import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const narratorId = parseInt(id, 10)
  if (isNaN(narratorId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

  try {
    const res = await pool.query(
      `SELECT id, rawy_text, rawy_text_shape, frequency
       FROM narrator_name_forms
       WHERE rawy_id = $1
       ORDER BY frequency DESC NULLS LAST`,
      [narratorId]
    )
    return NextResponse.json({ name_forms: res.rows })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
