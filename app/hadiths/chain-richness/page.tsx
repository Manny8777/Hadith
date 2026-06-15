import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'تعدد الأسانيد — جامع خادم الحرمين' }

interface RichHadith {
  hadith_id: number
  chain_count: number
  tarf: string | null
  book_title: string
  takhrij_author: string | null
  grade_hint: string | null
}

function stripTags(html: string) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function chainColor(cnt: number) {
  if (cnt >= 20) return 'bg-purple-700 text-white'
  if (cnt >= 10) return 'bg-green-700 text-white'
  if (cnt >= 5) return 'bg-amber-600 text-white'
  return 'bg-gray-400 text-white'
}

function gradeClass(g: string | null) {
  if (g === 'صحيح') return 'bg-green-100 text-green-700'
  if (g === 'حسن') return 'bg-amber-100 text-amber-700'
  if (g === 'ضعيف') return 'bg-red-100 text-red-600'
  return ''
}

export default async function ChainRichnessPage({
  searchParams,
}: {
  searchParams: Promise<{ min_chains?: string; page?: string }>
}) {
  const sp = await searchParams
  const minChains = Math.max(2, parseInt(sp.min_chains || '5'))
  const pg = Math.max(1, parseInt(sp.page || '1'))
  const limit = 40
  const offset = (pg - 1) * limit

  const [resultsRes, totalRes, distRes] = await Promise.all([
    pool.query<RichHadith>(
      `SELECT ih.hadith_id,
              COUNT(DISTINCT ih.isnad_id)::int AS chain_count,
              regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g') AS tarf,
              b.title AS book_title, b.takhrij_author,
              jg.grade_hint
       FROM isnad_hadiths ih
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
         AND ht.is_leaf = true AND ht.is_paragraph = true
       JOIN books b ON b.id = ht.book_id
       LEFT JOIN LATERAL (
         SELECT CASE
           WHEN say_text ~* 'صحيح' THEN 'صحيح'
           WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح' THEN 'حسن'
           WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
           ELSE NULL END AS grade_hint
         FROM hadith_judgments j2
         WHERE j2.hadith_id = ih.hadith_id
           AND (j2.say_text ~* 'صحيح|إسناده حسن|حديث حسن|سنده حسن|ضعيف|منكر|متروك')
         ORDER BY CASE WHEN j2.say_text ~* 'صحيح' THEN 1 WHEN j2.say_text ~* 'حسن' THEN 2 ELSE 3 END
         LIMIT 1
       ) jg ON true
       GROUP BY ih.hadith_id, ht.tarf, b.title, b.takhrij_author, jg.grade_hint
       HAVING COUNT(DISTINCT ih.isnad_id) >= $1
       ORDER BY chain_count DESC, ih.hadith_id
       LIMIT ${limit} OFFSET ${offset}`,
      [minChains]
    ).catch(() => ({ rows: [] as RichHadith[] })),

    pool.query<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt
       FROM (
         SELECT ih.hadith_id
         FROM isnad_hadiths ih
         JOIN hadith_toc ht ON ht.main_id = ih.hadith_id AND ht.is_leaf = true AND ht.is_paragraph = true
         GROUP BY ih.hadith_id
         HAVING COUNT(DISTINCT ih.isnad_id) >= $1
       ) sub`,
      [minChains]
    ).catch(() => ({ rows: [{ cnt: 0 }] })),

    // Distribution of chain counts
    pool.query<{ range_label: string; cnt: number; min_c: number }>(
      `SELECT
         CASE
           WHEN chain_count >= 20 THEN '20+'
           WHEN chain_count >= 10 THEN '10-19'
           WHEN chain_count >= 5 THEN '5-9'
           WHEN chain_count >= 3 THEN '3-4'
           ELSE '2'
         END AS range_label,
         MIN(chain_count) AS min_c,
         COUNT(*)::int AS cnt
       FROM (
         SELECT hadith_id, COUNT(DISTINCT isnad_id) AS chain_count
         FROM isnad_hadiths
         GROUP BY hadith_id
         HAVING COUNT(DISTINCT isnad_id) >= 2
       ) sub
       GROUP BY range_label
       ORDER BY min_c DESC`
    ).catch(() => ({ rows: [] as { range_label: string; cnt: number; min_c: number }[] })),
  ])

  const results = resultsRes.rows
  const total = totalRes.rows[0]?.cnt || 0
  const totalPages = Math.ceil(total / limit)
  const dist = distRes.rows

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('min_chains', String(minChains))
    p.set('page', '1')
    Object.entries(overrides).forEach(([k, v]) => {
      if (v) p.set(k, v); else p.delete(k)
    })
    return `/hadiths/chain-richness?${p.toString()}`
  }

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الأحاديث متعددة الأسانيد</h1>
        <p className="text-sm text-gray-500 mb-3">
          أحاديث تروى بأكبر عدد من الأسانيد المستقلة —
          يعكس كثرة الأسانيد قوة الضبط وتعدد طرق الرواية مما يعزز الثقة بالحديث
        </p>

        {/* Distribution */}
        {dist.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 mb-3">
            <p className="text-xs text-gray-400 mb-2">توزيع الأحاديث بعدد الأسانيد</p>
            <div className="flex items-center gap-3 flex-wrap">
              {dist.map(d => (
                <Link key={d.range_label} href={buildUrl({ min_chains: String(d.min_c) })}
                  className={`flex flex-col items-center px-3 py-2 rounded-xl border transition-colors ${
                    minChains === d.min_c
                      ? 'bg-green-800 text-white border-green-800'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-green-300'
                  }`}>
                  <span className="text-sm font-bold">{d.range_label}</span>
                  <span className="text-xs opacity-70">{d.cnt.toLocaleString('ar-EG')} حديث</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Min chains filter */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-xs text-gray-500">الحد الأدنى للأسانيد:</span>
          {[2, 3, 5, 10, 15, 20].map(n => (
            <Link key={n} href={buildUrl({ min_chains: String(n) })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                minChains === n
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {n}+ سند
            </Link>
          ))}
          <span className="text-xs text-gray-400 mr-auto">{total.toLocaleString('ar-EG')} حديث</span>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4 text-xs text-blue-800">
        <span className="font-semibold">معيار علمي: </span>
        تعدد طرق الرواية المستقلة يُعدّ من أقوى مقاييس الثقة بالحديث في علم المصطلح.
        الحديث ذو الأسانيد الكثيرة يقترب من حد الحديث المتواتر معنىً، وإن كان التواتر له شروط أشمل.
      </div>

      <div className="space-y-3">
        {results.map((r, idx) => (
          <Link key={r.hadith_id} href={`/hadith/${r.hadith_id}`}
            className="block bg-white rounded-xl border border-gray-100 px-4 py-4 hover:shadow-md hover:border-green-200 transition-all group">
            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-300">{(offset + idx + 1).toLocaleString('ar-EG')}</span>
                <span className="text-xs text-green-700 font-medium">{r.book_title}</span>
                {r.takhrij_author && (
                  <span className="text-xs text-gray-400">{r.takhrij_author}</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {r.grade_hint && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${gradeClass(r.grade_hint)}`}>
                    {r.grade_hint}
                  </span>
                )}
                <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${chainColor(r.chain_count)}`}>
                  {r.chain_count} سند
                </span>
              </div>
            </div>

            <p className="text-sm text-gray-700 leading-relaxed line-clamp-2 group-hover:text-green-900">
              {stripTags(r.tarf || '').slice(0, 220) || '...'}
            </p>
          </Link>
        ))}
      </div>

      {results.length === 0 && (
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-8 text-center text-gray-500">
          لا توجد أحاديث بهذا الشرط
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
          {pg > 1 && (
            <Link href={buildUrl({ page: String(pg - 1) })}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
              السابق
            </Link>
          )}
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const start = Math.max(1, Math.min(pg - 2, totalPages - 4))
            const p = start + i
            if (p > totalPages) return null
            return (
              <Link key={p} href={buildUrl({ page: String(p) })}
                className={`px-3 py-2 rounded-lg border text-sm ${
                  p === pg ? 'bg-green-800 text-white border-green-800' : 'border-gray-200 bg-white text-green-800 hover:border-green-300'
                }`}>
                {p.toLocaleString('ar-EG')}
              </Link>
            )
          })}
          {pg < totalPages && (
            <Link href={buildUrl({ page: String(pg + 1) })}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
              التالي
            </Link>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/most-attested" className="text-green-700 hover:underline">← الأوسع انتشاراً</Link>
        <Link href="/hadiths/chain-gaps" className="text-green-700 hover:underline">← كاشف الانقطاع</Link>
        <Link href="/chains" className="text-green-700 hover:underline">← علو الإسناد</Link>
      </div>
    </div>
  )
}
