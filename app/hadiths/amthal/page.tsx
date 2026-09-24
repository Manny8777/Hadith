import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'أمثال الحديث النبوي — جامع خادم الحرمين' }

interface AmthalRow {
  id: number
  text: string
  hadith_ids: number[]
  chapter_names: string[]
}

export default async function AmthalPage() {
  const { rows } = await pool.query<AmthalRow>(
    `WITH proverb_links AS (
       SELECT DISTINCT
              hsl.hadith_id,
              m.match[1]::int AS proverb_id,
              ht.chapter_text
       FROM hadith_service_links hsl
       JOIN hadith_service_content hsc ON hsc.id = hsl.service_content_id
       JOIN hadith_toc ht ON ht.main_id = hsl.hadith_id
       CROSS JOIN LATERAL regexp_matches(hsc.content, 'ربط="(77[0-9]+)"', 'g') AS m(match)
       WHERE hsl.type_id = 4
     )
     SELECT
       a.id,
       a.text,
       COALESCE(array_agg(DISTINCT pl.hadith_id) FILTER (WHERE pl.hadith_id IS NOT NULL), '{}') AS hadith_ids,
       COALESCE(array_agg(DISTINCT pl.chapter_text) FILTER (WHERE pl.chapter_text IS NOT NULL), '{}') AS chapter_names
     FROM amthal a
     LEFT JOIN proverb_links pl ON pl.proverb_id = a.id
     GROUP BY a.id, a.text
     ORDER BY a.id ASC`
  ).catch(() => ({ rows: [] as AmthalRow[] }))

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">أمثال الحديث النبوي</h1>
        <p className="text-sm text-gray-500 mb-4">
          الأمثال الواردة في الأحاديث النبوية الشريفة
        </p>

        <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 mb-2 text-xs text-green-900 flex items-center justify-between">
          <span>
            إجمالي الأمثال: <span className="font-bold">{rows.length.toLocaleString('ar-EG')}</span>
          </span>
          <span className="text-green-700">
            {rows.filter(r => r.hadith_ids.length > 0).length.toLocaleString('ar-EG')} مثل مرتبط بحديث
          </span>
        </div>
      </div>

      <div className="grid gap-3">
        {rows.map((row, idx) => (
          <div
            key={row.id}
            className="bg-white rounded-xl border border-gray-100 px-5 py-4 hover:shadow-sm hover:border-green-200 transition-all group"
          >
            <div className="flex items-start gap-4">
              <span className="shrink-0 mt-1 w-8 h-8 flex items-center justify-center rounded-full bg-green-50 text-green-700 text-xs font-bold border border-green-100 group-hover:bg-green-100 transition-colors">
                {(idx + 1).toLocaleString('ar-EG')}
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-base leading-loose text-gray-800 font-medium">
                  {row.text}
                </p>

                {row.hadith_ids.length > 0 && (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {row.hadith_ids.slice(0, 3).map((hadithId, index) => (
                      <Link
                        key={hadithId}
                        href={`/hadith/${hadithId}`}
                        className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 transition-all hover:border-green-300 hover:bg-green-100"
                      >
                        حديث {index + 1}
                        <span className="text-green-500">←</span>
                      </Link>
                    ))}
                    {row.hadith_ids.length > 3 && (
                      <details className="text-xs text-gray-500">
                        <summary className="cursor-pointer text-green-700 hover:underline">
                          عرض كل الروايات ({row.hadith_ids.length.toLocaleString('ar-EG')})
                        </summary>
                        <div className="mt-2 flex max-h-64 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-2">
                          {row.hadith_ids.map((hadithId) => (
                            <Link
                              key={hadithId}
                              href={`/hadith/${hadithId}`}
                              className="rounded border border-green-100 bg-white px-2 py-1 text-green-700 hover:bg-green-50"
                            >
                              {hadithId.toLocaleString('ar-EG')}
                            </Link>
                          ))}
                        </div>
                      </details>
                    )}
                    {row.chapter_names[0] && (
                      <span className="max-w-sm truncate text-xs text-gray-400">
                        {row.chapter_names[0]}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-10 text-center text-gray-400 text-sm">
          لا توجد بيانات
        </div>
      )}

      <div className="mt-8 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/dua" className="text-green-700 hover:underline">← أحاديث الأدعية</Link>
        <Link href="/hadiths/qudsi" className="text-green-700 hover:underline">← الأحاديث القدسية</Link>
        <Link href="/search" className="text-green-700 hover:underline">← البحث المتقدم</Link>
      </div>
    </div>
  )
}
