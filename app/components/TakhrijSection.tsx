import { cache } from 'react'
import pool from '@/lib/db'
import { extractMatnForComparison } from '@/lib/hadithText'
import TakhrijClient from './TakhrijClient'
import type { OtherTakhrijSource, TakhrijRow } from './TakhrijClient'

// cache(): the header badges and the section body both read this within one request.
const fetchTakhrij = cache(async (hadithId: number): Promise<{
  rows: TakhrijRow[]
  otherSources: OtherTakhrijSource[]
  sourceId: number
  currentCompanionId: number | null
  totalBooks: number
  truncated: boolean
  baseText: string | null
}> => {
  const groupRes = await pool.query(
    `SELECT group_id, compound_matn_id
     FROM takhrij
     WHERE hadith_id = $1 AND group_id IS NOT NULL
     ORDER BY group_id`,
    [hadithId]
  )
  if (groupRes.rows.length === 0) {
    return { rows: [], otherSources: [], sourceId: hadithId, currentCompanionId: null, totalBooks: 0, truncated: false, baseText: null }
  }
  const groupIds = groupRes.rows.map(row => Number(row.group_id))
  const refCompoundIds = groupRes.rows
    .map(row => row.compound_matn_id == null ? null : Number(row.compound_matn_id))
    .filter((value): value is number => Number.isFinite(value))

  const currentCompRes = await pool.query(
    `SELECT ic.narrator_id_array[1] as companion_id
     FROM isnad_hadiths ih JOIN isnad_chains ic ON ic.id = ih.isnad_id
     WHERE ih.hadith_id = $1 AND ic.narrator_id_array[1] IS NOT NULL LIMIT 1`,
    [hadithId]
  ).catch(() => ({ rows: [] }))
  const currentCompanionId: number | null = currentCompRes.rows[0]?.companion_id ?? null

  const result = await pool.query(
    `SELECT DISTINCT ON (t.hadith_id)
       t.hadith_id          AS main_id,
       t.book_id,
       b.title              AS book_title,
       b.strong             AS book_strong,
       b.fame               AS book_fame,
       b.takhrij_author     AS book_takhrij_author,
       b.takhrij_death      AS book_takhrij_death,
       h.tarf,
       h.section_text,
       h.chapter_text,
       h.part_num,
       h.page_num,
       h.tarqeem_harf,
       h.tarqeem_matboa1,
       jg.grade_hint,
       comp.companion_id,
       mc.description AS matn_description
     FROM takhrij t
     JOIN hadith_toc h ON h.main_id = t.hadith_id
     JOIN books b ON b.id = t.book_id
     LEFT JOIN matn_comparison mc ON
       mc.master_compound_id = ANY($3::int[])
       AND mc.slave_hadith_id = t.hadith_id
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
     WHERE t.group_id = ANY($1::int[])
     ORDER BY
       t.hadith_id,
       CASE WHEN t.hadith_id = $2 THEN 0 ELSE 1 END,
       b.strong ASC NULLS LAST,
       b.takhrij_death ASC NULLS LAST
     LIMIT 501`,
    [groupIds, hadithId, refCompoundIds]
  )

  const allRows = result.rows as Array<typeof result.rows[0] & {
    companion_id: number | null
  }>

  const truncated = allRows.length > 500
  const sliced = truncated ? allRows.slice(0, 500) : allRows

  const classified: TakhrijRow[] = sliced.map(r => ({
    main_id: Number(r.main_id),
    book_id: Number(r.book_id),
    book_title: r.book_title as string | null,
    book_strong: r.book_strong != null ? Number(r.book_strong) : null,
    book_fame: r.book_fame != null ? Number(r.book_fame) : null,
    book_takhrij_author: r.book_takhrij_author as string | null,
    book_takhrij_death: r.book_takhrij_death != null ? Number(r.book_takhrij_death) : null,
    tarf: r.tarf as string | null,
    section_text: r.section_text as string | null,
    chapter_text: r.chapter_text as string | null,
    part_num: Number(r.part_num) || 0,
    page_num: Number(r.page_num) || 0,
    tarqeem_harf: r.tarqeem_harf as string | null,
    tarqeem_matboa1: r.tarqeem_matboa1 as string | null,
    grade_hint: r.grade_hint as string | null,
    matn_description: (r.matn_description as string | null) ?? null,
    kind: !currentCompanionId || !r.companion_id
      ? 'other'
      : r.companion_id === currentCompanionId
        ? 'mutabaa'
        : 'shahid',
  }))

  const totalBooksRes = await pool.query<{ total_books: number }>(
    `SELECT COUNT(DISTINCT t.hadith_id)::int AS total_books
     FROM takhrij t
     JOIN hadith_toc ht ON ht.main_id = t.hadith_id AND ht.is_leaf = true AND ht.is_paragraph = true
     WHERE t.group_id = ANY($1::int[])` ,
    [groupIds]
  )
  const totalBooks = Number(totalBooksRes.rows[0]?.total_books || classified.length)

  const baseContentRes = await pool.query(
    `SELECT content FROM hadith_toc WHERE main_id = $1`,
    [hadithId]
  ).catch(() => ({ rows: [] }))
  const baseRaw: string | null = baseContentRes.rows[0]?.content ?? null
  const baseText = baseRaw ? extractMatnForComparison(baseRaw) : null

  const otherSourcesRes = await pool.query(
    `SELECT DISTINCT ON (hsc.book_id)
       hsc.id,
       hsc.book_id,
       COALESCE(b.title, hsc.book_name, 'مصدر') AS book_title,
       hsc.section_text,
       hsc.part_text AS chapter_text,
       hsc.part_num,
       hsc.page_num,
       hsc.tarf
     FROM hadith_service_links hsl
     JOIN hadith_service_content hsc ON hsc.id = hsl.service_content_id
     LEFT JOIN books b ON b.id = hsc.book_id
     WHERE hsl.hadith_id = $1
       AND hsl.type_id = 8
     ORDER BY hsc.book_id, hsc.id
     LIMIT 50`,
    [hadithId]
  ).catch(() => ({ rows: [] }))

  const otherSources: OtherTakhrijSource[] = otherSourcesRes.rows.map(r => ({
    id: Number(r.id),
    href: `/service-content/${Number(r.id)}`,
    book_id: r.book_id != null ? Number(r.book_id) : null,
    book_title: String(r.book_title || 'مصدر'),
    section_text: r.section_text as string | null,
    chapter_text: r.chapter_text as string | null,
    part_num: Number(r.part_num) || 0,
    page_num: Number(r.page_num) || 0,
    tarf: r.tarf as string | null,
  }))

  return { rows: classified, otherSources, sourceId: hadithId, currentCompanionId, totalBooks, truncated, baseText }
})

// Counts shown in the التخريج section header, visible before the section is opened.
export async function TakhrijBadges({ hadithId }: { hadithId: number }) {
  const { rows } = await fetchTakhrij(hadithId)
  if (rows.length === 0) return null
  const books = new Set(rows.map(r => r.book_id)).size
  const mutabaat = rows.filter(r => r.kind === 'mutabaa').length
  const shawahid = rows.filter(r => r.kind === 'shahid').length
  return (
    <>
      <span className="ui-chip">{rows.length} رواية في {books} كتاب</span>
      {mutabaat > 0 && <span className="ui-chip-info">{mutabaat} متابعة</span>}
      {shawahid > 0 && <span className="ui-chip-violet">{shawahid} شاهد</span>}
    </>
  )
}

export default async function TakhrijSection({
  hadithId,
}: {
  hadithId: number
  currentHadithId?: number
}) {
  const { rows, otherSources, sourceId, totalBooks, truncated, baseText } = await fetchTakhrij(hadithId)

  if (rows.length === 0) return (
    <p className="text-sm text-gray-400 py-4">لا يوجد تخريج مسجل لهذا الحديث في قاعدة البيانات</p>
  )

  const mutabaatCount = rows.filter(r => r.kind === 'mutabaa').length
  const shawahidCount = rows.filter(r => r.kind === 'shahid').length

  return (
    <TakhrijClient
      rows={rows}
      otherSources={otherSources}
      sourceId={sourceId}
      totalBooks={totalBooks}
      mutabaatCount={mutabaatCount}
      shawahidCount={shawahidCount}
      truncated={truncated}
      baseText={baseText}
    />
  )
}
