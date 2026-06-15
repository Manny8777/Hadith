import pool from '@/lib/db'
import TakhrijClient from './TakhrijClient'
import type { TakhrijRow } from './TakhrijClient'

async function fetchTakhrij(hadithId: number): Promise<{
  rows: TakhrijRow[]
  sourceId: number
  currentCompanionId: number | null
  totalBooks: number
  truncated: boolean
}> {
  const groupRes = await pool.query(
    `SELECT group_id FROM takhrij WHERE hadith_id = $1 LIMIT 1`,
    [hadithId]
  )
  if (!groupRes.rows[0]) return { rows: [], sourceId: hadithId, currentCompanionId: null, totalBooks: 0, truncated: false }
  const groupId = groupRes.rows[0].group_id

  const currentCompRes = await pool.query(
    `SELECT ic.narrator_id_array[1] as companion_id
     FROM isnad_hadiths ih JOIN isnad_chains ic ON ic.id = ih.isnad_id
     WHERE ih.hadith_id = $1 AND ic.narrator_id_array[1] IS NOT NULL LIMIT 1`,
    [hadithId]
  ).catch(() => ({ rows: [] }))
  const currentCompanionId: number | null = currentCompRes.rows[0]?.companion_id ?? null

  const result = await pool.query(
    `SELECT
       t.hadith_id          AS main_id,
       t.book_id,
       b.title              AS book_title,
       b.strong             AS book_strong,
       b.fame               AS book_fame,
       b.takhrij_author     AS book_takhrij_author,
       b.takhrij_death      AS book_takhrij_death,
       h.tarf,
       h.part_num,
       h.page_num,
       h.tarqeem_harf,
       h.tarqeem_matboa1,
       jg.grade_hint,
       comp.companion_id
     FROM takhrij t
     JOIN hadith_toc h ON h.main_id = t.hadith_id
     JOIN books b ON b.id = t.book_id
     LEFT JOIN LATERAL (
       SELECT ic.narrator_id_array[1] as companion_id
       FROM isnad_hadiths ih2 JOIN isnad_chains ic ON ic.id = ih2.isnad_id
       WHERE ih2.hadith_id = t.hadith_id AND ic.narrator_id_array[1] IS NOT NULL LIMIT 1
     ) comp ON true
     LEFT JOIN LATERAL (
       SELECT CASE
         WHEN say_text ~* 'صحيح' THEN 'صحيح'
         WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح' THEN 'حسن'
         WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
         ELSE NULL END as grade_hint
       FROM hadith_judgments j2
       WHERE j2.hadith_id = t.hadith_id
         AND j2.say_text ~* 'صحيح|إسناده حسن|حديث حسن|سنده حسن|ضعيف|منكر|متروك'
       ORDER BY CASE
         WHEN j2.say_text ~* 'صحيح' THEN 1
         WHEN j2.say_text ~* 'حسن'  THEN 2
         ELSE 3 END
       LIMIT 1
     ) jg ON true
     WHERE t.group_id = $1
     ORDER BY
       CASE WHEN t.hadith_id = $2 THEN 0 ELSE 1 END,
       b.strong ASC NULLS LAST,
       t.hadith_id
     LIMIT 121`,
    [groupId, hadithId]
  )

  const allRows = result.rows as Array<typeof result.rows[0] & {
    companion_id: number | null
  }>

  const truncated = allRows.length > 120
  const sliced = truncated ? allRows.slice(0, 120) : allRows

  const classified: TakhrijRow[] = sliced.map(r => ({
    main_id: Number(r.main_id),
    book_id: Number(r.book_id),
    book_title: r.book_title as string | null,
    book_strong: r.book_strong != null ? Number(r.book_strong) : null,
    book_fame: r.book_fame != null ? Number(r.book_fame) : null,
    book_takhrij_author: r.book_takhrij_author as string | null,
    book_takhrij_death: r.book_takhrij_death != null ? Number(r.book_takhrij_death) : null,
    tarf: r.tarf as string | null,
    part_num: Number(r.part_num) || 0,
    page_num: Number(r.page_num) || 0,
    tarqeem_harf: r.tarqeem_harf as string | null,
    tarqeem_matboa1: r.tarqeem_matboa1 as string | null,
    grade_hint: r.grade_hint as string | null,
    kind: !currentCompanionId || !r.companion_id
      ? 'other'
      : r.companion_id === currentCompanionId
        ? 'mutabaa'
        : 'shahid',
  }))

  const totalBooks = new Set(classified.map(r => r.book_id)).size
  const mutabaatCount = classified.filter(r => r.kind === 'mutabaa').length
  const shawahidCount = classified.filter(r => r.kind === 'shahid').length

  return { rows: classified, sourceId: hadithId, currentCompanionId, totalBooks, truncated }
}

export default async function TakhrijSection({
  hadithId,
}: {
  hadithId: number
  currentHadithId?: number
}) {
  const { rows, sourceId, totalBooks, truncated } = await fetchTakhrij(hadithId)

  if (rows.length === 0) return (
    <p className="text-sm text-gray-400 py-4">لا يوجد تخريج مسجل لهذا الحديث في قاعدة البيانات</p>
  )

  const mutabaatCount = rows.filter(r => r.kind === 'mutabaa').length
  const shawahidCount = rows.filter(r => r.kind === 'shahid').length

  return (
    <TakhrijClient
      rows={rows}
      sourceId={sourceId}
      totalBooks={totalBooks}
      mutabaatCount={mutabaatCount}
      shawahidCount={shawahidCount}
      truncated={truncated}
    />
  )
}
