import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface CenturyStats {
  century: number
  total_judgments: number
  sahih_count: number
  hasan_count: number
  daif_count: number
  mawdu_count: number
  other_count: number
}

interface ScholarCentury {
  scholar_name: string
  judgment_count: number
  sahih_pct: number
  daif_pct: number
}

export default async function GradeEvolutionPage({
  searchParams,
}: {
  searchParams: Promise<{ century?: string }>
}) {
  const sp = await searchParams
  const selectedCentury = parseInt(sp.century || '0') || null

  const [centuryStatsRes, scholarsRes, topHadithsRes] = await Promise.all([
    pool.query<CenturyStats>(
      `SELECT
         CEIL(n.death_year_num / 100.0)::int AS century,
         COUNT(hj.hadith_id)::int AS total_judgments,
         COUNT(hj.hadith_id) FILTER (WHERE hj.say_text ~* '^صحيح|إسناده صحيح|رجاله ثقات')::int AS sahih_count,
         COUNT(hj.hadith_id) FILTER (WHERE hj.say_text ~* '^حسن|إسناده حسن')::int AS hasan_count,
         COUNT(hj.hadith_id) FILTER (WHERE hj.say_text ~* '^ضعيف|إسناده ضعيف|فيه ضعف')::int AS daif_count,
         COUNT(hj.hadith_id) FILTER (WHERE hj.say_text ~* 'موضوع|كذب|وضع')::int AS mawdu_count,
         COUNT(hj.hadith_id) FILTER (WHERE hj.say_text !~* '^صحيح|إسناده صحيح|رجاله ثقات|^حسن|إسناده حسن|^ضعيف|إسناده ضعيف|فيه ضعف|موضوع|كذب|وضع')::int AS other_count
       FROM hadith_judgments hj
       JOIN narrators n ON n.id = hj.scientist_id
       WHERE n.death_year_num IS NOT NULL
         AND n.death_year_num BETWEEN 1 AND 600
         AND hj.scientist_id IS NOT NULL
       GROUP BY CEIL(n.death_year_num / 100.0)::int
       ORDER BY century`
    ).catch(() => ({ rows: [] as CenturyStats[] })),

    pool.query<ScholarCentury>(
      `SELECT
         n.name AS scholar_name,
         COUNT(hj.hadith_id)::int AS judgment_count,
         ROUND(COUNT(hj.hadith_id) FILTER (WHERE hj.say_text ~* '^صحيح|إسناده صحيح|رجاله ثقات') * 100.0
               / NULLIF(COUNT(hj.hadith_id), 0), 1)::float AS sahih_pct,
         ROUND(COUNT(hj.hadith_id) FILTER (WHERE hj.say_text ~* '^ضعيف|إسناده ضعيف|فيه ضعف') * 100.0
               / NULLIF(COUNT(hj.hadith_id), 0), 1)::float AS daif_pct
       FROM hadith_judgments hj
       JOIN narrators n ON n.id = hj.scientist_id
       WHERE hj.scientist_id IS NOT NULL
       GROUP BY hj.scientist_id, n.name
       HAVING COUNT(hj.hadith_id) >= 50
       ORDER BY COUNT(hj.hadith_id) DESC
       LIMIT 20`,
      []
    ).catch(() => ({ rows: [] as ScholarCentury[] })),

    selectedCentury ? pool.query<{ id: number; text: string; judgment_text: string; scholar_name: string }>(
      `SELECT ht.main_id AS id, LEFT(ht.tarf, 200) AS text, hj.say_text AS judgment_text, n.name AS scholar_name
       FROM hadith_judgments hj
       JOIN hadith_toc ht ON ht.main_id = hj.hadith_id
       JOIN narrators n ON n.id = hj.scientist_id
       WHERE CEIL(n.death_year_num / 100.0)::int = $1
         AND n.death_year_num IS NOT NULL
         AND n.death_year_num BETWEEN 1 AND 600
       ORDER BY hj.hadith_id
       LIMIT 20`,
      [selectedCentury]
    ).catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] }),
  ])

  const centuryStats = centuryStatsRes.rows
  const scholars = scholarsRes.rows
  const topHadiths = topHadithsRes.rows
  const maxJudgments = Math.max(...centuryStats.map(c => c.total_judgments), 1)

  function centuryLabel(c: number) {
    const labels: Record<number, string> = { 1: 'القرن الأول', 2: 'القرن الثاني', 3: 'القرن الثالث', 4: 'القرن الرابع', 5: 'القرن الخامس', 6: 'القرن السادس' }
    return labels[c] || `القرن ${c}`
  }

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">تطور أحكام علماء الحديث عبر القرون</h1>
        <p className="text-sm text-gray-500">
          توزيع أحكام التصحيح والتضعيف حسب القرن الهجري للعالم المُصحِّح أو المُضعِّف — يكشف تطور منهج النقد الحديثي
        </p>
      </div>

      {centuryStats.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
          <h2 className="font-bold text-green-900 text-sm mb-4">الأحكام الحديثية بحسب قرن العالم</h2>
          <div className="space-y-3">
            {centuryStats.map(cs => {
              const sahihPct = cs.total_judgments ? Math.round(cs.sahih_count * 100 / cs.total_judgments) : 0
              const hasanPct = cs.total_judgments ? Math.round(cs.hasan_count * 100 / cs.total_judgments) : 0
              const daifPct = cs.total_judgments ? Math.round(cs.daif_count * 100 / cs.total_judgments) : 0
              const mawduPct = cs.total_judgments ? Math.round(cs.mawdu_count * 100 / cs.total_judgments) : 0

              return (
                <div key={cs.century}>
                  <div className="flex items-center gap-2 mb-1">
                    <a href={`/hadiths/grade-evolution?century=${cs.century}`}
                      className={`text-sm font-medium hover:underline w-28 shrink-0 ${selectedCentury === cs.century ? 'text-green-700' : 'text-gray-700'}`}>
                      {centuryLabel(cs.century)}
                    </a>
                    <div className="flex-1 flex gap-0.5 h-5 rounded overflow-hidden">
                      <div className="bg-green-500 h-full" style={{ width: `${(cs.sahih_count / maxJudgments) * 100}%` }} title={`صحيح: ${cs.sahih_count}`} />
                      <div className="bg-blue-400 h-full" style={{ width: `${(cs.hasan_count / maxJudgments) * 100}%` }} title={`حسن: ${cs.hasan_count}`} />
                      <div className="bg-red-400 h-full" style={{ width: `${(cs.daif_count / maxJudgments) * 100}%` }} title={`ضعيف: ${cs.daif_count}`} />
                      <div className="bg-gray-700 h-full" style={{ width: `${(cs.mawdu_count / maxJudgments) * 100}%` }} title={`موضوع: ${cs.mawdu_count}`} />
                      <div className="bg-gray-200 h-full" style={{ width: `${(cs.other_count / maxJudgments) * 100}%` }} title={`أخرى: ${cs.other_count}`} />
                    </div>
                    <span className="text-xs text-gray-400 shrink-0 w-20 text-left">
                      {cs.total_judgments.toLocaleString('ar-EG')} حكم
                    </span>
                  </div>
                  <div className="flex gap-3 text-xs text-gray-500 mr-28">
                    <span className="text-green-600">صحيح {sahihPct}%</span>
                    <span className="text-blue-500">حسن {hasanPct}%</span>
                    <span className="text-red-500">ضعيف {daifPct}%</span>
                    {mawduPct > 0 && <span className="text-gray-700">موضوع {mawduPct}%</span>}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex gap-4 text-xs flex-wrap">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" /> صحيح</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-400 inline-block" /> حسن</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-400 inline-block" /> ضعيف</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gray-700 inline-block" /> موضوع</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gray-200 inline-block" /> أخرى</span>
          </div>
        </div>
      )}

      {centuryStats.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400 mb-5">
          لا توجد بيانات كافية مرتبطة بتاريخ وفاة العلماء
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h2 className="font-bold text-green-900 text-sm mb-3">أنشط علماء الحكم على الأحاديث</h2>
          <div className="space-y-2">
            {scholars.map((s, i) => (
              <div key={s.scholar_name} className="flex items-center gap-2">
                <span className="text-xs text-gray-300 w-5 shrink-0">{(i + 1).toLocaleString('ar-EG')}</span>
                <span className="text-sm font-medium text-green-900 flex-1">{s.scholar_name}</span>
                <span className="text-xs text-green-600">{s.sahih_pct}% صحيح</span>
                <span className="text-xs text-red-500">{s.daif_pct}% ضعيف</span>
                <span className="text-xs text-gray-400 shrink-0">{s.judgment_count.toLocaleString('ar-EG')}</span>
              </div>
            ))}
          </div>
        </div>

        {selectedCentury && topHadiths.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h2 className="font-bold text-green-900 text-sm mb-3">
              نماذج أحاديث مُحكَم عليها في {centuryLabel(selectedCentury)}
            </h2>
            <div className="space-y-2">
              {topHadiths.map(h => (
                <div key={h.id} className="border-b border-gray-50 pb-2">
                  <div className="text-xs text-gray-400 mb-0.5">{h.scholar_name}: {h.judgment_text?.slice(0, 40)}</div>
                  <Link href={`/hadith/${h.id}`} className="text-xs text-gray-700 hover:text-green-700 leading-relaxed">
                    {h.text.slice(0, 100)}...
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/scholars" className="text-green-700 hover:underline">← أحكام المحدثين</Link>
        <Link href="/scholars/activity" className="text-green-700 hover:underline">← نشاط العلماء</Link>
        <Link href="/hadiths/grade-dispute" className="text-green-700 hover:underline">← الخلاف في الدرجة</Link>
      </div>
    </div>
  )
}
