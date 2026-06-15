import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'أمثال الحديث النبوي — جامع خادم الحرمين' }

interface AmthalRow {
  id: number
  text: string
  main_id: number | null
  chapter_name: string | null
}

export default async function AmthalPage() {
  const { rows } = await pool.query<AmthalRow>(
    `SELECT
       a.id,
       a.text,
       ht.main_id,
       ht.chapter_text AS chapter_name
     FROM amthal a
     LEFT JOIN hadith_toc ht ON ht.main_id = a.id
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
            {rows.filter(r => r.main_id !== null).length.toLocaleString('ar-EG')} مثل مرتبط بحديث
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

                {row.main_id !== null && (
                  <div className="mt-3 flex items-center gap-3 flex-wrap">
                    <Link
                      href={`/hadith/${row.main_id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1 rounded-full hover:bg-green-100 hover:border-green-300 transition-all"
                    >
                      عرض الحديث
                      <span className="text-green-500">←</span>
                    </Link>
                    {row.chapter_name && (
                      <span className="text-xs text-gray-400 truncate max-w-xs">
                        {row.chapter_name}
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
