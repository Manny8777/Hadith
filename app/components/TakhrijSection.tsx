import pool from '@/lib/db'
import Link from 'next/link'

interface TakhrijRow {
  main_id: number
  book_id: number
  book_title: string | null
  tarf: string | null
  part_num: number
  page_num: number
  tarqeem_harf: string | null
  tarqeem_matboa1: string | null
  grade_hint: string | null
  chain_depth: number | null
  companion_id: number | null
  companion_name: string | null
}

function stripTags(html: string): string {
  return (html || '')
    .replace(/<رقم_حديث[^>]*>[\s\S]*?<!--رقم_حديث-->/g, '')
    .replace(/<رقم_الفقرة[^/]*\/>/g, '')
    .replace(/<نه\/>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 10)))
    .replace(/^\s*[-–—]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchTakhrij(hadithId: number): Promise<{
  rows: TakhrijRow[]
  currentCompanionId: number | null
  totalBooks: number
}> {
  const groupRes = await pool.query(
    `SELECT group_id FROM takhrij WHERE hadith_id = $1 LIMIT 1`,
    [hadithId]
  )
  if (!groupRes.rows[0]) return { rows: [], currentCompanionId: null, totalBooks: 0 }
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
       t.hadith_id  AS main_id,
       t.book_id,
       b.title      AS book_title,
       h.tarf,
       h.part_num,
       h.page_num,
       h.tarqeem_harf,
       h.tarqeem_matboa1,
       jg.grade_hint,
       cd.chain_depth,
       comp.companion_id,
       n.name AS companion_name
     FROM takhrij t
     JOIN hadith_toc h ON h.main_id = t.hadith_id
     JOIN books b ON b.id = t.book_id
     LEFT JOIN LATERAL (
       SELECT ic.narrator_id_array[1] as companion_id
       FROM isnad_hadiths ih2 JOIN isnad_chains ic ON ic.id = ih2.isnad_id
       WHERE ih2.hadith_id = t.hadith_id AND ic.narrator_id_array[1] IS NOT NULL LIMIT 1
     ) comp ON true
     LEFT JOIN narrators n ON n.id = comp.companion_id
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
         WHEN j2.say_text ~* 'حسن' THEN 2
         ELSE 3 END
       LIMIT 1
     ) jg ON true
     LEFT JOIN LATERAL (
       SELECT MIN(ic.chain_length) as chain_depth
       FROM isnad_hadiths ih2 JOIN isnad_chains ic ON ic.id = ih2.isnad_id
       WHERE ih2.hadith_id = t.hadith_id
     ) cd ON true
     WHERE t.group_id = $1 AND t.hadith_id != $2
     ORDER BY
       CASE WHEN comp.companion_id = $3 THEN 0 ELSE 1 END,
       comp.companion_id NULLS LAST,
       t.book_id,
       t.hadith_id
     LIMIT 80`,
    [groupId, hadithId, currentCompanionId]
  )

  const totalBooks = new Set(result.rows.map((r: TakhrijRow) => r.book_id)).size
  return { rows: result.rows as TakhrijRow[], currentCompanionId, totalBooks }
}

export default async function TakhrijSection({ hadithId }: { hadithId: number }) {
  const { rows, currentCompanionId, totalBooks } = await fetchTakhrij(hadithId)
  if (rows.length === 0) return (
    <p className="text-sm text-gray-400 py-4">لا يوجد تخريج مسجل لهذا الحديث في قاعدة البيانات</p>
  )

  // Classify rows
  const classified = rows.map(r => ({
    ...r,
    kind: !currentCompanionId || !r.companion_id
      ? 'other' as const
      : r.companion_id === currentCompanionId
        ? 'mutabaa' as const
        : 'shahid' as const,
  }))

  const mutabaatCount = classified.filter(r => r.kind === 'mutabaa').length
  const shawahidCount = classified.filter(r => r.kind === 'shahid').length
  const hasGroups = mutabaatCount > 0 || shawahidCount > 0

  // Unique companions for شواهد
  const shahidCompanions = Array.from(
    new Map(classified.filter(r => r.kind === 'shahid' && r.companion_id).map(r => [r.companion_id, r.companion_name])).entries()
  )

  let rowNum = 0

  return (
    <div dir="rtl">
      {/* Summary bar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap text-xs">
        <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full font-medium">
          {rows.length} رواية في {totalBooks} كتاب
        </span>
        {mutabaatCount > 0 && (
          <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full font-medium">
            {mutabaatCount} متابعة
          </span>
        )}
        {shawahidCount > 0 && (
          <span className="bg-violet-50 text-violet-700 border border-violet-200 px-2.5 py-1 rounded-full font-medium">
            {shawahidCount} شاهد
          </span>
        )}
        {shahidCompanions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {shahidCompanions.map(([cid, cname]) => (
              <Link key={cid!} href={`/narrator/${cid}`}
                className="text-xs text-violet-600 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-full hover:border-violet-300 transition-colors">
                {cname}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
        {/* Table header */}
        <div className="grid bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500"
          style={{ gridTemplateColumns: '2rem 1fr 5rem 5.5rem 4rem' }}>
          <div className="px-3 py-2.5 text-center">#</div>
          <div className="px-3 py-2.5">بداية الحديث</div>
          <div className="px-3 py-2.5">الكتاب</div>
          <div className="px-3 py-2.5 text-center">رقم الحديث</div>
          <div className="px-3 py-2.5 text-center">الجزء/الصفحة</div>
        </div>

        {/* Rows — with section separators for mutabaat / shawahid */}
        {(() => {
          const sections: Array<{ label: string | null; color: string | null; rows: typeof classified }> = hasGroups
            ? [
                { label: `المتابعات (${mutabaatCount})`, color: 'blue',   rows: classified.filter(r => r.kind === 'mutabaa') },
                { label: `الشواهد (${shawahidCount})`,   color: 'violet', rows: classified.filter(r => r.kind === 'shahid') },
                { label: classified.filter(r => r.kind === 'other').length > 0 ? `روايات أخرى (${classified.filter(r => r.kind === 'other').length})` : null, color: 'gray', rows: classified.filter(r => r.kind === 'other') },
              ].filter(s => s.rows.length > 0)
            : [{ label: null, color: null, rows: classified }]

          return sections.map((section, si) => (
            <div key={si}>
              {section.label && (
                <div className={`px-3 py-1.5 text-xs font-bold border-b ${
                  section.color === 'blue'   ? 'bg-blue-50 text-blue-700 border-blue-100' :
                  section.color === 'violet' ? 'bg-violet-50 text-violet-700 border-violet-100' :
                  'bg-gray-50 text-gray-500 border-gray-100'
                }`}>
                  {section.label}
                </div>
              )}
              {section.rows.map((row) => {
                rowNum++
                const num = row.tarqeem_harf?.trim() || row.tarqeem_matboa1?.trim() || null
                const tarf = row.tarf ? stripTags(row.tarf).slice(0, 90) : `حديث رقم ${row.main_id}`
                const isLong = row.tarf && stripTags(row.tarf).length > 90
                return (
                  <div key={row.main_id}
                    className="grid border-b border-gray-100 last:border-b-0 hover:bg-green-50 transition-colors text-sm"
                    style={{ gridTemplateColumns: '2rem 1fr 5rem 5.5rem 4rem' }}>

                    {/* Row number */}
                    <div className="px-3 py-2.5 text-center text-xs text-gray-400 self-center">
                      {rowNum}
                    </div>

                    {/* Hadith tarf */}
                    <div className="px-3 py-2.5 self-center min-w-0">
                      <Link href={`/hadith/${row.main_id}`}
                        className="text-gray-800 hover:text-green-800 leading-snug block">
                        {tarf}{isLong ? '…' : ''}
                      </Link>
                      {row.grade_hint && (
                        <span className={`inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          row.grade_hint === 'صحيح' ? 'bg-green-100 text-green-700' :
                          row.grade_hint === 'حسن'  ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-600'
                        }`}>
                          {row.grade_hint}
                        </span>
                      )}
                    </div>

                    {/* Book */}
                    <div className="px-3 py-2.5 self-center">
                      <Link href={`/books/${row.book_id}`}
                        className="text-xs text-green-700 hover:underline leading-snug block truncate"
                        title={row.book_title || ''}>
                        {row.book_title || `كتاب ${row.book_id}`}
                      </Link>
                    </div>

                    {/* Hadith number */}
                    <div className="px-3 py-2.5 text-center self-center">
                      {num ? (
                        <Link href={`/hadith/${row.main_id}`}
                          className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded hover:bg-blue-100 transition-colors">
                          {num}
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </div>

                    {/* Part / Page */}
                    <div className="px-3 py-2.5 text-center self-center text-xs text-gray-400">
                      {row.part_num > 0 || row.page_num > 0 ? (
                        <span>
                          {row.part_num > 0 && `ج${row.part_num}`}
                          {row.part_num > 0 && row.page_num > 0 && '/'}
                          {row.page_num > 0 && `${row.page_num}`}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        })()}
      </div>

      {rows.length >= 80 && (
        <p className="text-xs text-gray-400 mt-2 text-center">
          يُعرض أول 80 رواية — لمزيد من الطرق انظر صفحة الشواهد الكاملة
        </p>
      )}
    </div>
  )
}
