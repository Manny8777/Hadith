export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'

interface RelationType {
  id: number
  text: string
  narrator_count: number
}

interface NarratorRow {
  id: number
  name: string
  abb_name: string | null
  martaba_ibn_hajar: string | null
  hadiths_count: number | null
  death_year_num: string | null
  tabaqa: string | null
  related_ids: number[] | null
  related_names: string[] | null
}

function gradeColor(grade: string | null) {
  if (!grade) return 'bg-gray-100 text-gray-500'
  if (/ثقة|صحيح|عدل|صحابي|ثبت/.test(grade)) return 'bg-green-100 text-green-700'
  if (/صدوق|حسن|مقبول/.test(grade)) return 'bg-amber-100 text-amber-700'
  if (/ضعيف|منكر|متروك|كذاب/.test(grade)) return 'bg-red-100 text-red-600'
  return 'bg-gray-100 text-gray-500'
}

export default async function NarratorTypesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const sp = await searchParams
  const selectedTypeId = sp.type ? parseInt(sp.type) : null

  const [typesRes, narratorsRes] = await Promise.all([
    pool.query<RelationType>(
      `SELECT rt.id, rt.text,
              COUNT(DISTINCT nr.first_id)::int AS narrator_count
       FROM narrator_relation_types rt
       LEFT JOIN narrator_relations nr ON nr.relation_type = rt.id
       GROUP BY rt.id, rt.text
       ORDER BY narrator_count DESC NULLS LAST, rt.id`
    ),
    selectedTypeId !== null
      ? pool.query<NarratorRow>(
          `SELECT n.id, n.name, n.abb_name, n.martaba_ibn_hajar,
                  n.hadiths_count, n.death_year_num, n.tabaqa,
                  array_agg(DISTINCT nr.second_id) FILTER (WHERE nr.second_id IS NOT NULL) AS related_ids,
                  array_agg(DISTINCT COALESCE(n2.abb_name, n2.name)) FILTER (WHERE n2.id IS NOT NULL) AS related_names
           FROM narrator_relations nr
           JOIN narrators n ON n.id = nr.first_id
           LEFT JOIN narrators n2 ON n2.id = nr.second_id
           WHERE nr.relation_type = $1
           GROUP BY n.id, n.name, n.abb_name, n.martaba_ibn_hajar, n.hadiths_count, n.death_year_num, n.tabaqa
           ORDER BY n.hadiths_count DESC NULLS LAST, n.name
           LIMIT 200`,
          [selectedTypeId]
        )
      : Promise.resolve({ rows: [] as NarratorRow[] }),
  ])

  const types = typesRes.rows
  const narrators = narratorsRes.rows
  const selectedType = types.find(t => t.id === selectedTypeId) || null

  // Pick a colour per row index so each type tile has a distinct hue
  const TILE_COLORS = [
    'border-red-200 bg-red-50 text-red-800',
    'border-orange-200 bg-orange-50 text-orange-800',
    'border-amber-200 bg-amber-50 text-amber-800',
    'border-blue-200 bg-blue-50 text-blue-800',
    'border-teal-200 bg-teal-50 text-teal-800',
    'border-cyan-200 bg-cyan-50 text-cyan-800',
    'border-violet-200 bg-violet-50 text-violet-800',
    'border-purple-200 bg-purple-50 text-purple-800',
    'border-green-200 bg-green-50 text-green-800',
    'border-indigo-200 bg-indigo-50 text-indigo-800',
    'border-pink-200 bg-pink-50 text-pink-800',
    'border-sky-200 bg-sky-50 text-sky-800',
  ]

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900">أنواع علاقات الرواة</h1>
        <p className="text-sm text-gray-500 mt-1">
          تصنيفات العلاقات بين الرواة المستخرجة من قاعدة البيانات — انقر على نوع لاستعراض الرواة المنتسبين إليه
        </p>
      </div>

      {/* Type grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 mb-8">
        {types.map((t, i) => (
          <Link
            key={t.id}
            href={`/narrator-types?type=${t.id}`}
            className={`rounded-xl border px-4 py-3 text-right transition-all hover:shadow-sm ${
              selectedTypeId === t.id
                ? 'bg-green-900 text-white border-green-900'
                : TILE_COLORS[i % TILE_COLORS.length]
            }`}
          >
            <div className="font-bold text-sm leading-snug">{t.text}</div>
            <div className="text-xs opacity-70 mt-1">
              {t.narrator_count > 0
                ? `${t.narrator_count.toLocaleString('ar-EG')} راوٍ`
                : 'لا توجد بيانات'}
            </div>
          </Link>
        ))}
      </div>

      {/* Narrators for selected type */}
      {selectedType && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-800 text-lg">
              {selectedType.text}
              <span className="text-sm font-normal text-gray-400 mr-2">
                ({selectedType.narrator_count.toLocaleString('ar-EG')} راوٍ)
              </span>
            </h2>
            <Link href="/narrator-types" className="text-xs text-gray-400 hover:text-gray-600">
              عرض الكل
            </Link>
          </div>

          {narrators.length === 0 ? (
            <div className="text-gray-400 text-sm py-6 text-center bg-white rounded-xl border border-gray-100">
              لا يوجد رواة مرتبطون بهذا النوع في البيانات المتاحة
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {narrators.map(n => (
                <div
                  key={n.id}
                  className="bg-white rounded-xl border border-gray-100 px-4 py-3 hover:border-green-200 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/narrator/${n.id}`}
                        className="font-medium text-green-900 hover:text-green-700 text-sm leading-snug hover:underline block truncate"
                      >
                        {n.abb_name || n.name}
                      </Link>
                      <div className="text-xs text-gray-400 mt-0.5 flex gap-2 flex-wrap">
                        {n.death_year_num?.trim() && <span>ت {n.death_year_num.trim()}</span>}
                        {n.tabaqa?.trim() && (
                          <span className="truncate max-w-[8rem]">{n.tabaqa.trim()}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {n.martaba_ibn_hajar?.trim() && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${gradeColor(n.martaba_ibn_hajar)}`}>
                          {n.martaba_ibn_hajar}
                        </span>
                      )}
                      {n.hadiths_count != null && n.hadiths_count > 0 && (
                        <span className="text-xs text-gray-400">
                          {n.hadiths_count.toLocaleString('ar-EG')} حديث
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Related narrators */}
                  {n.related_ids && n.related_ids.length > 0 && n.related_names && (
                    <div className="border-t border-gray-100 pt-2 mt-1">
                      <div className="flex flex-wrap gap-1">
                        {n.related_ids.slice(0, 5).map((rid, ri) => (
                          <Link
                            key={rid}
                            href={`/narrator/${rid}`}
                            className="text-xs text-teal-700 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded hover:border-teal-300 transition-colors"
                          >
                            {n.related_names![ri] || `[${rid}]`}
                          </Link>
                        ))}
                        {n.related_ids.length > 5 && (
                          <span className="text-xs text-gray-400 self-center">
                            +{n.related_ids.length - 5}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {narrators.length >= 200 && (
            <p className="text-xs text-gray-400 mt-3 text-center">
              عرض أول ٢٠٠ راوٍ — إجمالي {selectedType.narrator_count.toLocaleString('ar-EG')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
