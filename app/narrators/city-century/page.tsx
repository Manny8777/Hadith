import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'الرواة بالمدن والقرون — جامع خادم الحرمين' }

interface CityRow {
  city: string
  century: number
  narrator_count: number
  thiqa_count: number
  hadith_sum: number
}

interface CityTotal {
  city: string
  total: number
  thiqa: number
  avg_death: number | null
  hadiths: number
}

export default async function CityCenturyPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; min_narrators?: string }>
}) {
  const sp = await searchParams
  const view = sp.view || 'matrix'
  const minNarrators = Math.max(1, parseInt(sp.min_narrators || '5'))

  const [matrixRes, cityTotalsRes, centuryTotalsRes] = await Promise.all([
    pool.query<CityRow>(
      `SELECT
         n.city,
         CEIL(n.death_year_num / 100.0)::int AS century,
         COUNT(*)::int AS narrator_count,
         SUM(CASE WHEN n.martaba_ibn_hajar ~* 'ثقة' THEN 1 ELSE 0 END)::int AS thiqa_count,
         SUM(COALESCE(n.hadiths_count, 0))::int AS hadith_sum
       FROM narrators n
       WHERE n.city IS NOT NULL AND n.city != ''
         AND n.death_year_num IS NOT NULL
         AND n.death_year_num BETWEEN 1 AND 600
       GROUP BY n.city, CEIL(n.death_year_num / 100.0)::int
       HAVING COUNT(*) >= 2
       ORDER BY n.city, century`,
      []
    ).catch(() => ({ rows: [] as CityRow[] })),

    pool.query<CityTotal>(
      `SELECT
         n.city,
         COUNT(*)::int AS total,
         SUM(CASE WHEN n.martaba_ibn_hajar ~* 'ثقة' THEN 1 ELSE 0 END)::int AS thiqa,
         AVG(n.death_year_num)::int AS avg_death,
         SUM(COALESCE(n.hadiths_count, 0))::int AS hadiths
       FROM narrators n
       WHERE n.city IS NOT NULL AND n.city != ''
         AND n.death_year_num IS NOT NULL
       GROUP BY n.city
       HAVING COUNT(*) >= $1
       ORDER BY total DESC
       LIMIT 25`,
      [minNarrators]
    ).catch(() => ({ rows: [] as CityTotal[] })),

    pool.query<{ century: number; cnt: number; hadiths: number }>(
      `SELECT
         CEIL(death_year_num / 100.0)::int AS century,
         COUNT(*)::int AS cnt,
         SUM(COALESCE(hadiths_count, 0))::int AS hadiths
       FROM narrators
       WHERE death_year_num IS NOT NULL
         AND death_year_num BETWEEN 1 AND 600
         AND city IS NOT NULL
       GROUP BY CEIL(death_year_num / 100.0)::int
       ORDER BY century`,
      []
    ).catch(() => ({ rows: [] })),
  ])

  const matrixData = matrixRes.rows
  const cityTotals = cityTotalsRes.rows
  const centuryTotals = centuryTotalsRes.rows

  // Build matrix: cities (top) × centuries (1–6)
  const topCities = cityTotals.map(c => c.city)
  const centuries = [1, 2, 3, 4, 5, 6]

  const matrixMap = new Map<string, Map<number, CityRow>>()
  for (const row of matrixData) {
    if (!matrixMap.has(row.city)) matrixMap.set(row.city, new Map())
    matrixMap.get(row.city)!.set(row.century, row)
  }

  function centuryLabel(c: number): string {
    const labels: Record<number, string> = {
      1: 'ق١هـ', 2: 'ق٢هـ', 3: 'ق٣هـ', 4: 'ق٤هـ', 5: 'ق٥هـ', 6: 'ق٦هـ'
    }
    return labels[c] || `ق${c}`
  }

  function cellColor(count: number, max: number): string {
    if (count === 0) return 'bg-gray-50 text-gray-300'
    const ratio = count / max
    if (ratio >= 0.8) return 'bg-green-700 text-white font-bold'
    if (ratio >= 0.5) return 'bg-green-500 text-white font-semibold'
    if (ratio >= 0.25) return 'bg-green-300 text-green-900'
    if (ratio >= 0.1) return 'bg-green-100 text-green-700'
    return 'bg-green-50 text-green-600'
  }

  const maxCellCount = Math.max(...matrixData.map(r => r.narrator_count), 1)

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('view', view)
    p.set('min_narrators', String(minNarrators))
    Object.entries(overrides).forEach(([k, v]) => p.set(k, v))
    return `/narrators/city-century?${p.toString()}`
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الرواة بالمدن والقرون</h1>
        <p className="text-sm text-gray-500 mb-3">
          خريطة حرارية لتوزيع رواة الحديث على المدن الكبرى عبر القرون الهجرية —
          تكشف عن مراكز التحديث وتطور الحركة العلمية الإسلامية عبر الزمن
        </p>

        <div className="bg-green-50 border border-green-100 rounded-xl p-3 mb-4 text-xs text-green-900">
          <span className="font-semibold">أهمية الجغرافيا الحديثية: </span>
          تركَّز التحديث في القرن الأول في المدينة ومكة، ثم انتشر إلى الكوفة والبصرة وبغداد،
          ثم إلى خراسان ومصر وبلاد الشام. يكشف التحليل كيف تنقَّل مركز الثقل العلمي.
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">عرض:</span>
          {[
            { key: 'matrix', label: 'الخريطة الحرارية' },
            { key: 'list', label: 'قائمة المدن' },
          ].map(v => (
            <Link key={v.key} href={buildUrl({ view: v.key })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                view === v.key
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {v.label}
            </Link>
          ))}
          <span className="text-xs text-gray-500 mr-4">أدنى رواة:</span>
          {[3, 5, 10, 20].map(n => (
            <Link key={n} href={buildUrl({ min_narrators: String(n) })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                minNarrators === n
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {n}+
            </Link>
          ))}
        </div>
      </div>

      {view === 'matrix' ? (
        <div className="bg-white rounded-xl border border-gray-100 p-4 overflow-x-auto">
          <h2 className="text-sm font-bold text-green-900 mb-3">خريطة حرارية: رواة بالمدينة × القرن</h2>
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr>
                <th className="text-right px-2 py-1.5 bg-gray-50 border border-gray-100 font-semibold text-gray-700 min-w-[100px]">
                  المدينة
                </th>
                {centuries.map(c => (
                  <th key={c} className="px-2 py-1.5 bg-gray-50 border border-gray-100 font-semibold text-gray-700 text-center min-w-[60px]">
                    {centuryLabel(c)}
                  </th>
                ))}
                <th className="px-2 py-1.5 bg-gray-50 border border-gray-100 font-semibold text-gray-700 text-center">
                  المجموع
                </th>
              </tr>
            </thead>
            <tbody>
              {topCities.map(city => {
                const cityMap = matrixMap.get(city)
                const total = cityTotals.find(c => c.city === city)
                return (
                  <tr key={city} className="hover:bg-amber-50/30">
                    <td className="px-2 py-1.5 border border-gray-100 font-medium text-green-900">
                      <Link href={`/narrators?city=${encodeURIComponent(city)}`}
                        className="hover:underline">
                        {city}
                      </Link>
                    </td>
                    {centuries.map(c => {
                      const cell = cityMap?.get(c)
                      const count = cell?.narrator_count || 0
                      return (
                        <td key={c}
                          className={`px-2 py-1.5 border border-gray-100 text-center transition-colors ${cellColor(count, maxCellCount)}`}
                          title={count > 0 ? `${count} راوٍ` : 'لا يوجد'}>
                          {count > 0 ? count.toLocaleString('ar-EG') : '·'}
                        </td>
                      )
                    })}
                    <td className="px-2 py-1.5 border border-gray-100 text-center font-bold text-green-900 bg-green-50">
                      {total?.total?.toLocaleString('ar-EG') || '—'}
                    </td>
                  </tr>
                )
              })}
              {/* Century totals row */}
              <tr className="bg-gray-50 font-bold">
                <td className="px-2 py-1.5 border border-gray-200 text-gray-600">المجموع</td>
                {centuries.map(c => {
                  const ct = centuryTotals.find(r => r.century === c)
                  return (
                    <td key={c} className="px-2 py-1.5 border border-gray-200 text-center text-gray-700">
                      {ct?.cnt?.toLocaleString('ar-EG') || '—'}
                    </td>
                  )
                })}
                <td className="px-2 py-1.5 border border-gray-200 text-center text-green-800">
                  {centuryTotals.reduce((sum, r) => sum + r.cnt, 0).toLocaleString('ar-EG')}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-2">
            * يشمل الرواة ذوو مدن معروفة وتواريخ وفاة في الفترة ١–٦٠٠هـ
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {cityTotals.map((c, idx) => (
            <div key={c.city}
              className="bg-white rounded-xl border border-gray-100 p-3 hover:shadow-sm hover:border-green-200 transition-all">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-300 w-5">{(idx + 1).toLocaleString('ar-EG')}</span>
                <Link href={`/narrators?city=${encodeURIComponent(c.city)}`}
                  className="font-bold text-green-900 hover:underline text-sm w-28 shrink-0">
                  {c.city}
                </Link>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-green-700">
                      {c.total.toLocaleString('ar-EG')} راوٍ
                    </span>
                    <span className="text-xs text-gray-400">
                      ({c.thiqa.toLocaleString('ar-EG')} ثقة)
                    </span>
                    {c.avg_death && (
                      <span className="text-xs text-gray-400">
                        متوسط الوفاة: {c.avg_death}هـ
                      </span>
                    )}
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className="bg-green-500 h-1.5 rounded-full"
                      style={{ width: `${(c.total / cityTotals[0].total) * 100}%` }} />
                  </div>
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {c.hadiths.toLocaleString('ar-EG')} ح
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators/generations" className="text-green-700 hover:underline">← طبقات الرواة</Link>
        <Link href="/narrators/stats" className="text-green-700 hover:underline">← إحصاءات الرواة</Link>
        <Link href="/hadiths/timeline" className="text-green-700 hover:underline">← تسلسل التدوين</Link>
      </div>
    </div>
  )
}
