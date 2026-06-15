import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const hadithId = parseInt(id, 10)
  if (isNaN(hadithId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

  try {
    // Find quran ayat referenced by this hadith via the service content tree:
    // hadith → judgment_hits → judgment_links → service_content node
    // Then find if any quran_ayat_services ancestor node matches
    const res = await pool.query(
      `SELECT DISTINCT q.sura, q.aya, s.name AS sura_name, a.text AS aya_text
       FROM hadith_judgment_hits hjh
       JOIN hadith_judgment_links hjl ON hjl.say_id = hjh.say_id AND hjl.is_book_toc = false
       JOIN hadith_service_content jlc ON jlc.id = hjl.service_main_id
       JOIN hadith_service_content anc
         ON anc.book_id = jlc.book_id
         AND anc.left_value <= jlc.left_value
         AND anc.right_value >= jlc.right_value
       JOIN quran_ayat_services q ON q.service_main_id = anc.id
       JOIN quran_suras s ON s.id = q.sura
       LEFT JOIN quran_ayat a ON a.sora_id = q.sura AND a.aya_num = q.aya
       WHERE hjh.hadith_id = $1
       ORDER BY q.sura, q.aya`,
      [hadithId]
    )
    return NextResponse.json({ quran_refs: res.rows })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
