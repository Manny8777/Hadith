import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const idsParam = searchParams.get('ids') || ''
  const ids = idsParam
    .split(',')
    .map(s => parseInt(s.trim()))
    .filter(n => !isNaN(n) && n > 0)
    .slice(0, 100) // cap at 100

  if (ids.length === 0) return NextResponse.json({ hadiths: [] })

  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',')
  const { rows } = await pool.query(
    `SELECT h.main_id, h.book_id, b.title as book_title, b.takhrij_author, b.takhrij_death,
            h.tarf, h.section_text, h.chapter_text, h.part_num, h.page_num,
            h.tarqeem_harf, h.tarqeem_matboa1,
            jg.grade_hint,
            tk.group_id
     FROM hadith_toc h
     JOIN books b ON b.id = h.book_id
     LEFT JOIN LATERAL (
       SELECT CASE
         WHEN say_text ~* 'صحيح' THEN 'صحيح'
         WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح' THEN 'حسن'
         WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
         ELSE NULL END as grade_hint
       FROM hadith_judgments j2
       WHERE j2.hadith_id = h.main_id
         AND (j2.say_text ~* 'صحيح|إسناده حسن|حديث حسن|سنده حسن|ضعيف|منكر|متروك')
       ORDER BY CASE
         WHEN j2.say_text ~* 'صحيح' THEN 1
         WHEN j2.say_text ~* 'حسن' THEN 2
         ELSE 3 END
       LIMIT 1
     ) jg ON true
     LEFT JOIN LATERAL (
       SELECT group_id FROM takhrij WHERE hadith_id = h.main_id LIMIT 1
     ) tk ON true
     WHERE h.main_id = ANY(ARRAY[${placeholders}]::integer[])`,
    ids
  )

  // Return in same order as requested IDs
  const byId = Object.fromEntries(rows.map(r => [r.main_id, r]))
  const ordered = ids.map(id => byId[id]).filter(Boolean)

  return NextResponse.json({ hadiths: ordered })
}
