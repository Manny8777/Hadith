import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sura_id: string }> }
) {
  const { sura_id } = await params
  const suraId = parseInt(sura_id, 10)
  if (isNaN(suraId)) return NextResponse.json({ error: 'Invalid sura ID' }, { status: 400 })

  try {
    const [suraRes, ayatRes] = await Promise.all([
      pool.query('SELECT * FROM quran_suras WHERE id = $1', [suraId]),
      pool.query(
        `SELECT a.id, a.aya_num, a.text, a.has_tafsser, a.has_qera, a.kerat_text,
                COUNT(qs.id) AS service_count
         FROM quran_ayat a
         LEFT JOIN quran_ayat_services qs ON qs.sura = $1 AND qs.aya = a.aya_num
         WHERE a.sora_id = $1
         GROUP BY a.id, a.aya_num, a.text, a.has_tafsser, a.has_qera, a.kerat_text
         ORDER BY a.aya_num`,
        [suraId]
      )
    ])

    if (suraRes.rows.length === 0) {
      return NextResponse.json({ error: 'Sura not found' }, { status: 404 })
    }

    return NextResponse.json({ sura: suraRes.rows[0], ayat: ayatRes.rows })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
