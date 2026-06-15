import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const res = await pool.query(
      `SELECT s.id, s.name, s.has_tafsser, s.has_qera,
              COUNT(a.id) AS aya_count
       FROM quran_suras s
       LEFT JOIN quran_ayat a ON a.sora_id = s.id
       GROUP BY s.id, s.name, s.has_tafsser, s.has_qera
       ORDER BY s.id`
    )
    return NextResponse.json({ suras: res.rows })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
