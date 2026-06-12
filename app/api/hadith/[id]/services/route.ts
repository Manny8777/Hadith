import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const mainId = parseInt(id)
  if (isNaN(mainId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const res = await pool.query(
    `SELECT * FROM hadith_services WHERE hadith_id = $1`,
    [mainId]
  )

  if (!res.rows[0]) return NextResponse.json({})

  return NextResponse.json(res.rows[0])
}
