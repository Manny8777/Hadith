import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface ScholarStats {
  scholar_name: string
  total: number
  sahih_count: number
  hasan_count: number
  daif_count: number
  mawdu_count: number
  avg_chain_length: number | null
  long_chain_accepted: number
  short_chain_accepted: number
  sahih_pct: number
  daif_pct: number
}

interface GradeDistrib {
  scholar_name: string
  grade_type: string
  judgment_text: string
  count: number
}

export default async function IsnadCriteriaPage({
  searchParams,
}: {
  searchParams: Promise<{ scholar?: string }>
}) {
  const sp = await searchParams
  const selectedScholar = sp.scholar || ''

  const [scholarsRes, distributionRes] = await Promise.all([
    pool.query<ScholarStats>(
      `SELECT
         n.name AS scholar_name,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE hj.say_text ~* '^صحيح|إسناده صحيح|رجاله ثقات|على شرط')::int AS sahih_count,
         COUNT(*) FILTER (WHERE hj.say_text ~* '^حسن|إسناده حسن|حسن لغيره')::int AS hasan_count,
         COUNT(*) FILTER (WHERE hj.say_text ~* '^ضعيف|إسناده ضعيف|فيه ضعف|فيه مقال')::int AS daif_count,
         COUNT(*) FILTER (WHERE hj.say_text ~* 'موضوع|كذب|وضاع|منكر جداً')::int AS mawdu_count,
         ROUND(AVG(array_length(ic.narrator_id_array, 1)), 1)::float AS avg_chain_length,
         COUNT(*) FILTER (
           WHERE hj.say_text ~* '^صحيح|إسناده صحيح'
           AND array_length(ic.narrator_id_array, 1) >= 6
         )::int AS long_chain_accepted,
         COUNT(*) FILTER (
           WHERE hj.say_text ~* '^صحيح|إسناده صحيح'
           AND array_length(ic.narrator_id_array, 1) <= 4
         )::int AS short_chain_accepted,
         ROUND(COUNT(*) FILTER (WHERE hj.say_text ~* '^صحيح|إسناده صحيح|رجاله ثقات') * 100.0 / NULLIF(COUNT(*), 0), 1)::float AS sahih_pct,
         ROUND(COUNT(*) FILTER (WHERE hj.say_text ~* '^ضعيف|إسناده ضعيف|فيه ضعف') * 100.0 / NULLIF(COUNT(*), 0), 1)::float AS daif_pct
       FROM hadith_judgments hj
       JOIN narrators n ON n.id = hj.scientist_id
       LEFT JOIN isnad_hadiths ih ON ih.hadith_id = hj.hadith_id
       LEFT JOIN isnad_chains ic ON ic.id = ih.isnad_id
       GROUP BY hj.scientist_id, n.name
       HAVING COUNT(*) >= 30
       ORDER BY COUNT(*) DESC
       LIMIT 25`,
      []
    ).catch(() => ({ rows: [] as ScholarStats[] })),

    selectedScholar ? pool.query<GradeDistrib>(
      `SELECT
         n.name AS scholar_name,
         CASE
           WHEN hj.say_text ~* '^صحيح' THEN 'صحيح'
           WHEN hj.say_text ~* 'إسناده صحيح|رجاله ثقات' THEN 'إسناده صحيح'
           WHEN hj.say_text ~* 'على شرط' THEN 'على شرط الشيخين'
           WHEN hj.say_text ~* '^حسن|إسناده حسن' THEN 'حسن'
           WHEN hj.say_text ~* 'حسن لغيره' THEN 'حسن لغيره'
           WHEN hj.say_text ~* '^ضعيف|إسناده ضعيف' THEN 'ضعيف'
           WHEN hj.say_text ~* 'فيه ضعف|فيه مقال' THEN 'فيه ضعف'
           WHEN hj.say_text ~* 'موضوع|كذب' THEN 'موضوع'
           ELSE 'أخرى'
         END AS grade_type,
         LEFT(hj.say_text, 60) AS judgment_text,
         COUNT(*)::int AS count
       FROM hadith_judgments hj
       JOIN narrators n ON n.id = hj.scientist_id
       WHERE n.name = $1
       GROUP BY hj.scientist_id, n.name, 3, LEFT(hj.say_text, 60)
       ORDER BY COUNT(*) DESC
       LIMIT 20`,
      [selectedScholar]
    ).catch(() => ({ rows: [] as GradeDistrib[] })) : Promise.resolve({ rows: [] as GradeDistrib[] }),
  ])

  const scholars = scholarsRes.rows
  const distribution = distributionRes.rows
  const selected = selectedScholar ? scholars.find(s => s.scholar_name === selectedScholar) : null

  const gradeTypeColors: Record<string, string> = {
    'صحيح': 'bg-green-100 text-green-800 border-green-200',
    'إسناده صحيح': 'bg-green-50 text-green-700 border-green-100',
    'على شرط الشيخين': 'bg-emerald-50 text-emerald-700 border-emerald-100',
    'حسن': 'bg-blue-50 text-blue-700 border-blue-100',
    'حسن لغيره': 'bg-sky-50 text-sky-700 border-sky-100',
    'ضعيف': 'bg-red-50 text-red-700 border-red-100',
    'فيه ضعف': 'bg-orange-50 text-orange-700 border-orange-100',
    'موضوع': 'bg-gray-100 text-gray-800 border-gray-200',
    'أخرى': 'bg-gray-50 text-gray-600 border-gray-100',
  }

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">معايير قبول الإسناد عند كل عالم</h1>
        <p className="text-sm text-gray-500">
          تحليل أحكام كل محدث لاستنباط منهجه في قبول الأسانيد — نسبة التصحيح والتضعيف ومتوسط طول الأسانيد التي قبلها
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-5">
        <div className="bg-green-50 px-4 py-2 border-b border-gray-100 text-xs text-green-800 font-medium">
          العلماء — مرتَّبون بعدد أحكامهم — اضغط للتفاصيل
        </div>
        <div className="divide-y divide-gray-50">
          {scholars.map(s => (
            <a key={s.scholar_name}
              href={`/scholars/isnad-criteria?scholar=${encodeURIComponent(s.scholar_name)}`}
              className={`px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${selectedScholar === s.scholar_name ? 'bg-green-50' : ''}`}>
              <div className="w-32 shrink-0">
                <div className={`text-sm font-medium hover:underline ${selectedScholar === s.scholar_name ? 'text-green-900' : 'text-gray-700'}`}>
                  {s.scholar_name}
                </div>
                <div className="text-xs text-gray-400">{s.total.toLocaleString('ar-EG')} حكم</div>
              </div>
              <div className="flex-1 flex gap-0.5 h-4 rounded overflow-hidden max-w-48">
                <div className="bg-green-500 h-full" style={{ width: `${s.sahih_pct}%` }} title={`صحيح ${s.sahih_pct}%`} />
                <div className="bg-blue-400 h-full" style={{ width: `${s.total ? Math.round(s.hasan_count * 100 / s.total) : 0}%` }} />
                <div className="bg-red-400 h-full" style={{ width: `${s.daif_pct}%` }} />
                <div className="bg-gray-600 h-full" style={{ width: `${s.total ? Math.round(s.mawdu_count * 100 / s.total) : 0}%` }} />
              </div>
              <div className="text-xs flex gap-3 shrink-0">
                <span className="text-green-600">{s.sahih_pct}%ص</span>
                <span className="text-red-500">{s.daif_pct}%ض</span>
                {s.avg_chain_length && <span className="text-gray-400">ط̄={s.avg_chain_length}</span>}
              </div>
            </a>
          ))}
        </div>
      </div>

      {selected && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
          <h2 className="font-bold text-green-900 mb-3">{selected.scholar_name} — تفصيل الأحكام</h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center mb-4">
            <div className="bg-green-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-green-700">{selected.sahih_count.toLocaleString('ar-EG')}</div>
              <div className="text-xs text-gray-500">صحَّح ({selected.sahih_pct}%)</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-blue-700">{selected.hasan_count.toLocaleString('ar-EG')}</div>
              <div className="text-xs text-gray-500">حسَّن ({selected.total ? Math.round(selected.hasan_count * 100 / selected.total) : 0}%)</div>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-red-700">{selected.daif_count.toLocaleString('ar-EG')}</div>
              <div className="text-xs text-gray-500">ضعَّف ({selected.daif_pct}%)</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-gray-700">{selected.mawdu_count.toLocaleString('ar-EG')}</div>
              <div className="text-xs text-gray-500">موضوع</div>
            </div>
          </div>

          {selected.avg_chain_length && (
            <div className="bg-indigo-50 rounded-lg p-3 mb-4 text-sm">
              <span className="font-medium text-indigo-900">متوسط طول الأسانيد عنده: </span>
              <span className="text-indigo-700 font-bold">{selected.avg_chain_length} راوٍ</span>
              {selected.long_chain_accepted > 0 && (
                <span className="text-xs text-indigo-500 mr-3">صحَّح {selected.long_chain_accepted} سنداً بـ6+ حلقات</span>
              )}
              {selected.short_chain_accepted > 0 && (
                <span className="text-xs text-indigo-500 mr-3">صحَّح {selected.short_chain_accepted} سنداً بـ4 حلقات أو أقل</span>
              )}
            </div>
          )}

          <h3 className="text-sm font-bold text-green-900 mb-2">توزيع صيغ الأحكام الأكثر تكراراً:</h3>
          <div className="space-y-2">
            {distribution.map(d => (
              <div key={d.judgment_text} className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${gradeTypeColors[d.grade_type] || 'bg-gray-50 text-gray-600 border-gray-100'}`}>
                  {d.grade_type}
                </span>
                <span className="text-xs text-gray-600 flex-1 line-clamp-1">{d.judgment_text}</span>
                <span className="text-xs font-medium text-gray-700 shrink-0">{d.count.toLocaleString('ar-EG')}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-3 text-sm">
            <Link href={`/scholars/hadith-grades?scholar=${encodeURIComponent(selected.scholar_name)}`}
              className="text-green-700 hover:underline">
              ← عرض أحاديث {selected.scholar_name}
            </Link>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/scholars" className="text-green-700 hover:underline">← أحكام المحدثين</Link>
        <Link href="/scholars/compare" className="text-green-700 hover:underline">← مقارنة المحدثين</Link>
        <Link href="/scholars/activity" className="text-green-700 hover:underline">← نشاط العلماء</Link>
        <Link href="/hadiths/grade-dispute" className="text-green-700 hover:underline">← الخلاف في الدرجة</Link>
      </div>
    </div>
  )
}
