import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { extractMatnForComparison } from '@/lib/hadithText'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const mainId = parseInt(id)
  if (isNaN(mainId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const res = await pool.query(
    `SELECT content FROM hadith_toc WHERE main_id = $1`,
    [mainId]
  )
  const raw: string | null = res.rows[0]?.content ?? null
  const text = raw ? extractMatnForComparison(raw) : null
  return NextResponse.json({ text })
}
