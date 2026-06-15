import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'تحليل طبقة التابعين — جامع خادم الحرمين' }

interface TabiRow {
  narrator_id: number
  narrator_name: string
  abb_name: string | null
  death_year_num: number | null
  martaba_ibn_hajar: string | null
  tabaqa: string | null
  companion_count: number  // distinct companions narrated from
  hadith_count: number
  book_count: number
  chain_count: number
}

const SORT_OPTIONS = [
  { key: 'companion_count', label: 'أكثر الصحابة شيوخاً' },
  { key: 'hadith_count', label: 'أكثر أحاديثاً' },
  { key: 'chain_count', label: 'أكثر أسانيد' },
  { key: 'death', label: 'تاريخ الوفاة' },
]

export default async function TabiinAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; min_companions?: string; page?: string }>
}) {
  const sp = await searchParams
  const sort = sp.sort || 'companion_count'
  const minCompanions = Math.max(1, parseInt(sp.min_companions || '3'))
  const page = Math.max(1, parseInt(sp.page || '1'))
  const limit = 30
  const offset = (page - 1) * limit

  const [rowsRes, countRes, statsRes] = await Promise.all([
    pool.query<TabiRow>(
      `SELECT
         n.id AS narrator_id,
         n.name AS narrator_name,
         n.abb_name,
         n.death_year_num,
         n.martaba_ibn_hajar,
         n.tabaqa,
         COUNT(DISTINCT comp.id)::int AS companion_count,
         COUNT(DISTINCT ih.hadith_id)::int AS hadith_count,
         COUNT(DISTINCT ht.book_id)::int AS book_count,
         COUNT(DISTINCT ic.id)::int AS chain_count
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.id = ih.hadith_id
       JOIN narrators n ON n.id = ic.narrator_id_array[2] AND n.is_companion = false
       JOIN narrators comp ON comp.id = ic.narrator_id_array[1] AND comp.is_companion = true
       WHERE array_length(ic.narrator_id_array, 1) >= 2
       GROUP BY n.id, n.name, n.abb_name, n.death_year_num, n.martaba_ibn_hajar, n.tabaqa
       HAVING COUNT(DISTINCT comp.id) >= $1
       ORDER BY
         ${sort === 'hadith_count' ? 'hadith_count DESC, companion_count DESC' :
           sort === 'chain_count' ? 'chain_count DESC, companion_count DESC' :
           sort === 'death' ? 'n.death_year_num ASC NULLS LAST, companion_count DESC' :
           'companion_count DESC, hadith_count DESC'}
       LIMIT ${limit} OFFSET ${offset}`,
      [minCompanions]
    ).catch(() => ({ rows: [] as TabiRow[] })),

    pool.query<{ total: number }>(
      `SELECT COUNT(DISTINCT ic.narrator_id_array[2])::int AS total
       FROM isnad_chains ic
       JOIN narrators n ON n.id = ic.narrator_id_array[2] AND n.is_companion = false
       JOIN narrators comp ON comp.id = ic.narrator_id_array[1] AND comp.is_companion = true
       WHERE array_length(ic.narrator_id_array, 1) >= 2
       GROUP BY n.id
       HAVING COUNT(DISTINCT comp.id) >= $1`,
      [minCompanions]
    ).then(res => ({ rows: [{ total: res.rows.length }] }))
    .catch(() => ({ rows: [{ total: 0 }] })),

    // Overall generation stats
    pool.query<{ stat_label: string; stat_val: number }>(
      `SELECT
         'total_tabi' AS stat_label,
         COUNT(DISTINCT ic.narrator_id_array[2])::int AS stat_val
       FROM isnad_chains ic
       JOIN narrators n ON n.id = ic.narrator_id_array[2] AND n.is_companion = false
       JOIN narrators comp ON comp.id = ic.narrator_id_array[1] AND comp.is_companion = true
       WHERE array_length(ic.narrator_id_array, 1) >= 2
       UNION ALL
       SELECT 'avg_companions', AVG(c)::int
       FROM (
         SELECT COUNT(DISTINCT comp.id) AS c
         FROM isnad_chains ic
         JOIN narrators n ON n.id = ic.narrator_id_array[2] AND n.is_companion = false
         JOIN narrators comp ON comp.id = ic.narrator_id_array[1] AND comp.is_companion = true
         WHERE array_length(ic.narrator_id_array, 1) >= 2
         GROUP BY n.id
       ) sub`,
      []
    ).catch(() => ({ rows: [] })),
  ])

  const rows = rowsRes.rows
  const total = countRes.rows[0]?.total || 0
  const totalPages = Math.ceil(total / limit)
  const maxCompanionCount = Math.max(...rows.map(r => r.companion_count), 1)
  const statsMap = Object.fromEntries(statsRes.rows.map(r => [r.stat_label, r.stat_val]))

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('sort', sort)
    p.set('min_companions', String(minCompanions))
    p.set('page', String(page))
    Object.entries(overrides).forEach(([k, v]) => p.set(k, v))
    return `/narrators/tabiin-analysis?${p.toString()}`
  }

  function gradeColor(g: string | null): string {
    if (!g) return 'bg-gray-100 text-gray-500'
    if (/ثقة ثبت/.test(g)) return 'bg-green-200 text-green-900'
    if (/ثقة/.test(g)) return 'bg-green-100 text-green-700'
    if (/صدوق/.test(g)) return 'bg-blue-100 text-blue-700'
    if (/ضعيف|مجهول/.test(g)) return 'bg-red-100 text-red-700'
    return 'bg-gray-100 text-gray-600'
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">تحليل طبقة التابعين في الأسانيد</h1>
        <p className="text-sm text-gray-500 mb-3">
          التابعون في الموضع الثاني من الأسانيد — الجيل الرائد في نقل الحديث من الصحابة.
          يُصنَّفون بعدد الصحابة الذين رووا عنهم مباشرةً، مما يكشف عن أوسع الناقلين للعلم النبوي
        </p>

        <div className="grid grid-cols-3 gap-3 mb-4 text-center">
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
            <div className="text-xl font-bold text-amber-800">
              {statsMap.total_tabi?.toLocaleString('ar-EG') || '—'}
            </div>
            <div className="text-xs text-amber-600">تابعي في الأسانيد</div>
          </div>
          <div className="bg-green-50 border border-green-100 rounded-xl p-3">
            <div className="text-xl font-bold text-green-800">
              {total.toLocaleString('ar-EG')}
            </div>
            <div className="text-xs text-green-600">روى عن {minCompanions}+ صحابة</div>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
            <div className="text-xl font-bold text-blue-800">
              {statsMap.avg_companions?.toLocaleString('ar-EG') || '—'}
            </div>
            <div className="text-xs text-blue-600">متوسط الصحابة الشيوخ</div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">أدنى عدد صحابة:</span>
          {[1, 2, 3, 5, 10, 15].map(n => (
            <Link key={n} href={buildUrl({ min_companions: String(n), page: '1' })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                minCompanions === n
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {n}+
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">ترتيب:</span>
          {SORT_OPTIONS.map(s => (
            <Link key={s.key} href={buildUrl({ sort: s.key, page: '1' })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                sort === s.key
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {s.label}
            </Link>
          ))}
        </div>

        <div className="text-xs text-gray-400">
          {total.toLocaleString('ar-EG')} تابعي — صفحة {page} من {totalPages}
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((r, idx) => (
          <div key={r.narrator_id}
            className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm hover:border-amber-200 transition-all">
            <div className="flex items-start gap-3">
              <span className="text-xs text-gray-300 shrink-0 w-6">
                {(offset + idx + 1).toLocaleString('ar-EG')}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <Link href={`/narrator/${r.narrator_id}`}
                    className="font-bold text-green-900 hover:underline text-sm">
                    {r.narrator_name}
                  </Link>
                  {r.abb_name && r.abb_name !== r.narrator_name && (
                    <span className="text-xs text-gray-400">({r.abb_name})</span>
                  )}
                  {r.tabaqa && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                      {r.tabaqa}
                    </span>
                  )}
                  {r.death_year_num != null && (
                    <span className="text-xs text-gray-400">ت {r.death_year_num}</span>
                  )}
                  {r.martaba_ibn_hajar && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${gradeColor(r.martaba_ibn_hajar)}`}>
                      {r.martaba_ibn_hajar}
                    </span>
                  )}
                </div>

                {/* Companion count bar */}
                <div className="mb-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-500">الصحابة الشيوخ:</span>
                    <span className="text-xs font-bold text-amber-700">
                      {r.companion_count.toLocaleString('ar-EG')} صحابياً
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-amber-500 h-2 rounded-full transition-all"
                      style={{ width: `${(r.companion_count / maxCompanionCount) * 100}%` }} />
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                  <span className="text-green-700 font-medium">
                    {r.hadith_count.toLocaleString('ar-EG')} حديث
                  </span>
                  <span>{r.chain_count.toLocaleString('ar-EG')} سند</span>
                  <span className="text-gray-400">{r.book_count} كتاب</span>
                  <Link href={`/narrator/${r.narrator_id}/statistics`}
                    className="text-indigo-600 hover:underline">إحصاءات ←</Link>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">لا توجد نتائج</div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
          {page > 1 && (
            <Link href={buildUrl({ page: String(page - 1) })}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-amber-400">← السابق</Link>
          )}
          <span className="text-xs text-gray-500">{page} / {totalPages}</span>
          {page < totalPages && (
            <Link href={buildUrl({ page: String(page + 1) })}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-amber-400">التالي ←</Link>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators/generations" className="text-green-700 hover:underline">← طبقات الرواة</Link>
        <Link href="/narrators/transmission-pairs" className="text-green-700 hover:underline">← أزواج الرواية</Link>
        <Link href="/narrators/hearing-gaps" className="text-green-700 hover:underline">← فجوات السماع</Link>
        <Link href="/companions" className="text-green-700 hover:underline">← الصحابة</Link>
      </div>
    </div>
  )
}
