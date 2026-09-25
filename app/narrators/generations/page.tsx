import pool from '@/lib/db'
import Link from 'next/link'
import UiIcon from '@/app/components/UiIcon'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'طبقات الرواة — جامع خادم الحرمين' }

interface GenerationRow {
  tabaqa: string
  narrator_count: number
  thiqa_count: number
  sadooq_count: number
  daif_count: number
  companion_count: number
  avg_death: number | null
}

interface NarratorRow {
  id: number
  name: string
  abb_name: string | null
  martaba_ibn_hajar: string | null
  is_companion: boolean
  death_year_num: number | null
  hadiths_count: number | null
}

export default async function GenerationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tabaqa?: string }>
}) {
  const sp = await searchParams
  const selectedTabaqa = sp.tabaqa || ''

  const [generationsRes, selectedRes] = await Promise.all([
    pool.query<GenerationRow>(
      `SELECT
         tabaqa,
         COUNT(*)::int AS narrator_count,
         COUNT(CASE WHEN martaba_ibn_hajar ~* 'ثقة|ثبت|حجة' THEN 1 END)::int AS thiqa_count,
         COUNT(CASE WHEN martaba_ibn_hajar ~* 'صدوق|مقبول|لا بأس' THEN 1 END)::int AS sadooq_count,
         COUNT(CASE WHEN martaba_ibn_hajar ~* 'ضعيف|منكر|متروك|كذاب' THEN 1 END)::int AS daif_count,
         COUNT(CASE WHEN is_companion = true THEN 1 END)::int AS companion_count,
         ROUND(AVG(death_year_num) FILTER (WHERE death_year_num > 0))::int AS avg_death
       FROM (
         SELECT id, name, abb_name, martaba_ibn_hajar, is_companion, death_year_num, hadiths_count, tabaqa
         FROM narrators
         WHERE tabaqa IS NOT NULL AND tabaqa != ''
       ) sub
       GROUP BY tabaqa
       ORDER BY AVG(death_year_num) NULLS LAST, narrator_count DESC`
    ).catch(() => ({ rows: [] })),
    selectedTabaqa
      ? pool.query<NarratorRow>(
          `SELECT id, name, abb_name, martaba_ibn_hajar, is_companion, death_year_num, hadiths_count
           FROM narrators
           WHERE tabaqa = $1
           ORDER BY COALESCE(hadiths_count, 0) DESC, id
           LIMIT 100`,
          [selectedTabaqa]
        ).catch(() => ({ rows: [] }))
      : Promise.resolve({ rows: [] }),
  ])

  const generations = generationsRes.rows
  const selectedNarrators = selectedRes.rows

  function gradeColor(grade: string | null) {
    if (!grade) return 'bg-gray-50 text-gray-600 border-gray-200'
    if (/ثقة|ثبت|حجة/.test(grade)) return 'bg-green-50 text-green-700 border-green-200'
    if (/صدوق|مقبول|لا بأس/.test(grade)) return 'bg-amber-50 text-amber-700 border-amber-200'
    if (/ضعيف|منكر|متروك|كذاب/.test(grade)) return 'bg-red-50 text-red-600 border-red-200'
    return 'bg-gray-50 text-gray-600 border-gray-200'
  }

  return (
    <div dir="rtl">
      <div className="mb-6">
        <Link href="/narrators" className="text-sm text-green-700 hover:underline">← الرواة</Link>
        <h1 className="text-2xl font-bold text-green-900 mt-2 mb-1">طبقات الرواة</h1>
        <p className="text-sm text-gray-500">
          تصفح الرواة مرتبين بطبقاتهم — الصحابة، التابعون، أتباع التابعين وما تلاها
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Generations list */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="bg-green-900 text-white px-4 py-3 text-sm font-semibold">
              الطبقات ({generations.length})
            </div>
            <div className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
              {generations.map(g => {
                const isSelected = selectedTabaqa === g.tabaqa
                const positiveRate = g.narrator_count > 0
                  ? Math.round(((g.thiqa_count + g.sadooq_count) / g.narrator_count) * 100)
                  : 0
                return (
                  <Link
                    key={g.tabaqa}
                    href={`/narrators/generations?tabaqa=${encodeURIComponent(g.tabaqa)}`}
                    className={`block px-4 py-3 hover:bg-green-50 transition-colors ${isSelected ? 'bg-green-50 border-r-4 border-green-600' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-800 leading-snug">{g.tabaqa}</span>
                      <span className="text-xs text-gray-400 shrink-0 mr-2">{g.narrator_count.toLocaleString('ar-EG')}</span>
                    </div>
                    {g.avg_death && (
                      <div className="text-xs text-gray-400 mb-1">متوسط الوفاة: {g.avg_death} هـ</div>
                    )}
                    {/* Mini grade bar */}
                    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-400 rounded-full"
                        style={{ width: `${positiveRate}%` }}
                        title={`${positiveRate}% موثَّق`}
                      />
                    </div>
                    <div className="flex gap-1.5 mt-1.5 text-xs">
                      {g.companion_count > 0 && (
                        <span className="text-amber-600 font-medium">ص {g.companion_count}</span>
                      )}
                      <span className="text-green-600">ث {g.thiqa_count}</span>
                      <span className="text-amber-600">ص {g.sadooq_count}</span>
                      <span className="text-red-500">ض {g.daif_count}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>

        {/* Selected generation narrators */}
        <div className="lg:col-span-2">
          {selectedTabaqa ? (
            <div>
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <h2 className="font-bold text-green-900 text-lg">{selectedTabaqa}</h2>
                <span className="text-sm text-gray-400">
                  {selectedNarrators.length.toLocaleString('ar-EG')} راوٍ (أعلى 100 حسب عدد الأحاديث)
                </span>
              </div>

              {/* Grade summary for selected generation */}
              {(() => {
                const gen = generations.find(g => g.tabaqa === selectedTabaqa)
                if (!gen) return null
                const total = gen.narrator_count
                return (
                  <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4 grid grid-cols-4 gap-3 text-center">
                    {gen.companion_count > 0 && (
                      <div>
                        <div className="text-xl font-bold text-amber-500">{gen.companion_count}</div>
                        <div className="text-xs text-gray-500">صحابي</div>
                      </div>
                    )}
                    <div>
                      <div className="text-xl font-bold text-green-600">{gen.thiqa_count}</div>
                      <div className="text-xs text-gray-500">ثقة</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-amber-600">{gen.sadooq_count}</div>
                      <div className="text-xs text-gray-500">صدوق</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-red-500">{gen.daif_count}</div>
                      <div className="text-xs text-gray-500">ضعيف</div>
                    </div>
                    {gen.avg_death && (
                      <div className={gen.companion_count > 0 ? 'col-span-4' : 'col-span-1'}>
                        <div className="text-sm font-semibold text-gray-600">{gen.avg_death} هـ</div>
                        <div className="text-xs text-gray-400">متوسط الوفاة</div>
                      </div>
                    )}
                  </div>
                )
              })()}

              <div className="grid sm:grid-cols-2 gap-2">
                {selectedNarrators.map(n => (
                  <Link
                    key={n.id}
                    href={`/narrator/${n.id}`}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all hover:shadow-sm group ${gradeColor(n.martaba_ibn_hajar)}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm leading-snug group-hover:underline">
                        {n.is_companion && <span className="text-amber-500 ml-1 text-xs">ص</span>}
                        {n.abb_name || n.name}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {n.martaba_ibn_hajar && (
                          <span className="text-xs opacity-75">{n.martaba_ibn_hajar}</span>
                        )}
                        {n.death_year_num && (
                          <span className="text-xs opacity-60">ت.{n.death_year_num}</span>
                        )}
                      </div>
                    </div>
                    {n.hadiths_count && n.hadiths_count > 0 ? (
                      <span className="text-xs shrink-0 opacity-60 font-mono">{n.hadiths_count.toLocaleString('ar-EG')}</span>
                    ) : null}
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
              <UiIcon name="books" size={40} className="text-[#b28a43] mb-4" />
              <h2 className="font-bold text-amber-900 mb-2">اختر طبقة</h2>
              <p className="text-sm text-amber-700">
                اختر طبقة من القائمة على اليسار لعرض رواتها مع درجات التوثيق
              </p>
              <div className="mt-4 text-xs text-amber-600 space-y-1">
                <p>الرمز <strong>ص</strong> = صحابي | <strong>ث</strong> = ثقة | <strong>ص</strong> = صدوق | <strong>ض</strong> = ضعيف</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
