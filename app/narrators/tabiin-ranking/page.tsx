import pool from '@/lib/db'
import Link from 'next/link'
import UiIcon from '@/app/components/UiIcon'

export const dynamic = 'force-dynamic'

interface TabiiRank {
  id: number
  name: string
  abb_name: string | null
  grade: string | null
  city: string | null
  death_year: string | null
  death_year_num: number | null
  companion_teachers: number
  unique_students: number
  hadith_count: number
  book_count: number
  composite_score: number
}

interface TabiiDetail {
  companion_id: number
  companion_name: string
  chain_count: number
}

export default async function TabiinRankingPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; sort?: string; minCompanions?: string; limit?: string }>
}) {
  const sp = await searchParams
  const selectedId = parseInt(sp.id || '0') || null
  const sortBy = sp.sort || 'composite'
  const minCompanions = parseInt(sp.minCompanions || '2')
  const limit = parseInt(sp.limit || '30')

  const orderSql = sortBy === 'companions' ? 'companion_teachers DESC'
    : sortBy === 'students' ? 'unique_students DESC'
    : sortBy === 'hadiths' ? 'hadith_count DESC'
    : '(companion_teachers * 10 + unique_students * 3 + hadith_count / 10) DESC'

  const [tabiiRes, companionsRes] = await Promise.all([
    pool.query<TabiiRank>(
      `SELECT
         n.id, n.name, n.abb_name, n.martaba_ibn_hajar AS grade, n.living_city AS city, n.death_year_num::text AS death_year, n.death_year_num,
         COUNT(DISTINCT companions.companion_id)::int AS companion_teachers,
         COUNT(DISTINCT students.student_id)::int AS unique_students,
         COUNT(DISTINCT ih.hadith_id)::int AS hadith_count,
         COUNT(DISTINCT ht.book_id)::int AS book_count,
         (COUNT(DISTINCT companions.companion_id) * 10
           + COUNT(DISTINCT students.student_id) * 3
           + COUNT(DISTINCT ih.hadith_id) / 10)::int AS composite_score
       FROM narrators n
       LEFT JOIN LATERAL (
         SELECT DISTINCT ic.narrator_id_array[pos.ord - 1] AS companion_id
         FROM isnad_chains ic
         CROSS JOIN LATERAL (
           SELECT t.ord FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
           WHERE t.nid = n.id AND t.ord > 1 LIMIT 1
         ) pos
         WHERE (SELECT n2.is_companion FROM narrators n2 WHERE n2.id = ic.narrator_id_array[pos.ord - 1]) = true
       ) companions ON true
       LEFT JOIN LATERAL (
         SELECT DISTINCT ic2.narrator_id_array[pos2.ord + 1] AS student_id
         FROM isnad_chains ic2
         CROSS JOIN LATERAL (
           SELECT t2.ord FROM unnest(ic2.narrator_id_array) WITH ORDINALITY AS t2(nid2, ord2)
           WHERE t2.nid2 = n.id LIMIT 1
         ) pos2
         WHERE ic2.narrator_id_array[pos2.ord + 1] IS NOT NULL
       ) students ON true
       LEFT JOIN isnad_chains ic3 ON n.id = ANY(ic3.narrator_id_array)
       LEFT JOIN isnad_hadiths ih ON ih.isnad_id = ic3.id
       LEFT JOIN hadith_toc ht ON ht.id = ih.hadith_id
       WHERE n.death_year_num BETWEEN 40 AND 180
         AND NOT n.is_companion
         AND n.death_year_num IS NOT NULL
       GROUP BY n.id, n.name, n.abb_name, n.martaba_ibn_hajar, n.living_city, n.death_year_num
       HAVING COUNT(DISTINCT companions.companion_id) >= $1
       ORDER BY ${orderSql}
       LIMIT $2`,
      [minCompanions, limit]
    ).catch(() => ({ rows: [] as TabiiRank[] })),

    selectedId ? pool.query<TabiiDetail>(
      `SELECT
         comp.companion_id,
         n.name AS companion_name,
         COUNT(DISTINCT ic.id)::int AS chain_count
       FROM isnad_chains ic
       CROSS JOIN LATERAL (
         SELECT t.ord FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
         WHERE t.nid = $1 AND t.ord > 1 LIMIT 1
       ) pos
       JOIN LATERAL (SELECT ic.narrator_id_array[pos.ord - 1] AS companion_id) comp ON true
       JOIN narrators n ON n.id = comp.companion_id AND n.is_companion = true
       WHERE $1 = ANY(ic.narrator_id_array)
       GROUP BY comp.companion_id, n.name
       ORDER BY COUNT(DISTINCT ic.id) DESC
       LIMIT 20`,
      [selectedId]
    ).catch(() => ({ rows: [] as TabiiDetail[] })) : Promise.resolve({ rows: [] as TabiiDetail[] }),
  ])

  const tabiis = tabiiRes.rows
  const companions = companionsRes.rows
  const selected = selectedId ? tabiis.find(t => t.id === selectedId) : null

  const maxScore = Math.max(...tabiis.map(t => t.composite_score), 1)

  function gradeColor(g: string | null) {
    if (!g) return 'text-gray-400'
    if (/ثقة/.test(g)) return 'text-green-700'
    if (/صدوق/.test(g)) return 'text-blue-600'
    if (/ضعيف/.test(g)) return 'text-red-500'
    return 'text-gray-500'
  }

  const SORT_OPTIONS = [
    { key: 'composite', label: 'المركَّب' },
    { key: 'companions', label: 'الصحابة' },
    { key: 'students', label: 'التلاميذ' },
    { key: 'hadiths', label: 'الأحاديث' },
  ]

  const MIN_COMPANIONS_OPTIONS = [2, 3, 4, 5, 8]
  const LIMIT_OPTIONS = [20, 30, 50]

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">ترتيب التابعين — بالشيوخ والتلاميذ والأحاديث</h1>
        <p className="text-sm text-gray-500">
          التابعون مرتَّبون بمعيار مركَّب من: عدد الصحابة المسموع منهم × عدد التلاميذ × عدد الأحاديث — يحدد أعمدة نقل السنة في جيل التابعين
        </p>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {SORT_OPTIONS.map(s => (
          <a key={s.key}
            href={`/narrators/tabiin-ranking?sort=${s.key}&minCompanions=${minCompanions}&limit=${limit}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${sortBy === s.key ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
            {s.label}
          </a>
        ))}
        <span className="text-gray-200">|</span>
        <span className="text-xs text-gray-500">الحد الأدنى للصحابة:</span>
        {MIN_COMPANIONS_OPTIONS.map(m => (
          <a key={m}
            href={`/narrators/tabiin-ranking?sort=${sortBy}&minCompanions=${m}&limit=${limit}`}
            className={`text-xs px-2.5 py-1 rounded-full border ${minCompanions === m ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200'}`}>
            {m}+
          </a>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <div className="sm:col-span-3">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-teal-50 px-4 py-2 border-b border-teal-100 text-xs text-teal-800 font-medium flex justify-between">
              <span>التابعون ({SORT_OPTIONS.find(s => s.key === sortBy)?.label})</span>
              <div className="flex gap-3 text-xs text-gray-500">
                <span>ص = صحابة</span>
                <span>ت = تلاميذ</span>
                <span>ح = أحاديث</span>
              </div>
            </div>
            <div className="divide-y divide-gray-50 max-h-[72vh] overflow-y-auto">
              {tabiis.map((t, i) => {
                const isSelected = selectedId === t.id
                const barW = Math.round((t.composite_score / maxScore) * 100)
                return (
                  <a key={t.id}
                    href={`/narrators/tabiin-ranking?id=${t.id}&sort=${sortBy}&minCompanions=${minCompanions}&limit=${limit}`}
                    className={`px-4 py-3 flex items-start gap-3 hover:bg-teal-50 transition-colors ${isSelected ? 'bg-teal-50' : ''}`}>
                    <span className="text-xs text-gray-300 w-5 shrink-0 mt-0.5">{(i + 1).toLocaleString('ar-EG')}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-sm font-medium ${isSelected ? 'text-teal-900' : 'text-gray-800'} hover:underline`}>
                          {t.abb_name || t.name.split(' ').slice(0, 3).join(' ')}
                        </span>
                        {t.death_year && <span className="text-xs text-gray-400">ت {t.death_year}</span>}
                        {t.grade && <span className={`text-xs ${gradeColor(t.grade)}`}>{t.grade.slice(0, 8)}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-28">
                          <div className="bg-teal-400 h-1.5 rounded-full" style={{ width: `${barW}%` }} />
                        </div>
                        <span className="text-xs text-amber-600 font-medium">{t.companion_teachers}ص</span>
                        <span className="text-xs text-blue-600">{t.unique_students}ت</span>
                        <span className="text-xs text-green-600">{t.hadith_count}ح</span>
                      </div>
                    </div>
                  </a>
                )
              })}
              {tabiis.length === 0 && (
                <div className="p-8 text-center text-sm text-gray-400">لا توجد بيانات</div>
              )}
            </div>
          </div>
        </div>

        <div className="sm:col-span-2">
          {selected && companions.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden sticky top-20">
              <div className="bg-teal-50 px-4 py-3 border-b border-teal-100">
                <h2 className="font-bold text-teal-900 text-sm">{selected.abb_name || selected.name}</h2>
                <div className="flex gap-2 text-xs text-teal-600 mt-1 flex-wrap">
                  {selected.death_year && <span>ت {selected.death_year}</span>}
                  <span className="text-amber-600">{selected.companion_teachers} صحابي</span>
                  <span>{selected.unique_students} تلميذ</span>
                  <span>{selected.hadith_count.toLocaleString('ar-EG')} حديث</span>
                </div>
                <Link href={`/narrator/${selected.id}`} className="text-xs text-green-700 hover:underline mt-1 block">
                  ← ترجمته الكاملة
                </Link>
              </div>
              <div className="px-4 py-2 border-b border-gray-50 text-xs text-gray-500 font-medium">
                الصحابة المسموع منهم
              </div>
              <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                {companions.map((c, ci) => (
                  <div key={c.companion_id} className="px-4 py-2.5 flex items-center gap-2">
                    <span className="text-xs text-gray-300 w-4 shrink-0">{(ci + 1).toLocaleString('ar-EG')}</span>
                    <Link href={`/narrator/${c.companion_id}`}
                      className="text-sm text-amber-800 hover:underline flex-1 font-medium">
                      {c.companion_name.split(' ').slice(0, 3).join(' ')}
                    </Link>
                    <span className="text-xs text-gray-400">{c.chain_count} سند</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-teal-50 rounded-xl border border-teal-100 p-6 text-center">
              <UiIcon name="landmark" size={30} className="text-[#b28a43] mb-2" />
              <div className="font-semibold text-teal-900 text-sm mb-2">جيل التابعين</div>
              <p className="text-xs text-teal-700 leading-relaxed">
                اختر تابعياً لمشاهدة قائمة الصحابة الذين سمع منهم مباشرةً — تُعرِّف الباحث بامتداد روايته وعمق صلته بالجيل الأول
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators/generation-bridge" className="text-green-700 hover:underline">← جسور الأجيال</Link>
        <Link href="/narrators/sahabi-students" className="text-green-700 hover:underline">← تلاميذ الصحابة</Link>
        <Link href="/narrators/prolific-students" className="text-green-700 hover:underline">← المكثرون من الشيوخ</Link>
      </div>
    </div>
  )
}
