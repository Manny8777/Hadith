import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'أزواج الرواة في الأسانيد — جامع خادم الحرمين' }

interface PairRow {
  teacher_id: number
  teacher_name: string
  teacher_abb: string | null
  teacher_grade: string | null
  teacher_companion: boolean
  student_id: number
  student_name: string
  student_abb: string | null
  student_grade: string | null
  pair_count: number
  hadith_count: number
}

function gradeColor(g: string | null, isComp: boolean): string {
  if (isComp) return 'bg-amber-100 text-amber-800'
  if (!g) return 'bg-gray-100 text-gray-500'
  if (/ثقة|ثبت/.test(g)) return 'bg-green-100 text-green-700'
  if (/صدوق/.test(g)) return 'bg-blue-100 text-blue-700'
  if (/ضعيف|مجهول/.test(g)) return 'bg-red-100 text-red-700'
  return 'bg-gray-100 text-gray-600'
}

export default async function TransmissionPairsPage({
  searchParams,
}: {
  searchParams: Promise<{ min_count?: string; position?: string; page?: string }>
}) {
  const sp = await searchParams
  const minCount = Math.max(10, parseInt(sp.min_count || '50'))
  const position = sp.position || 'any'
  const page = Math.max(1, parseInt(sp.page || '1'))
  const limit = 40
  const offset = (page - 1) * limit

  // Position filter: companion-to-tabi (position 1→2), any adjacent
  const positionClause =
    position === 'comp_to_tabi'
      ? 'AND comp.is_companion = true AND n2.is_companion = false'
      : position === 'tabi_to_next'
      ? 'AND comp.is_companion = false AND n2.is_companion = false'
      : ''

  const [rowsRes, countRes] = await Promise.all([
    pool.query<PairRow>(
      `SELECT
         ic.narrator_id_array[g.idx] AS teacher_id,
         comp.name AS teacher_name, comp.abb_name AS teacher_abb,
         comp.martaba_ibn_hajar AS teacher_grade, comp.is_companion AS teacher_companion,
         ic.narrator_id_array[g.idx + 1] AS student_id,
         n2.name AS student_name, n2.abb_name AS student_abb,
         n2.martaba_ibn_hajar AS student_grade,
         COUNT(DISTINCT ic.id)::int AS pair_count,
         COUNT(DISTINCT ih.hadith_id)::int AS hadith_count
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN LATERAL generate_series(1, array_length(ic.narrator_id_array, 1) - 1) AS g(idx) ON true
       JOIN narrators comp ON comp.id = ic.narrator_id_array[g.idx]
       JOIN narrators n2 ON n2.id = ic.narrator_id_array[g.idx + 1]
       WHERE ic.narrator_id_array[g.idx] IS NOT NULL
         AND ic.narrator_id_array[g.idx + 1] IS NOT NULL
         ${positionClause}
       GROUP BY teacher_id, teacher_name, teacher_abb, teacher_grade, teacher_companion,
                student_id, student_name, student_abb, student_grade
       HAVING COUNT(DISTINCT ic.id) >= $1
       ORDER BY pair_count DESC
       LIMIT ${limit} OFFSET ${offset}`,
      [minCount]
    ).catch(() => ({ rows: [] as PairRow[] })),

    pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM (
         SELECT ic.narrator_id_array[g.idx] AS tid, ic.narrator_id_array[g.idx + 1] AS sid
         FROM isnad_chains ic
         JOIN LATERAL generate_series(1, array_length(ic.narrator_id_array, 1) - 1) AS g(idx) ON true
         JOIN narrators comp ON comp.id = ic.narrator_id_array[g.idx]
         JOIN narrators n2 ON n2.id = ic.narrator_id_array[g.idx + 1]
         WHERE ic.narrator_id_array[g.idx] IS NOT NULL AND ic.narrator_id_array[g.idx + 1] IS NOT NULL
           ${positionClause}
         GROUP BY tid, sid
         HAVING COUNT(DISTINCT ic.id) >= $1
       ) sub`,
      [minCount]
    ).catch(() => ({ rows: [{ total: 0 }] })),
  ])

  const rows = rowsRes.rows
  const total = countRes.rows[0]?.total || 0
  const totalPages = Math.ceil(total / limit)
  const maxPairs = Math.max(...rows.map(r => r.pair_count), 1)

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('min_count', String(minCount))
    p.set('position', position)
    p.set('page', String(page))
    Object.entries(overrides).forEach(([k, v]) => p.set(k, v))
    return `/narrators/transmission-pairs?${p.toString()}`
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">أزواج الرواة في الأسانيد</h1>
        <p className="text-sm text-gray-500 mb-3">
          أكثر أزواج الشيخ والتلميذ تكراراً في سلاسل الإسناد — يكشف عن أهم قنوات الرواية في تاريخ الحديث
        </p>

        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 mb-4 text-xs text-indigo-800">
          <span className="font-semibold">أهمية علمية: </span>
          الزوج الشيخ-تلميذ المتكرر يدل على علاقة علمية وثيقة — يُفيد في تحديد مدارس الرواية ومراكز التحديث.
          تكرار الزوج في مئات الأسانيد يعكس مكانة الشيخ ونشاط التلميذ في نقل الحديث.
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">موضع في السند:</span>
          {[
            { key: 'any', label: 'أي موضع' },
            { key: 'comp_to_tabi', label: 'صحابي → تابعي' },
            { key: 'tabi_to_next', label: 'بين التابعين' },
          ].map(p => (
            <Link key={p.key} href={buildUrl({ position: p.key, page: '1' })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                position === p.key
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {p.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">الحد الأدنى للتكرار:</span>
          {[20, 50, 100, 200, 500].map(n => (
            <Link key={n} href={buildUrl({ min_count: String(n), page: '1' })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                minCount === n
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {n}+ سند
            </Link>
          ))}
        </div>

        <div className="text-xs text-gray-400">
          {total.toLocaleString('ar-EG')} زوج — صفحة {page} من {totalPages}
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((r, idx) => (
          <div key={`${r.teacher_id}-${r.student_id}`}
            className="bg-white rounded-xl border border-gray-100 p-3 hover:shadow-sm hover:border-green-200 transition-all">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-gray-300 w-5 shrink-0">
                {(offset + idx + 1).toLocaleString('ar-EG')}
              </span>

              {/* Teacher */}
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                {r.teacher_companion && (
                  <span className="text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded-full shrink-0">صحابي</span>
                )}
                <Link href={`/narrator/${r.teacher_id}`}
                  className="text-sm font-bold text-green-900 hover:underline truncate max-w-[120px]">
                  {r.teacher_abb || r.teacher_name}
                </Link>
                {r.teacher_grade && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full max-w-full ${gradeColor(r.teacher_grade, r.teacher_companion)}`}>
                    {r.teacher_grade}
                  </span>
                )}
              </div>

              {/* Arrow */}
              <span className="text-gray-400 shrink-0">←</span>

              {/* Student */}
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <Link href={`/narrator/${r.student_id}`}
                  className="text-sm font-bold text-indigo-900 hover:underline truncate max-w-[120px]">
                  {r.student_abb || r.student_name}
                </Link>
                {r.student_grade && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full max-w-full ${gradeColor(r.student_grade, false)}`}>
                    {r.student_grade}
                  </span>
                )}
              </div>

              {/* Count bar */}
              <div className="flex-1 basis-40 flex items-center gap-2 min-w-0">
                <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div className="bg-indigo-500 h-2 rounded-full"
                    style={{ width: `${(r.pair_count / maxPairs) * 100}%` }} />
                </div>
                <span className="text-xs font-bold text-gray-700 shrink-0 w-16 text-left">
                  {r.pair_count.toLocaleString('ar-EG')} سند
                </span>
                <span className="text-xs text-gray-400 shrink-0">
                  ({r.hadith_count.toLocaleString('ar-EG')} ح)
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">
          لا توجد نتائج — جرب تقليل الحد الأدنى للتكرار
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
        <Link href="/narrators/network" className="text-green-700 hover:underline">← شبكة الأسانيد</Link>
        <Link href="/narrators/chain-filter" className="text-green-700 hover:underline">← تتبع الإسناد</Link>
        <Link href="/companions/isolated-chains" className="text-green-700 hover:underline">← محدودو الطرق</Link>
      </div>
    </div>
  )
}
