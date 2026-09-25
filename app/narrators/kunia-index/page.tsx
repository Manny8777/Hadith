import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'فهرس الكنى — جامع خادم الحرمين' }

interface KuniaGroup {
  kunia: string
  cnt: number
  sample_names: string | null
}

interface NarratorRow {
  id: number
  name: string
  abb_name: string | null
  martaba_ibn_hajar: string | null
  death_year: string | null
  death_year_num: number | null
  is_companion: boolean
  hadiths_count: number | null
  tabaqa: string | null
  living_city: string | null
}

function gradeClass(g: string | null) {
  if (!g) return 'bg-gray-100 text-gray-600'
  if (/ثقة|ثبت|حجة|صحابي/.test(g)) return 'bg-green-100 text-green-700'
  if (/صدوق|لا بأس/.test(g)) return 'bg-amber-100 text-amber-700'
  if (/ضعيف|متروك/.test(g)) return 'bg-red-100 text-red-600'
  return 'bg-gray-100 text-gray-500'
}

export default async function KuniaIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kunia?: string; page?: string }>
}) {
  const sp = await searchParams
  const query = sp.q?.trim() || ''
  const selectedKunia = sp.kunia || ''
  const pg = Math.max(1, parseInt(sp.page || '1'))
  const limit = 60
  const offset = (pg - 1) * limit

  const [topKuniasRes, narratorsRes, totalRes] = await Promise.all([
    // Top kuniyas by frequency, with search filter
    pool.query<KuniaGroup>(
      `SELECT kunia, COUNT(*)::int AS cnt,
              STRING_AGG(COALESCE(abb_name, name), '، ' ORDER BY hadiths_count DESC NULLS LAST)
                FILTER (WHERE rn <= 2) AS sample_names
       FROM (
         SELECT kunia, name, abb_name, hadiths_count,
                ROW_NUMBER() OVER (PARTITION BY kunia ORDER BY hadiths_count DESC NULLS LAST) AS rn
         FROM narrators
         WHERE kunia IS NOT NULL AND kunia != ''
           ${query.length >= 2 ? `AND kunia ILIKE $1` : ''}
       ) sub
       GROUP BY kunia
       ORDER BY cnt DESC, kunia
       LIMIT 60`,
      query.length >= 2 ? [`%${query}%`] : []
    ).catch(() => ({ rows: [] as KuniaGroup[] })),

    // Narrators with selected kunya
    selectedKunia
      ? pool.query<NarratorRow>(
          `SELECT id, name, abb_name, martaba_ibn_hajar, death_year_num AS death_year, death_year_num,
                  is_companion, hadiths_count, tabaqa, living_city
           FROM narrators
           WHERE kunia = $1
           ORDER BY death_year_num ASC NULLS LAST, name
           LIMIT $2 OFFSET $3`,
          [selectedKunia, limit, offset]
        ).catch(() => ({ rows: [] as NarratorRow[] }))
      : Promise.resolve({ rows: [] as NarratorRow[] }),

    selectedKunia
      ? pool.query<{ cnt: number }>(
          `SELECT COUNT(*)::int AS cnt FROM narrators WHERE kunia = $1`,
          [selectedKunia]
        ).catch(() => ({ rows: [{ cnt: 0 }] }))
      : Promise.resolve({ rows: [{ cnt: 0 }] }),
  ])

  const topKunias = topKuniasRes.rows
  const narrators = narratorsRes.rows
  const totalForKunia = totalRes.rows[0]?.cnt || 0
  const totalPages = Math.ceil(totalForKunia / limit)

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    if (query) p.set('q', query)
    if (selectedKunia) p.set('kunia', selectedKunia)
    p.set('page', '1')
    Object.entries(overrides).forEach(([k, v]) => {
      if (v) p.set(k, v); else p.delete(k)
    })
    return `/narrators/kunia-index?${p.toString()}`
  }

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">فهرس الكنى</h1>
        <p className="text-sm text-gray-500 mb-3">
          تصفح الرواة بكناهم — أداة لتمييز الرواة الذين يشتركون في الكنية الواحدة
          كـ"أبو عبد الله" و"أبو محمد" ونحوهما
        </p>

        {/* Search box */}
        <form action="/narrators/kunia-index" method="get" className="flex gap-2 mb-4">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="ابحث في الكنى..."
            className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
          />
          <button type="submit"
            className="bg-green-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 transition-colors">
            بحث
          </button>
          {query && (
            <Link href="/narrators/kunia-index"
              className="border border-gray-200 text-gray-600 px-3 py-2 rounded-lg text-sm hover:bg-gray-50">
              ✕
            </Link>
          )}
        </form>

        {/* Research note */}
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4 text-xs text-amber-800">
          تتكرر الكنى في علم الرجال تكراراً كبيراً؛ فـ"أبو عبد الله" وحدها تُطلق على مئات من العلماء.
          يُعين هذا الفهرس الباحث على تمييز الرواة عند ورود الكنية مفردةً في نص إسناد.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left column: kunya list */}
        <div>
          <h2 className="text-sm font-bold text-gray-700 mb-2">
            {query ? `الكنى التي تتضمن "${query}"` : 'أشهر الكنى'} ({topKunias.length})
          </h2>
          <div className="space-y-1.5 max-h-[70vh] overflow-y-auto">
            {topKunias.map(k => (
              <Link key={k.kunia} href={buildUrl({ kunia: k.kunia, page: '1' })}
                className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition-all ${
                  selectedKunia === k.kunia
                    ? 'bg-green-800 text-white border-green-800'
                    : 'bg-white border-gray-100 hover:border-green-200 hover:shadow-sm'
                }`}>
                <div className="min-w-0">
                  <div className={`font-semibold text-sm truncate ${selectedKunia === k.kunia ? 'text-white' : 'text-green-900'}`}>
                    {k.kunia}
                  </div>
                  {k.sample_names && (
                    <div className={`text-xs truncate mt-0.5 ${selectedKunia === k.kunia ? 'text-green-200' : 'text-gray-400'}`}>
                      {k.sample_names}
                    </div>
                  )}
                </div>
                <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                  selectedKunia === k.kunia
                    ? 'bg-green-700 text-white'
                    : 'bg-green-50 text-green-700'
                }`}>
                  {k.cnt}
                </span>
              </Link>
            ))}

            {topKunias.length === 0 && (
              <div className="text-center text-gray-500 py-6 text-sm">
                لا توجد كنى تطابق البحث
              </div>
            )}
          </div>
        </div>

        {/* Right column: narrators with selected kunya */}
        <div>
          {selectedKunia ? (
            <>
              <h2 className="text-sm font-bold text-gray-700 mb-2">
                الرواة بكنية "{selectedKunia}" ({totalForKunia})
              </h2>
              <div className="space-y-2">
                {narrators.map(n => (
                  <Link key={n.id} href={`/narrator/${n.id}`}
                    className="block bg-white rounded-xl border border-gray-100 px-4 py-3 hover:shadow-sm hover:border-green-200 transition-all group">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {n.is_companion && (
                            <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">صحابي</span>
                          )}
                          <span className="font-semibold text-sm text-green-900 group-hover:text-green-700">
                            {n.name}
                          </span>
                        </div>
                        {n.abb_name && n.abb_name !== n.name && (
                          <p className="text-xs text-gray-400 mt-0.5">{n.abb_name}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {n.death_year && (
                            <span className="text-xs text-gray-500">ت {n.death_year}هـ</span>
                          )}
                          {n.tabaqa && (
                            <span className="text-xs text-gray-400">{n.tabaqa}</span>
                          )}
                          {n.living_city && (
                            <span className="text-xs text-gray-400">{n.living_city}</span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        {n.martaba_ibn_hajar && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${gradeClass(n.martaba_ibn_hajar)}`}>
                            {n.martaba_ibn_hajar.split('،')[0].trim().slice(0, 15)}
                          </span>
                        )}
                        {n.hadiths_count ? (
                          <span className="text-xs text-gray-400">{n.hadiths_count.toLocaleString('ar-EG')} حديث</span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  {pg > 1 && (
                    <Link href={buildUrl({ page: String(pg - 1) })}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-xs">
                      السابق
                    </Link>
                  )}
                  <span className="text-xs text-gray-500">
                    {pg} / {totalPages}
                  </span>
                  {pg < totalPages && (
                    <Link href={buildUrl({ page: String(pg + 1) })}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-xs">
                      التالي
                    </Link>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
              اختر كنيةً من القائمة لعرض الرواة
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators/alpha-index" className="text-green-700 hover:underline">← الفهرس الأبجدي</Link>
        <Link href="/narrators" className="text-green-700 hover:underline">← بحث الرواة</Link>
      </div>
    </div>
  )
}
