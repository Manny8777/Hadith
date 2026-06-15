import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface CityEdge {
  city_from: string
  city_to: string
  chain_count: number
  unique_narrators_from: number
  unique_narrators_to: number
  sample_from: string | null
  sample_to: string | null
}

interface CityNarrator {
  id: number
  name: string
  abb_name: string | null
  grade: string | null
  death_year: string | null
  is_companion: boolean
  hadith_count: number
}

export default async function CityNetworkPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; minChains?: string }>
}) {
  const sp = await searchParams
  const selectedCity = sp.city || ''
  const minChains = parseInt(sp.minChains || '5')

  const [edgesRes, narratorsRes, topCitiesRes] = await Promise.all([
    pool.query<CityEdge>(
      `SELECT
         n1.city AS city_from,
         n2.city AS city_to,
         COUNT(DISTINCT ic.id)::int AS chain_count,
         COUNT(DISTINCT n1.id)::int AS unique_narrators_from,
         COUNT(DISTINCT n2.id)::int AS unique_narrators_to,
         (SELECT n3.abb_name FROM narrators n3 WHERE n3.city = n1.city AND n3.id = ANY(
           SELECT ic2.narrator_id_array[pos2.ord] FROM isnad_chains ic2
           CROSS JOIN LATERAL (
             SELECT t.ord FROM unnest(ic2.narrator_id_array) WITH ORDINALITY AS t(nid2, ord)
             WHERE t.nid2 = ANY(SELECT id FROM narrators WHERE city = n1.city) LIMIT 1
           ) pos2 LIMIT 1
         ) LIMIT 1) AS sample_from,
         (SELECT n4.abb_name FROM narrators n4 WHERE n4.city = n2.city LIMIT 1) AS sample_to
       FROM isnad_chains ic
       CROSS JOIN LATERAL (
         SELECT t.ord AS pos FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
         WHERE (SELECT n.city FROM narrators n WHERE n.id = t.nid AND n.city IS NOT NULL LIMIT 1) IS NOT NULL
         LIMIT 1
       ) pos1
       JOIN narrators n1 ON n1.id = ic.narrator_id_array[pos1.pos] AND n1.city IS NOT NULL
       CROSS JOIN LATERAL (
         SELECT t2.ord AS pos2 FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t2(nid2, ord2)
         WHERE t2.ord2 > pos1.pos
           AND (SELECT n.city FROM narrators n WHERE n.id = t2.nid2 AND n.city IS NOT NULL AND n.city != n1.city LIMIT 1) IS NOT NULL
         LIMIT 1
       ) pos2
       JOIN narrators n2 ON n2.id = ic.narrator_id_array[pos2.pos2] AND n2.city IS NOT NULL AND n2.city != n1.city
       WHERE ($1 = '' OR n1.city ~* $1 OR n2.city ~* $1)
       GROUP BY n1.city, n2.city
       HAVING COUNT(DISTINCT ic.id) >= $2
       ORDER BY chain_count DESC
       LIMIT 60`,
      [selectedCity || '', minChains]
    ).catch(() => ({ rows: [] as CityEdge[] })),

    selectedCity ? pool.query<CityNarrator>(
      `SELECT
         n.id, n.name, n.abb_name, n.martaba_ibn_hajar AS grade, n.death_year, n.is_companion,
         COUNT(DISTINCT ih.hadith_id)::int AS hadith_count
       FROM narrators n
       LEFT JOIN isnad_chains ic ON n.id = ANY(ic.narrator_id_array)
       LEFT JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       WHERE n.city ~* $1
       GROUP BY n.id, n.name, n.abb_name, n.martaba_ibn_hajar, n.death_year, n.is_companion
       ORDER BY COUNT(DISTINCT ih.hadith_id) DESC
       LIMIT 20`,
      [selectedCity]
    ).catch(() => ({ rows: [] as CityNarrator[] })) : Promise.resolve({ rows: [] as CityNarrator[] }),

    pool.query<{ city: string; narrator_count: number }>(
      `SELECT city, COUNT(*)::int AS narrator_count
       FROM narrators
       WHERE city IS NOT NULL AND city != ''
       GROUP BY city
       HAVING COUNT(*) >= 5
       ORDER BY COUNT(*) DESC
       LIMIT 30`
    ).catch(() => ({ rows: [] as { city: string; narrator_count: number }[] })),
  ])

  const edges = edgesRes.rows
  const narrators = narratorsRes.rows
  const topCities = topCitiesRes.rows

  const maxChains = Math.max(...edges.map(e => e.chain_count), 1)

  function gradeColor(g: string | null, isCompanion: boolean) {
    if (isCompanion) return 'text-amber-700'
    if (!g) return 'text-gray-400'
    if (/ثقة/.test(g)) return 'text-green-700'
    if (/صدوق/.test(g)) return 'text-blue-600'
    if (/ضعيف/.test(g)) return 'text-red-500'
    return 'text-gray-500'
  }

  const MIN_CHAINS_OPTIONS = [3, 5, 10, 20]

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">شبكة الرواية بين المدن</h1>
        <p className="text-sm text-gray-500">
          مسارات انتقال الحديث بين المدن الإسلامية — تكشف كيف تدفَّق العلم من مكة والمدينة إلى الكوفة والبصرة وبغداد ونيسابور وغيرها
        </p>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <span className="text-xs text-gray-500">الحد الأدنى للأسانيد:</span>
        {MIN_CHAINS_OPTIONS.map(m => (
          <a key={m}
            href={`/narrators/city-network?minChains=${m}&city=${selectedCity}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${minChains === m ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
            {m}+
          </a>
        ))}
      </div>

      <div className="grid sm:grid-cols-5 gap-4">
        <div className="sm:col-span-2">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-3">
            <div className="bg-green-50 px-4 py-2 border-b border-green-100 text-xs text-green-800 font-medium">
              أبرز المدن (اضغط لفلترة الشبكة)
            </div>
            <div className="divide-y divide-gray-50 max-h-48 overflow-y-auto">
              {topCities.map(c => (
                <a key={c.city}
                  href={`/narrators/city-network?city=${encodeURIComponent(c.city)}&minChains=${minChains}`}
                  className={`flex items-center gap-2 px-4 py-2 hover:bg-green-50 transition-colors text-sm ${selectedCity === c.city ? 'bg-green-50 font-medium text-green-900' : 'text-gray-700'}`}>
                  <span className="flex-1">{c.city}</span>
                  <span className="text-xs text-gray-400">{c.narrator_count} راوٍ</span>
                </a>
              ))}
            </div>
            {selectedCity && (
              <div className="px-4 py-2 border-t border-gray-50">
                <a href={`/narrators/city-network?minChains=${minChains}`}
                  className="text-xs text-red-500 hover:underline">× إزالة فلتر المدينة</a>
              </div>
            )}
          </div>

          {selectedCity && narrators.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="bg-blue-50 px-4 py-2 border-b border-blue-100 text-xs text-blue-800 font-medium">
                رواة {selectedCity} ({narrators.length})
              </div>
              <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                {narrators.map((n, i) => (
                  <Link key={n.id}
                    href={`/narrator/${n.id}`}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 transition-colors">
                    <span className="text-xs text-gray-300 w-4 shrink-0">{(i + 1).toLocaleString('ar-EG')}</span>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm font-medium hover:underline ${n.is_companion ? 'text-amber-800' : 'text-green-900'}`}>
                        {n.abb_name || n.name.split(' ').slice(0, 3).join(' ')}
                      </span>
                      <div className="flex gap-2 text-xs mt-0.5">
                        {n.death_year && <span className="text-gray-400">ت {n.death_year}</span>}
                        {n.grade && <span className={gradeColor(n.grade, n.is_companion)}>{n.grade.slice(0, 8)}</span>}
                      </div>
                    </div>
                    <span className="text-xs text-green-700 shrink-0">{n.hadith_count.toLocaleString('ar-EG')}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sm:col-span-3">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-100 text-xs text-gray-600 font-medium">
              مسارات انتقال الرواية — مرتَّبة بعدد الأسانيد
            </div>
            <div className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
              {edges.map((e, i) => {
                const barPct = Math.round((e.chain_count / maxChains) * 100)
                const isHighlighted = selectedCity
                  ? (e.city_from.includes(selectedCity) || e.city_to.includes(selectedCity))
                  : true
                return (
                  <div key={i}
                    className={`px-4 py-3 transition-colors ${isHighlighted ? '' : 'opacity-30'}`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <a href={`/narrators/city-network?city=${encodeURIComponent(e.city_from)}&minChains=${minChains}`}
                        className="text-sm font-medium text-green-900 hover:underline">
                        {e.city_from}
                      </a>
                      <span className="text-gray-300">→</span>
                      <a href={`/narrators/city-network?city=${encodeURIComponent(e.city_to)}&minChains=${minChains}`}
                        className="text-sm font-medium text-blue-800 hover:underline">
                        {e.city_to}
                      </a>
                      <span className="text-xs text-gray-400 mr-auto">{e.chain_count.toLocaleString('ar-EG')} سند</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-2 max-w-48">
                        <div className="bg-blue-300 h-2 rounded-full" style={{ width: `${barPct}%` }} />
                      </div>
                      <span className="text-xs text-gray-400">
                        {e.unique_narrators_from} → {e.unique_narrators_to} راوٍ
                      </span>
                    </div>
                  </div>
                )
              })}

              {edges.length === 0 && (
                <div className="p-8 text-center text-sm text-gray-400">
                  لا توجد مسارات بهذه الفلاتر — حاول تخفيض الحد الأدنى للأسانيد
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators/city-century" className="text-green-700 hover:underline">← المدن والقرون</Link>
        <Link href="/narrators/generation-bridge" className="text-green-700 hover:underline">← جسور الأجيال</Link>
        <Link href="/narrators/chronology" className="text-green-700 hover:underline">← تسلسل الرواية</Link>
      </div>
    </div>
  )
}
