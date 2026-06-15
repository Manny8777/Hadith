import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface ScholarEra {
  scholar_name: string
  estimated_century: number
  total_judgments: number
  sahih_count: number
  hasan_count: number
  daif_count: number
  mawdu_count: number
  sahih_pct: number
  daif_pct: number
  unique_phrases: number
}

interface EraStats {
  century: number
  scholar_count: number
  total_judgments: number
  avg_sahih_pct: number
  avg_daif_pct: number
}

export default async function EarlyVsLatePage({
  searchParams,
}: {
  searchParams: Promise<{ century?: string; sort?: string }>
}) {
  const sp = await searchParams
  const selectedCentury = parseInt(sp.century || '0') || null
  const sortBy = sp.sort || 'total'

  const orderSql = sortBy === 'sahih' ? 'sahih_pct DESC'
    : sortBy === 'daif' ? 'daif_pct DESC'
    : 'total_judgments DESC'

  const [eraRes, scholarsRes] = await Promise.all([
    pool.query<EraStats>(
      `SELECT
         century,
         COUNT(DISTINCT scholar_id)::int AS scholar_count,
         SUM(total_judgments)::int AS total_judgments,
         ROUND(AVG(sahih_pct))::int AS avg_sahih_pct,
         ROUND(AVG(daif_pct))::int AS avg_daif_pct
       FROM (
         SELECT
           hj.scientist_id AS scholar_id,
           n.name AS scholar_name,
           COALESCE(
             CEIL(n.death_year_num / 100.0)::int,
             CASE
               WHEN n.name ~* 'بخاري|مسلم|ترمذي|أبو داود|ابن ماجه|نسائي' THEN 3
               WHEN n.name ~* 'ابن حنبل|يحيى|شافعي|مالك' THEN 2
               WHEN n.name ~* 'الحاكم|الدارقطني|بيهقي|ابن حبان' THEN 4
               ELSE 3
             END
           ) AS century,
           COUNT(*)::int AS total_judgments,
           COUNT(*) FILTER (WHERE hj.say_text ~* 'صحيح')::int AS sahih_count,
           COUNT(*) FILTER (WHERE hj.say_text ~* 'ضعيف')::int AS daif_count,
           ROUND(100.0 * COUNT(*) FILTER (WHERE hj.say_text ~* 'صحيح') / NULLIF(COUNT(*), 0))::int AS sahih_pct,
           ROUND(100.0 * COUNT(*) FILTER (WHERE hj.say_text ~* 'ضعيف') / NULLIF(COUNT(*), 0))::int AS daif_pct
         FROM hadith_judgments hj
         JOIN narrators n ON n.id = hj.scientist_id AND NOT n.is_companion
         GROUP BY hj.scientist_id, n.name, COALESCE(
           CEIL(n.death_year_num / 100.0)::int,
           CASE
             WHEN n.name ~* 'بخاري|مسلم|ترمذي|أبو داود|ابن ماجه|نسائي' THEN 3
             WHEN n.name ~* 'ابن حنبل|يحيى|شافعي|مالك' THEN 2
             WHEN n.name ~* 'الحاكم|الدارقطني|بيهقي|ابن حبان' THEN 4
             ELSE 3
           END
         )
         HAVING COUNT(*) >= 10
       ) sub
       WHERE century BETWEEN 1 AND 6
       GROUP BY century
       ORDER BY century`,
      []
    ).catch(() => ({ rows: [] as EraStats[] })),

    pool.query<ScholarEra>(
      `SELECT
         n.name AS scholar_name,
         COALESCE(
           CEIL(n.death_year_num / 100.0)::int,
           CASE
             WHEN n.name ~* 'بخاري|مسلم|ترمذي|أبو داود|ابن ماجه|نسائي' THEN 3
             WHEN n.name ~* 'ابن حنبل|يحيى|شافعي|مالك' THEN 2
             WHEN n.name ~* 'الحاكم|الدارقطني|بيهقي|ابن حبان' THEN 4
             ELSE 3
           END
         ) AS estimated_century,
         COUNT(*)::int AS total_judgments,
         COUNT(*) FILTER (WHERE hj.say_text ~* 'صحيح')::int AS sahih_count,
         COUNT(*) FILTER (WHERE hj.say_text ~* 'حسن' AND hj.say_text !~* 'صحيح')::int AS hasan_count,
         COUNT(*) FILTER (WHERE hj.say_text ~* 'ضعيف')::int AS daif_count,
         COUNT(*) FILTER (WHERE hj.say_text ~* 'موضوع|باطل|مكذوب')::int AS mawdu_count,
         ROUND(100.0 * COUNT(*) FILTER (WHERE hj.say_text ~* 'صحيح') / NULLIF(COUNT(*), 0))::int AS sahih_pct,
         ROUND(100.0 * COUNT(*) FILTER (WHERE hj.say_text ~* 'ضعيف') / NULLIF(COUNT(*), 0))::int AS daif_pct,
         COUNT(DISTINCT hj.say_text)::int AS unique_phrases
       FROM hadith_judgments hj
       JOIN narrators n ON n.id = hj.scientist_id AND NOT n.is_companion
       WHERE ($1::int IS NULL OR COALESCE(
         CEIL(n.death_year_num / 100.0)::int,
         CASE
           WHEN n.name ~* 'بخاري|مسلم|ترمذي|أبو داود|ابن ماجه|نسائي' THEN 3
           WHEN n.name ~* 'ابن حنبل|يحيى|شافعي|مالك' THEN 2
           WHEN n.name ~* 'الحاكم|الدارقطني|بيهقي|ابن حبان' THEN 4
           ELSE 3
         END
       ) = $1)
       GROUP BY hj.scientist_id, n.name, COALESCE(
         CEIL(n.death_year_num / 100.0)::int,
         CASE
           WHEN n.name ~* 'بخاري|مسلم|ترمذي|أبو داود|ابن ماجه|نسائي' THEN 3
           WHEN n.name ~* 'ابن حنبل|يحيى|شافعي|مالك' THEN 2
           WHEN n.name ~* 'الحاكم|الدارقطني|بيهقي|ابن حبان' THEN 4
           ELSE 3
         END
       )
       HAVING COUNT(*) >= 10
       ORDER BY ${orderSql}
       LIMIT 50`,
      [selectedCentury || null]
    ).catch(() => ({ rows: [] as ScholarEra[] })),
  ])

  const eras = eraRes.rows
  const scholars = scholarsRes.rows

  const maxJudgments = Math.max(...eras.map(e => e.total_judgments), 1)

  const CENTURY_LABELS: Record<number, string> = {
    1: 'القرن الأول (1-100 هـ)',
    2: 'القرن الثاني (101-200 هـ)',
    3: 'القرن الثالث (201-300 هـ)',
    4: 'القرن الرابع (301-400 هـ)',
    5: 'القرن الخامس (401-500 هـ)',
    6: 'القرن السادس (501-600 هـ)',
  }

  const SORT_OPTIONS = [
    { key: 'total', label: 'بعدد الأحكام' },
    { key: 'sahih', label: 'أكثر تصحيحاً' },
    { key: 'daif', label: 'أكثر تضعيفاً' },
  ]

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">منهج العلماء في التصحيح والتضعيف عبر القرون</h1>
        <p className="text-sm text-gray-500">
          هل كان علماء القرن الثالث أكثر تشدداً من علماء القرن الرابع؟ — مقارنة منهجية بين أجيال علماء الحديث في التصحيح والتضعيف
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
        <h2 className="font-bold text-green-900 text-sm mb-3">توجهات كل قرن — متوسط نسب التصحيح والتضعيف</h2>
        <div className="space-y-3">
          {eras.map(era => {
            const isSelected = selectedCentury === era.century
            const barW = Math.round((era.total_judgments / maxJudgments) * 100)
            return (
              <a key={era.century}
                href={`/scholars/early-vs-late?century=${era.century}&sort=${sortBy}`}
                className={`flex items-start gap-3 group hover:bg-gray-50 rounded-lg px-2 py-2 transition-colors ${isSelected ? 'bg-green-50' : ''}`}>
                <span className={`text-xs w-40 shrink-0 pt-0.5 ${isSelected ? 'text-green-700 font-medium' : 'text-gray-500'}`}>
                  {CENTURY_LABELS[era.century] || `ق${era.century}`}
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 bg-gray-100 rounded-full h-3 max-w-48">
                      <div className={`h-3 rounded-full transition-all ${isSelected ? 'bg-green-500' : 'bg-indigo-300 group-hover:bg-indigo-400'}`}
                        style={{ width: `${barW}%` }} />
                    </div>
                    <span className="text-xs text-gray-500">{era.total_judgments.toLocaleString('ar-EG')} حكم</span>
                    <span className="text-xs text-gray-400">{era.scholar_count} عالم</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <div className="w-16 bg-gray-100 rounded-full h-2">
                        <div className="bg-green-400 h-2 rounded-full" style={{ width: `${Math.min(era.avg_sahih_pct || 0, 100)}%` }} />
                      </div>
                      <span className="text-xs text-green-600">{era.avg_sahih_pct}%ص</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-16 bg-gray-100 rounded-full h-2">
                        <div className="bg-red-400 h-2 rounded-full" style={{ width: `${Math.min(era.avg_daif_pct || 0, 100)}%` }} />
                      </div>
                      <span className="text-xs text-red-500">{era.avg_daif_pct}%ض</span>
                    </div>
                  </div>
                </div>
              </a>
            )
          })}
        </div>
        {selectedCentury && (
          <div className="mt-2">
            <a href={`/scholars/early-vs-late?sort=${sortBy}`} className="text-xs text-red-500 hover:underline">× مسح الفلتر</a>
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {SORT_OPTIONS.map(s => (
          <a key={s.key}
            href={`/scholars/early-vs-late?sort=${s.key}${selectedCentury ? `&century=${selectedCentury}` : ''}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${sortBy === s.key ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
            {s.label}
          </a>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="bg-green-50 px-4 py-2 border-b border-green-100 text-xs text-green-800 font-medium">
          العلماء {selectedCentury ? `— ${CENTURY_LABELS[selectedCentury] || `ق${selectedCentury}`}` : '— جميع القرون'}
        </div>
        <div className="divide-y divide-gray-50 max-h-[60vh] overflow-y-auto">
          {scholars.map((sc, i) => {
            const total = sc.sahih_count + sc.hasan_count + sc.daif_count + sc.mawdu_count
            const sahihW = total > 0 ? Math.round((sc.sahih_count / sc.total_judgments) * 100) : 0
            const hasanW = total > 0 ? Math.round((sc.hasan_count / sc.total_judgments) * 100) : 0
            const daifW = total > 0 ? Math.round((sc.daif_count / sc.total_judgments) * 100) : 0
            const mawduW = total > 0 ? Math.round((sc.mawdu_count / sc.total_judgments) * 100) : 0
            return (
              <div key={i} className="px-4 py-3 flex items-start gap-3">
                <span className="text-xs text-gray-300 w-5 shrink-0 mt-0.5">{(i + 1).toLocaleString('ar-EG')}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-medium text-gray-800">{sc.scholar_name}</span>
                    <span className="text-xs text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full">
                      ق{sc.estimated_century}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="flex rounded-full overflow-hidden h-2 w-32">
                      {sahihW > 0 && <div className="bg-green-500 h-2" style={{ width: `${sahihW}%` }} />}
                      {hasanW > 0 && <div className="bg-blue-400 h-2" style={{ width: `${hasanW}%` }} />}
                      {daifW > 0 && <div className="bg-red-400 h-2" style={{ width: `${daifW}%` }} />}
                      {mawduW > 0 && <div className="bg-gray-700 h-2" style={{ width: `${mawduW}%` }} />}
                    </div>
                    <span className="text-xs text-green-600">{sc.sahih_pct}%ص</span>
                    <span className="text-xs text-red-500">{sc.daif_pct}%ض</span>
                    <span className="text-xs text-gray-400">({sc.total_judgments})</span>
                  </div>
                </div>
                <Link href={`/scholars/judgment-phrases?scholar=${encodeURIComponent(sc.scholar_name)}`}
                  className="text-xs text-green-700 hover:underline shrink-0">صيغه ←</Link>
              </div>
            )
          })}
          {scholars.length === 0 && (
            <div className="p-8 text-center text-sm text-gray-400">لا توجد بيانات</div>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/scholars/judgment-phrases" className="text-green-700 hover:underline">← معجم الأحكام</Link>
        <Link href="/hadiths/grade-evolution" className="text-green-700 hover:underline">← تطور التصحيح</Link>
        <Link href="/hadiths/divergent-judgments" className="text-green-700 hover:underline">← اختلاف العلماء</Link>
      </div>
    </div>
  )
}
