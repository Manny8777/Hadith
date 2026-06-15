import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'أكثر الرواة حديثاً بالقرن — جامع خادم الحرمين' }

interface CenturyRow {
  century: number
  narrator_id: number
  narrator_name: string
  abb_name: string | null
  death_year: string | null
  city: string | null
  grade: string | null
  hadith_count: number
  chain_count: number
  rank_in_century: number
}

interface CenturyStat {
  century: number
  narrator_count: number
  total_hadiths: number
}

const ERA_LABELS: Record<number, string> = {
  1: 'القرن الأول — عصر الصحابة والتابعين',
  2: 'القرن الثاني — كبار المحدثين',
  3: 'القرن الثالث — عصر التدوين والصحاح',
  4: 'القرن الرابع — عصر السنن والمسانيد',
  5: 'القرن الخامس فأكثر',
}

const CENTURY_COLORS: Record<number, string> = {
  1: 'amber',
  2: 'green',
  3: 'blue',
  4: 'indigo',
  5: 'purple',
}

export default async function ProlificByCenturyPage({
  searchParams,
}: {
  searchParams: Promise<{ century?: string; top?: string }>
}) {
  const sp = await searchParams
  const selectedCentury = parseInt(sp.century || '0')
  const topN = Math.min(50, Math.max(5, parseInt(sp.top || '20')))

  const [statsRes, rankingsRes] = await Promise.all([
    pool.query<CenturyStat>(
      `SELECT
         CEIL(n.death_year_num / 100.0)::int AS century,
         COUNT(DISTINCT n.id)::int AS narrator_count,
         COUNT(DISTINCT ih.hadith_id)::int AS total_hadiths
       FROM narrators n
       JOIN isnad_chains ic ON n.id = ANY(ic.narrator_id_array)
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       WHERE n.death_year_num IS NOT NULL
         AND n.death_year_num > 0
         AND CEIL(n.death_year_num / 100.0)::int BETWEEN 1 AND 5
       GROUP BY CEIL(n.death_year_num / 100.0)::int
       ORDER BY century`
    ).catch(() => ({ rows: [] as CenturyStat[] })),

    pool.query<CenturyRow>(
      `WITH narrator_stats AS (
         SELECT
           n.id AS narrator_id,
           n.name AS narrator_name,
           n.abb_name,
           n.death_year_num::text AS death_year,
           n.death_city AS city,
           n.martaba_ibn_hajar AS grade,
           CEIL(n.death_year_num / 100.0)::int AS century,
           COUNT(DISTINCT ih.hadith_id)::int AS hadith_count,
           COUNT(DISTINCT ic.id)::int AS chain_count
         FROM narrators n
         JOIN isnad_chains ic ON n.id = ANY(ic.narrator_id_array)
         JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
         WHERE n.death_year_num IS NOT NULL
           AND n.death_year_num > 0
           AND CEIL(n.death_year_num / 100.0)::int BETWEEN 1 AND 5
           ${selectedCentury > 0 ? 'AND CEIL(n.death_year_num / 100.0)::int = $2' : ''}
         GROUP BY n.id, n.name, n.abb_name, n.death_year_num, n.death_city, n.martaba_ibn_hajar,
                  CEIL(n.death_year_num / 100.0)::int
       ),
       ranked AS (
         SELECT *,
                ROW_NUMBER() OVER (PARTITION BY century ORDER BY hadith_count DESC) AS rank_in_century
         FROM narrator_stats
       )
       SELECT * FROM ranked
       WHERE rank_in_century <= $1
       ORDER BY century, rank_in_century`,
      selectedCentury > 0 ? [topN, selectedCentury] : [topN]
    ).catch(() => ({ rows: [] as CenturyRow[] })),
  ])

  const stats = statsRes.rows
  const rankings = rankingsRes.rows

  const centuries = selectedCentury > 0
    ? [selectedCentury]
    : [1, 2, 3, 4, 5].filter(c => rankings.some(r => r.century === c))

  function gradeColor(g: string | null) {
    if (!g) return 'text-gray-400'
    if (/ثقة|ثبت|حافظ/.test(g)) return 'text-green-700'
    if (/صدوق|لا بأس/.test(g)) return 'text-blue-600'
    if (/ضعيف|متروك/.test(g)) return 'text-red-500'
    return 'text-gray-500'
  }

  const colorScheme = (century: number) => {
    const c = CENTURY_COLORS[century] || 'gray'
    return {
      header: `bg-${c}-50 text-${c}-900 border-${c}-100`,
      rank: `text-${c}-700 bg-${c}-100`,
      bar: `bg-${c}-400`,
    }
  }

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">أكثر الرواة حديثاً بالقرن</h1>
        <p className="text-sm text-gray-500">
          ترتيب الرواة داخل كل قرن هجري بحسب عدد الأحاديث — يكشف أعمدة الرواية في كل عصر
        </p>
      </div>

      {/* Century stats overview */}
      <div className="grid grid-cols-5 gap-2 mb-5">
        {[1,2,3,4,5].map(c => {
          const stat = stats.find(s => s.century === c)
          const isActive = selectedCentury === c
          return (
            <a key={c}
              href={isActive ? '/narrators/prolific-by-century' : `/narrators/prolific-by-century?century=${c}&top=${topN}`}
              className={`rounded-xl border p-3 text-center transition-all ${
                isActive
                  ? 'bg-green-800 text-white border-green-800 shadow-sm'
                  : 'bg-white text-gray-700 border-gray-100 hover:border-green-200'
              }`}>
              <div className="text-lg font-bold">
                {c === 5 ? '5+' : c}
              </div>
              <div className={`text-xs mt-0.5 ${isActive ? 'text-green-100' : 'text-gray-400'}`}>
                ق هـ
              </div>
              {stat && (
                <div className={`text-xs mt-1 ${isActive ? 'text-green-200' : 'text-gray-400'}`}>
                  {stat.narrator_count.toLocaleString('ar-EG')} راوٍ
                </div>
              )}
            </a>
          )
        })}
      </div>

      {/* Top N selector */}
      <div className="flex items-center gap-3 mb-5 text-sm">
        <span className="text-gray-500">عرض أعلى:</span>
        {[10, 20, 30, 50].map(n => (
          <a key={n}
            href={`/narrators/prolific-by-century?${selectedCentury ? `century=${selectedCentury}&` : ''}top=${n}`}
            className={`px-3 py-1 rounded-full border text-xs transition-colors ${
              topN === n
                ? 'bg-green-800 text-white border-green-800'
                : 'bg-white text-gray-500 border-gray-200 hover:border-green-300'
            }`}>
            {n} راوٍ
          </a>
        ))}
      </div>

      {/* Rankings by century */}
      <div className="space-y-6">
        {centuries.map(century => {
          const centuryRanks = rankings.filter(r => r.century === century)
          if (centuryRanks.length === 0) return null
          const maxHadiths = centuryRanks[0]?.hadith_count || 1
          const stat = stats.find(s => s.century === century)
          const eraLabel = ERA_LABELS[century] || `القرن ${century}`
          const c = CENTURY_COLORS[century] || 'gray'

          return (
            <div key={century} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className={`px-4 py-3 border-b border-gray-100 flex items-center justify-between`}
                style={{ background: c === 'amber' ? '#fffbeb' : c === 'green' ? '#f0fdf4' : c === 'blue' ? '#eff6ff' : c === 'indigo' ? '#eef2ff' : '#faf5ff' }}>
                <div>
                  <span className="font-bold text-gray-900 text-sm">{eraLabel}</span>
                </div>
                {stat && (
                  <div className="text-xs text-gray-400">
                    {stat.narrator_count.toLocaleString('ar-EG')} راوٍ · {stat.total_hadiths.toLocaleString('ar-EG')} حديث
                  </div>
                )}
              </div>
              <div className="divide-y divide-gray-50">
                {centuryRanks.map(narrator => (
                  <div key={narrator.narrator_id}
                    className="px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-400 w-6 text-center shrink-0">
                        {narrator.rank_in_century.toLocaleString('ar-EG')}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Link href={`/narrator/${narrator.narrator_id}`}
                            className="text-sm font-semibold text-green-900 hover:underline">
                            {narrator.abb_name || narrator.narrator_name}
                          </Link>
                          {narrator.death_year && (
                            <span className="text-xs text-gray-400">ت {narrator.death_year}</span>
                          )}
                          {narrator.city && (
                            <span className="text-xs text-gray-400">{narrator.city}</span>
                          )}
                          {narrator.grade && (
                            <span className={`text-xs ${gradeColor(narrator.grade)}`}>
                              {narrator.grade.slice(0, 20)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-48">
                            <div className="h-1.5 rounded-full transition-all"
                              style={{
                                width: `${(narrator.hadith_count / maxHadiths) * 100}%`,
                                background: c === 'amber' ? '#d97706' : c === 'green' ? '#16a34a' : c === 'blue' ? '#2563eb' : c === 'indigo' ? '#4f46e5' : '#9333ea'
                              }} />
                          </div>
                          <span className="text-xs text-gray-500 shrink-0">
                            {narrator.hadith_count.toLocaleString('ar-EG')} ح
                          </span>
                          <span className="text-xs text-gray-300 shrink-0">
                            {narrator.chain_count.toLocaleString('ar-EG')} سند
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 flex gap-2 text-xs">
                        <Link href={`/narrator/${narrator.narrator_id}`}
                          className="text-gray-400 hover:text-green-700">ترجمة</Link>
                        <Link href={`/narrator/${narrator.narrator_id}/reliability`}
                          className="text-gray-400 hover:text-blue-700">موثوقية</Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {rankings.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
          لا توجد بيانات
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators/chronology" className="text-green-700 hover:underline">← تسلسل الرواية</Link>
        <Link href="/narrators" className="text-green-700 hover:underline">← الرواة</Link>
        <Link href="/narrators/coverage" className="text-green-700 hover:underline">← تغطية التراجم</Link>
      </div>
    </div>
  )
}
