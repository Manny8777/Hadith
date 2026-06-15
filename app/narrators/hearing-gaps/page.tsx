import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'كشاف فجوات السماع — جامع خادم الحرمين' }

interface GapRow {
  narrator_id: number
  narrator_name: string
  abb_name: string | null
  narrator_death: number | null
  martaba_ibn_hajar: string | null
  tabaqa: string | null
  companion_id: number
  companion_name: string
  companion_abb: string | null
  companion_death: number | null
  gap_years: number
  chain_count: number
  hadith_count: number
}

function gapColor(gap: number): string {
  if (gap >= 150) return 'bg-red-100 text-red-800 border-red-200'
  if (gap >= 120) return 'bg-orange-100 text-orange-700 border-orange-200'
  if (gap >= 100) return 'bg-amber-100 text-amber-700 border-amber-200'
  return 'bg-yellow-50 text-yellow-700 border-yellow-200'
}

function riskLabel(gap: number): string {
  if (gap >= 150) return 'شبه مستحيل'
  if (gap >= 120) return 'مشكوك فيه'
  if (gap >= 100) return 'مثير للاهتمام'
  return 'يستحق الدراسة'
}

function gradeColor(g: string | null): string {
  if (!g) return 'bg-gray-100 text-gray-500'
  if (/ثقة/.test(g)) return 'bg-green-100 text-green-700'
  if (/صدوق/.test(g)) return 'bg-amber-100 text-amber-700'
  if (/ضعيف|مجهول/.test(g)) return 'bg-red-100 text-red-700'
  return 'bg-gray-100 text-gray-600'
}

export default async function HearingGapsPage({
  searchParams,
}: {
  searchParams: Promise<{ min_gap?: string; sort?: string; page?: string }>
}) {
  const sp = await searchParams
  const minGap = Math.max(60, parseInt(sp.min_gap || '100'))
  const sort = sp.sort || 'gap_years'
  const page = Math.max(1, parseInt(sp.page || '1'))
  const limit = 30
  const offset = (page - 1) * limit

  const orderBy =
    sort === 'hadith_count' ? 'hadith_count DESC, gap_years DESC' :
    sort === 'narrator_death' ? 'narrator_death ASC NULLS LAST, gap_years DESC' :
    'gap_years DESC, hadith_count DESC'

  // Find narrators at position 2 in isnad chains where the gap with the companion at position 1 is large
  const [rowsRes, countRes] = await Promise.all([
    pool.query<GapRow>(
      `SELECT DISTINCT ON (ic.narrator_id_array[2], ic.narrator_id_array[1])
              ic.narrator_id_array[2] AS narrator_id,
              n.name AS narrator_name, n.abb_name,
              n.death_year_num AS narrator_death,
              n.martaba_ibn_hajar, n.tabaqa,
              ic.narrator_id_array[1] AS companion_id,
              comp.name AS companion_name, comp.abb_name AS companion_abb,
              comp.death_year_num AS companion_death,
              (n.death_year_num - comp.death_year_num)::int AS gap_years,
              COUNT(DISTINCT ic.id) OVER (PARTITION BY ic.narrator_id_array[2], ic.narrator_id_array[1])::int AS chain_count,
              COUNT(DISTINCT ih.hadith_id) OVER (PARTITION BY ic.narrator_id_array[2], ic.narrator_id_array[1])::int AS hadith_count
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN narrators n ON n.id = ic.narrator_id_array[2]
       JOIN narrators comp ON comp.id = ic.narrator_id_array[1]
         AND comp.is_companion = true
         AND comp.death_year_num IS NOT NULL
       WHERE array_length(ic.narrator_id_array, 1) >= 2
         AND n.death_year_num IS NOT NULL
         AND n.is_companion = false
         AND (n.death_year_num - comp.death_year_num) >= $1
       ORDER BY ic.narrator_id_array[2], ic.narrator_id_array[1], (n.death_year_num - comp.death_year_num) DESC`,
      [minGap]
    ).then(res => {
      // sort in JS since DISTINCT ON prevents ORDER BY on gap_years
      const sorted = [...res.rows].sort((a, b) =>
        sort === 'hadith_count' ? (b.hadith_count - a.hadith_count || b.gap_years - a.gap_years) :
        sort === 'narrator_death' ? ((a.narrator_death || 9999) - (b.narrator_death || 9999)) :
        (b.gap_years - a.gap_years)
      )
      return { rows: sorted.slice(offset, offset + limit) }
    }).catch(() => ({ rows: [] as GapRow[] })),

    pool.query<{ total: number }>(
      `SELECT COUNT(DISTINCT (ic.narrator_id_array[2], ic.narrator_id_array[1]))::int AS total
       FROM isnad_chains ic
       JOIN narrators n ON n.id = ic.narrator_id_array[2]
       JOIN narrators comp ON comp.id = ic.narrator_id_array[1]
         AND comp.is_companion = true
         AND comp.death_year_num IS NOT NULL
       WHERE array_length(ic.narrator_id_array, 1) >= 2
         AND n.death_year_num IS NOT NULL
         AND n.is_companion = false
         AND (n.death_year_num - comp.death_year_num) >= $1`,
      [minGap]
    ).catch(() => ({ rows: [{ total: 0 }] })),
  ])

  const rows = rowsRes.rows
  const total = countRes.rows[0]?.total || 0
  const totalPages = Math.ceil(total / limit)

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('min_gap', String(minGap))
    p.set('sort', sort)
    p.set('page', String(page))
    Object.entries(overrides).forEach(([k, v]) => p.set(k, v))
    return `/narrators/hearing-gaps?${p.toString()}`
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">كشاف فجوات السماع</h1>
        <p className="text-sm text-gray-500 mb-3">
          رواة يروون عن صحابي مباشرةً بفارق زمني كبير — فجوات تستحق الفحص الدقيق في التحقيق الحديثي
        </p>

        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4 text-xs text-amber-800">
          <span className="font-semibold">منهجية التحليل: </span>
          يُحسب الفارق بين سنة وفاة الراوي وسنة وفاة الصحابي الذي يروي عنه مباشرة (موضع الثاني في السند).
          الفارق الكبير يعني أن الراوي لو سمع من الصحابي لكان في سنٍّ متقدمة جداً. لا يُعدّ هذا دليلاً قاطعاً
          على الانقطاع، لكنه مؤشر يدعو للدراسة والتمحيص.
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">أدنى فارق:</span>
          {[60, 80, 100, 120, 150].map(n => (
            <Link key={n} href={buildUrl({ min_gap: String(n), page: '1' })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                minGap === n
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {n}+ سنة
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">ترتيب:</span>
          {[
            { key: 'gap_years', label: 'أكبر فجوة' },
            { key: 'hadith_count', label: 'أكثر أحاديث' },
            { key: 'narrator_death', label: 'تاريخ الوفاة' },
          ].map(s => (
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
          {total.toLocaleString('ar-EG')} حالة — صفحة {page} من {totalPages}
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((r, idx) => {
          const risk = riskLabel(r.gap_years)
          const riskColor = gapColor(r.gap_years)
          return (
            <div key={`${r.narrator_id}-${r.companion_id}`}
              className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-300">{(offset + idx + 1).toLocaleString('ar-EG')}</span>
                    <Link href={`/narrator/${r.narrator_id}`}
                      className="font-bold text-green-900 hover:underline text-sm">
                      {r.narrator_name}
                    </Link>
                    {r.martaba_ibn_hajar && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${gradeColor(r.martaba_ibn_hajar)}`}>
                        {r.martaba_ibn_hajar}
                      </span>
                    )}
                  </div>
                  {r.narrator_death && (
                    <span className="text-xs text-gray-400 mr-5">ت {r.narrator_death}هـ</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs border px-2 py-0.5 rounded-full font-bold ${riskColor}`}>
                    {risk} — {r.gap_years} سنة
                  </span>
                </div>
              </div>

              {/* Visual gap timeline */}
              <div className="bg-gray-50 rounded-lg p-3 mb-3">
                <div className="flex items-center justify-between text-xs mb-2">
                  <div className="text-right">
                    <div className="font-bold text-amber-700">
                      <Link href={`/narrator/${r.companion_id}`} className="hover:underline">
                        {r.companion_abb || r.companion_name}
                      </Link>
                    </div>
                    <div className="text-gray-400">ت {r.companion_death}هـ</div>
                  </div>
                  <div className="flex-1 mx-4 flex items-center">
                    <div className="flex-1 border-t-2 border-dashed border-gray-300 relative">
                      <span className="absolute top-[-8px] right-1/2 transform translate-x-1/2 text-gray-500 font-bold text-xs bg-white px-1">
                        {r.gap_years}سنة
                      </span>
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-green-800">{r.abb_name || r.narrator_name}</div>
                    <div className="text-gray-400">ت {r.narrator_death}هـ</div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                {r.tabaqa && <span>طبقة: {r.tabaqa}</span>}
                <span className="text-gray-400">{r.chain_count} سند</span>
                <span className="text-gray-400">{r.hadith_count} حديث</span>
                <Link href={`/narrator/${r.narrator_id}/statistics`}
                  className="text-indigo-600 hover:underline">إحصاءات الراوي ←</Link>
                <Link href={`/narrator/${r.narrator_id}/criticism-history`}
                  className="text-gray-400 hover:text-green-700">الجرح والتعديل ←</Link>
              </div>
            </div>
          )
        })}
      </div>

      {rows.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">
          لا توجد نتائج بهذا الحد الأدنى للفجوة
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
          {page > 1 && (
            <Link href={buildUrl({ page: String(page - 1) })}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-green-400">← السابق</Link>
          )}
          <span className="text-xs text-gray-500">{page} / {totalPages}</span>
          {page < totalPages && (
            <Link href={buildUrl({ page: String(page + 1) })}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-green-400">التالي ←</Link>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/chain-gaps" className="text-green-700 hover:underline">← كاشف الانقطاع</Link>
        <Link href="/narrators/contested" className="text-green-700 hover:underline">← المختلف فيهم</Link>
        <Link href="/hadiths/ilal" className="text-green-700 hover:underline">← علل الحديث</Link>
      </div>
    </div>
  )
}
