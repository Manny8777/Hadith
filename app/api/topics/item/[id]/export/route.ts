import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const itemId = parseInt(id)
  if (isNaN(itemId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const itemRes = await pool.query(
    `SELECT id, title FROM subject_items WHERE id = $1`,
    [itemId]
  )
  if (!itemRes.rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { rows: hadiths } = await pool.query(
    `SELECT h.main_id, h.book_id, b.title AS book_title,
            b.takhrij_author, b.takhrij_death,
            h.tarf, h.part_num, h.page_num,
            h.section_text, h.chapter_text,
            h.tarqeem_harf, h.tarqeem_matboa1,
            jg.grade_hint
     FROM hadith_subjects hs
     JOIN hadith_toc h ON h.main_id = hs.hadith_id
     JOIN books b ON b.id = h.book_id
     LEFT JOIN LATERAL (
       SELECT CASE
         WHEN say_text ~* 'صحيح' THEN 'صحيح'
         WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح' THEN 'حسن'
         WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
         ELSE NULL END as grade_hint
       FROM hadith_judgments j2
       WHERE j2.hadith_id = h.main_id
         AND j2.say_text ~* 'صحيح|إسناده حسن|حديث حسن|سنده حسن|ضعيف|منكر|متروك'
       ORDER BY CASE
         WHEN j2.say_text ~* 'صحيح' THEN 1
         WHEN j2.say_text ~* 'حسن' THEN 2
         ELSE 3 END
       LIMIT 1
     ) jg ON true
     WHERE hs.subject_id = $1
     ORDER BY h.book_id, h.main_id
     LIMIT 200`,
    [itemId]
  )

  return NextResponse.json({
    item: itemRes.rows[0],
    hadiths,
    total: hadiths.length,
  })
}
