import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'تسلسل الرواية — جامع خادم الحرمين' }

interface DecadeRow {
  decade_start: number
  narrator_count: number
  companion_count: number
  thiqa_count: number
  hadith_count: number
  top_narrators: string
  top_narrator_ids: number[]
}

interface TopNarrator {
  id: number
  name: string
  abb_name: string | null
  death_year_num: number
  martaba_ibn_hajar: string | null
  is_companion: boolean
  city: string | null
  hadith_count: number
}

export default async function NarratorsChronologyPage({
  searchParams,
}: {
  searchParams: Promise<{ decade?: string; city?: string }>
}) {
  const sp = await searchParams
  const focusDecade = parseInt(sp.decade || '0')
  const cityFilter = sp.city || ''

  const [decadesRes, detailRes, citiesRes] = await Promise.all([
    // Decade-by-decade overview
    pool.query<DecadeRow>(
      `SELECT
         FLOOR(n.death_year_num / 10)::int * 10 AS decade_start,
         COUNT(DISTINCT n.id)::int AS narrator_count,
         COUNT(DISTINCT n.id) FILTER (WHERE n.is_companion = true)::int AS companion_count,
         COUNT(DISTINCT n.id) FILTER (WHERE n.martaba_ibn_hajar ~* 'ثقة')::int AS thiqa_count,
         COALESCE(SUM(n.hadiths_count), 0)::int AS hadith_count,
         STRING_AGG(n.abb_name, '، ' ORDER BY n.hadiths_count DESC NULLS LAST) AS top_narrators,
         ARRAY_AGG(n.id ORDER BY n.hadiths_count DESC NULLS LAST) AS top_narrator_ids
       FROM narrators n
       WHERE n.death_year_num IS NOT NULL
         AND n.death_year_num BETWEEN 1 AND 600
         ${cityFilter ? `AND n.city ILIKE $1` : ''}
       GROUP BY FLOOR(n.death_year_num / 10)::int * 10
       ORDER BY decade_start`,
      cityFilter ? [`%${cityFilter}%`] : []
    ).catch(() => ({ rows: [] as DecadeRow[] })),

    // Detail view for a specific decade
    focusDecade > 0 ? pool.query<TopNarrator>(
      `SELECT n.id, n.name, n.abb_name, n.death_year_num, n.martaba_ibn_hajar,
              COALESCE(n.is_companion, false) AS is_companion,
              n.city,
              COALESCE(n.hadiths_count, 0)::int AS hadith_count
       FROM narrators n
       WHERE n.death_year_num >= $1 AND n.death_year_num < $2
         ${cityFilter ? `AND n.city ILIKE $3` : ''}
       ORDER BY hadith_count DESC
       LIMIT 30`,
      cityFilter
        ? [focusDecade, focusDecade + 10, `%${cityFilter}%`]
        : [focusDecade, focusDecade + 10]
    ).catch(() => ({ rows: [] as TopNarrator[] })) : Promise.resolve({ rows: [] as TopNarrator[] }),

    pool.query<{ city: string; count: number }>(
      `SELECT city, COUNT(*)::int AS count FROM narrators
       WHERE city IS NOT NULL AND city != ''
         AND death_year_num BETWEEN 1 AND 600
       GROUP BY city ORDER BY count DESC LIMIT 15`
    ).catch(() => ({ rows: [] })),
  ])

  const decades = decadesRes.rows
  const detail = detailRes.rows
  const cities = citiesRes.rows

  const maxHadithCount = Math.max(...decades.map(d => d.hadith_count), 1)
  const maxNarratorCount = Math.max(...decades.map(d => d.narrator_count), 1)

  function gradeColor(grade: string | null, isComp: boolean) {
    if (isComp) return 'text-amber-700 bg-amber-50 border-amber-100'
    if (!grade) return 'text-gray-400 bg-gray-50 border-gray-100'
    if (/ثقة ثبت/.test(grade)) return 'text-green-800 bg-green-100 border-green-200'
    if (/ثقة/.test(grade)) return 'text-green-700 bg-green-50 border-green-100'
    if (/صدوق/.test(grade)) return 'text-blue-700 bg-blue-50 border-blue-100'
    if (/ضعيف|مجهول/.test(grade)) return 'text-red-700 bg-red-50 border-red-100'
    return 'text-gray-600 bg-gray-50 border-gray-100'
  }

  const CENTURY_LABELS: Record<number, string> = {
    1: 'الصحابة', 2: 'الصحابة', 3: 'الصحابة', 4: 'الصحابة',
    5: 'الصحابة', 6: 'الصحابة', 7: 'الصحابة',
    10: 'كبار التابعين', 20: 'التابعين', 30: 'التابعين', 40: 'التابعين',
    50: 'التابعين', 60: 'التابعين', 70: 'التابعين', 80: 'التابعين', 90: 'التابعين',
    100: 'أتباع التابعين', 110: 'أتباع التابعين', 120: 'أتباع التابعين', 130: 'أتباع التابعين',
    140: 'أتباع التابعين', 150: 'أتباع التابعين', 160: 'أتباع التابعين', 170: 'أتباع التابعين', 180: 'أتباع التابعين', 190: 'أتباع التابعين',
    200: 'عصر التدوين', 210: 'عصر التدوين', 220: 'عصر التدوين', 230: 'عصر التدوين', 240: 'عصر التدوين',
    250: 'عصر التدوين', 260: 'عصر التدوين', 270: 'عصر التدوين', 280: 'عصر التدوين', 290: 'عصر التدوين',
    300: 'ما بعد التدوين', 310: 'ما بعد التدوين', 320: 'ما بعد التدوين',
  }

  const CENTURY_COLORS: Record<string, string> = {
    'الصحابة': 'bg-amber-500',
    'كبار التابعين': 'bg-amber-400',
    'التابعين': 'bg-green-500',
    'أتباع التابعين': 'bg-green-400',
    'عصر التدوين': 'bg-blue-500',
    'ما بعد التدوين': 'bg-blue-300',
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">تسلسل رواة الحديث عبر القرون</h1>
        <p className="text-sm text-gray-500 mb-3">
          توزيع الرواة عقداً بعقد من صدر الإسلام حتى عصر التدوين الكبير — اضغط على أي عقد لعرض تفاصيله
        </p>

        {/* City filter */}
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          <span className="text-xs text-gray-400">تصفية بالمدينة:</span>
          <a href="/narrators/chronology" className={`text-xs px-3 py-1 rounded-full border ${!cityFilter ? 'bg-green-800 text-white border-green-800' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
            الكل
          </a>
          {cities.map(c => (
            <a key={c.city}
              href={`/narrators/chronology?city=${encodeURIComponent(c.city)}${focusDecade ? `&decade=${focusDecade}` : ''}`}
              className={`text-xs px-3 py-1 rounded-full border ${cityFilter === c.city ? 'bg-green-800 text-white border-green-800' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
              {c.city} ({c.count})
            </a>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-xs">
          {Object.entries(CENTURY_COLORS).map(([label, color]) => (
            <div key={label} className="flex items-center gap-1">
              <div className={`w-3 h-3 rounded-sm ${color}`} />
              <span className="text-gray-600">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline visualization */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5 overflow-x-auto">
        <div className="min-w-max">
          {decades.map(d => {
            const era = CENTURY_LABELS[d.decade_start] || 'متأخرون'
            const barColor = CENTURY_COLORS[era] || 'bg-gray-400'
            const barW = Math.round((d.narrator_count / maxNarratorCount) * 200)
            const isActive = focusDecade === d.decade_start
            return (
              <a key={d.decade_start}
                href={`/narrators/chronology?decade=${d.decade_start}${cityFilter ? `&city=${encodeURIComponent(cityFilter)}` : ''}`}
                className={`flex items-center gap-3 py-1 px-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer mb-0.5
                  ${isActive ? 'bg-green-50 ring-1 ring-green-200' : ''}`}>
                <div className="text-xs text-gray-500 w-10 shrink-0 text-left">
                  {d.decade_start}هـ
                </div>
                <div className="w-48 bg-gray-100 rounded-full h-4 shrink-0 relative overflow-hidden">
                  <div className={`h-4 rounded-full ${barColor} transition-all`}
                    style={{ width: `${barW}px` }} />
                  <span className="absolute inset-0 flex items-center justify-center text-xs text-white font-medium drop-shadow-sm">
                    {d.narrator_count}
                  </span>
                </div>
                <div className="text-xs text-gray-400 shrink-0">
                  {d.thiqa_count > 0 && <span className="text-green-600 ml-1">{d.thiqa_count} ثقة</span>}
                  {d.companion_count > 0 && <span className="text-amber-600 ml-1">{d.companion_count} صح</span>}
                </div>
                <div className="text-xs text-gray-300 truncate max-w-xs">
                  {d.top_narrators?.split('، ').slice(0, 3).join(' · ')}
                </div>
              </a>
            )
          })}
        </div>
      </div>

      {/* Detail panel */}
      {focusDecade > 0 && detail.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 mb-5">
          <div className="bg-green-50 px-4 py-3 border-b border-gray-100 rounded-t-xl flex items-center justify-between">
            <div>
              <h2 className="font-bold text-green-900">
                رواة العقد {focusDecade}–{focusDecade + 9}هـ
              </h2>
              <span className="text-xs text-gray-500">
                {(CENTURY_LABELS[focusDecade] || 'متأخرون')} — {detail.length} راوٍ
              </span>
            </div>
            <a href={`/narrators/chronology${cityFilter ? `?city=${encodeURIComponent(cityFilter)}` : ''}`}
              className="text-xs text-gray-400 hover:text-gray-600">× إغلاق</a>
          </div>
          <div className="divide-y divide-gray-50">
            {detail.map(n => (
              <div key={n.id}
                className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <Link href={`/narrator/${n.id}`}
                      className="font-semibold text-green-900 hover:underline text-sm">
                      {n.name}
                    </Link>
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${gradeColor(n.martaba_ibn_hajar, n.is_companion)}`}>
                      {n.is_companion ? 'صحابي' : (n.martaba_ibn_hajar || '—')}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 flex gap-3">
                    {n.death_year_num && <span>ت {n.death_year_num}هـ</span>}
                    {n.city && <span>{n.city}</span>}
                  </div>
                </div>
                <div className="text-xs text-green-700 font-medium shrink-0">
                  {n.hadith_count.toLocaleString('ar-EG')} ح
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'إجمالي الرواة', value: decades.reduce((a, d) => a + d.narrator_count, 0).toLocaleString('ar-EG') },
          { label: 'الثقات', value: decades.reduce((a, d) => a + d.thiqa_count, 0).toLocaleString('ar-EG') },
          { label: 'الصحابة', value: decades.reduce((a, d) => a + d.companion_count, 0).toLocaleString('ar-EG') },
          { label: 'العقود الموثَّقة', value: decades.length.toLocaleString('ar-EG') },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <div className="text-xl font-bold text-green-900">{s.value}</div>
            <div className="text-xs text-gray-400">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators/generations" className="text-green-700 hover:underline">← طبقات الرواة</Link>
        <Link href="/narrators/city-century" className="text-green-700 hover:underline">← المدن والقرون</Link>
        <Link href="/narrators/tabiin-analysis" className="text-green-700 hover:underline">← تحليل التابعين</Link>
      </div>
    </div>
  )
}
