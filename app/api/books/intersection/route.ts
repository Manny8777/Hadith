import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const aStr = searchParams.get('a')
  const bStr = searchParams.get('b')
  const mode = searchParams.get('mode') || 'intersection'

  const bookA = parseInt(aStr || '')
  const bookB = parseInt(bStr || '')
  if (isNaN(bookA) || isNaN(bookB) || bookA === bookB) {
    return NextResponse.json({ error: 'يجب تحديد كتابَين مختلفَين' }, { status: 400 })
  }

  try {
    const [nameRes] = await Promise.all([
      pool.query('SELECT id, title FROM books WHERE id = ANY($1)', [[bookA, bookB]]),
    ])
    const names: Record<number, string> = {}
    for (const row of nameRes.rows) names[row.id] = row.title

    let hadiths: unknown[] = []
    let total = 0

    if (mode === 'intersection') {
      // Find group_ids that appear in BOTH books, then return hadiths from both books
      const countRes = await pool.query(
        `SELECT COUNT(DISTINCT t_a.group_id) AS cnt
         FROM takhrij t_a
         JOIN takhrij t_b ON t_b.group_id = t_a.group_id AND t_b.book_id = $2
         WHERE t_a.book_id = $1`,
        [bookA, bookB]
      )
      total = parseInt(countRes.rows[0]?.cnt || '0')

      const res = await pool.query(
        `SELECT h.main_id, h.book_id, h.tarf, h.tarqeem_harf, h.tarqeem_matboa1,
                g.grade_hint
         FROM (
           SELECT t_a.hadith_id AS ha_id, t_b.hadith_id AS hb_id
           FROM takhrij t_a
           JOIN takhrij t_b ON t_b.group_id = t_a.group_id AND t_b.book_id = $2
           WHERE t_a.book_id = $1
           LIMIT 50
         ) pairs
         JOIN LATERAL (
           SELECT unnest(ARRAY[pairs.ha_id, pairs.hb_id]) AS hid
         ) ids ON true
         JOIN hadith_toc h ON h.main_id = ids.hid
         LEFT JOIN LATERAL (
           SELECT CASE
             WHEN say_text ~* 'صحيح' THEN 'صحيح'
             WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح' THEN 'حسن'
             WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
           END AS grade_hint
           FROM hadith_judgments
           WHERE hadith_id = h.main_id
             AND say_text ~* 'صحيح|إسناده حسن|حديث حسن|سنده حسن|ضعيف|منكر|متروك|موضوع'
           ORDER BY scientist_id LIMIT 1
         ) g ON true
         ORDER BY h.book_id, h.main_id`,
        [bookA, bookB]
      )
      hadiths = res.rows
    } else {
      // unique_a: hadiths in book A whose group_id does NOT appear in book B
      const countRes = await pool.query(
        `SELECT COUNT(DISTINCT t_a.hadith_id) AS cnt
         FROM takhrij t_a
         WHERE t_a.book_id = $1
           AND NOT EXISTS (
             SELECT 1 FROM takhrij t_b
             WHERE t_b.group_id = t_a.group_id AND t_b.book_id = $2
           )`,
        [bookA, bookB]
      )
      total = parseInt(countRes.rows[0]?.cnt || '0')

      const res = await pool.query(
        `SELECT h.main_id, h.book_id, h.tarf, h.tarqeem_harf, h.tarqeem_matboa1,
                g.grade_hint
         FROM takhrij t_a
         JOIN hadith_toc h ON h.main_id = t_a.hadith_id
         LEFT JOIN LATERAL (
           SELECT CASE
             WHEN say_text ~* 'صحيح' THEN 'صحيح'
             WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح' THEN 'حسن'
             WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
           END AS grade_hint
           FROM hadith_judgments
           WHERE hadith_id = h.main_id
             AND say_text ~* 'صحيح|إسناده حسن|حديث حسن|سنده حسن|ضعيف|منكر|متروك|موضوع'
           ORDER BY scientist_id LIMIT 1
         ) g ON true
         WHERE t_a.book_id = $1
           AND NOT EXISTS (
             SELECT 1 FROM takhrij t_b
             WHERE t_b.group_id = t_a.group_id AND t_b.book_id = $2
           )
         ORDER BY h.main_id
         LIMIT 50`,
        [bookA, bookB]
      )
      hadiths = res.rows
    }

    return NextResponse.json({
      hadiths,
      total,
      bookATitle: names[bookA] || '',
      bookBTitle: names[bookB] || '',
      mode,
    })
  } catch (err) {
    console.error('intersection error', err)
    return NextResponse.json({ error: 'خطأ في قاعدة البيانات' }, { status: 500 })
  }
}
