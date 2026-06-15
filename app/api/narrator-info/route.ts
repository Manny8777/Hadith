import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = parseInt(searchParams.get('id') || '')
  if (isNaN(id)) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  const { rows } = await pool.query(
    `SELECT id, name, martaba_ibn_hajar, tabaqa FROM narrators WHERE id = $1`,
    [id]
  )
  if (!rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(rows[0])
}
