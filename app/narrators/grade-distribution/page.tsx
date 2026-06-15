import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface CenturyGrades {
  century: number
  total: number
  thiqa_count: number
  saduq_count: number
  daif_count: number
  majhul_count: number
  companion_count: number
  other_count: number
}

interface CenturyNarrator {
  id: number
  name: string
  abb_name: string | null
  grade: string | null
  death_year: string | null
  death_year_num: number | null
  is_companion: boolean
  hadith_count: number
  grade_category: string
}

export default async function GradeDistributionPage({
  searchParams,
}: {
  searchParams: Promise<{ century?: string; cat?: string; limit?: string }>
}) {
  const sp = await searchParams
  const selectedCentury = parseInt(sp.century || '0') || null
  const catFilter = sp.cat || ''
  const limit = parseInt(sp.limit || '20')

  const [centuriesRes, narratorsRes] = await Promise.all([
    pool.query<CenturyGrades>(
      `SELECT
         CEIL(n.death_year_num / 100.0)::int AS century,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE n.grade ~* 'ثقة' AND n.grade !~* 'ضعيف|مجهول')::int AS thiqa_count,
         COUNT(*) FILTER (WHERE n.grade ~* 'صدوق' AND n.grade !~* 'ثقة|ضعيف')::int AS saduq_count,
         COUNT(*) FILTER (WHERE n.grade ~* 'ضعيف')::int AS daif_count,
         COUNT(*) FILTER (WHERE n.grade ~* 'مجهول' OR (n.grade IS NULL AND NOT n.is_companion))::int AS majhul_count,
         COUNT(*) FILTER (WHERE n.is_companion)::int AS companion_count,
         COUNT(*) FILTER (WHERE n.grade IS NOT NULL AND n.grade !~* 'ثقة|صدوق|ضعيف|مجهول' AND NOT n.is_companion)::int AS other_count
       FROM narrators n
       WHERE n.death_year_num BETWEEN 1 AND 400
       GROUP BY CEIL(n.death_year_num / 100.0)::int
       ORDER BY century`,
      []
    ).catch(() => ({ rows: [] as CenturyGrades[] })),

    selectedCentury !== null ? pool.query<CenturyNarrator>(
      `SELECT
         n.id, n.name, n.abb_name, n.grade, n.death_year, n.death_year_num, n.is_companion,
         COALESCE(stats.hadith_count, 0)::int AS hadith_count,
         CASE
           WHEN n.is_companion THEN 'companion'
           WHEN n.grade ~* 'ثقة' AND n.grade !~* 'ضعيف|مجهول' THEN 'thiqa'
           WHEN n.grade ~* 'صدوق' AND n.grade !~* 'ثقة|ضعيف' THEN 'saduq'
           WHEN n.grade ~* 'ضعيف' THEN 'daif'
           WHEN n.grade ~* 'مجهول' OR (n.grade IS NULL AND NOT n.is_companion) THEN 'majhul'
           ELSE 'other'
         END AS grade_category
       FROM narrators n
       LEFT JOIN (
         SELECT ic.narrator_id_array[1] AS nid, COUNT(DISTINCT ih.hadith_id)::int AS hadith_count
         FROM isnad_chains ic JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
         GROUP BY ic.narrator_id_array[1]
       ) stats ON stats.nid = n.id
       WHERE CEIL(n.death_year_num / 100.0)::int = $1
         AND ($2 = '' OR (
           CASE
             WHEN n.is_companion THEN 'companion'
             WHEN n.grade ~* 'ثقة' AND n.grade !~* 'ضعيف|مجهول' THEN 'thiqa'
             WHEN n.grade ~* 'صدوق' AND n.grade !~* 'ثقة|ضعيف' THEN 'saduq'
             WHEN n.grade ~* 'ضعيف' THEN 'daif'
             WHEN n.grade ~* 'مجهول' OR (n.grade IS NULL AND NOT n.is_companion) THEN 'majhul'
             ELSE 'other'
           END = $2
         ))
       ORDER BY COALESCE(stats.hadith_count, 0) DESC
       LIMIT $3`,
      [selectedCentury, catFilter || '', limit]
    ).catch(() => ({ rows: [] as CenturyNarrator[] })) : Promise.resolve({ rows: [] as CenturyNarrator[] }),
  ])

  const centuries = centuriesRes.rows
  const narrators = narratorsRes.rows
  const selected = selectedCentury ? centuries.find(c => c.century === selectedCentury) : null

  const maxTotal = Math.max(...centuries.map(c => c.total), 1)

  const CAT_OPTIONS = [
    { key: '', label: 'الكل', color: 'bg-gray-700 text-white' },
    { key: 'companion', label: 'الصحابة', color: 'bg-amber-500 text-white' },
    { key: 'thiqa', label: 'ثقة', color: 'bg-green-600 text-white' },
    { key: 'saduq', label: 'صدوق', color: 'bg-blue-500 text-white' },
    { key: 'daif', label: 'ضعيف', color: 'bg-red-500 text-white' },
    { key: 'majhul', label: 'مجهول', color: 'bg-gray-500 text-white' },
  ]

  const LIMIT_OPTIONS = [10, 20, 30, 50]

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">توزيع درجات الرواة عبر القرون</h1>
        <p className="text-sm text-gray-500">
          نسب الثقات والصدوقين والضعفاء والمجاهيل في كل قرن هجري — يرصد كيف تطورت جودة رواة الحديث وبنية الإسناد عبر التاريخ
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-green-900 text-sm">توزيع الدرجات بالقرن الهجري</h2>
          <div className="flex gap-3 text-xs">
            <span className="text-amber-600">■ صحابة</span>
            <span className="text-green-600">■ ثقة</span>
            <span className="text-blue-500">■ صدوق</span>
            <span className="text-red-400">■ ضعيف</span>
            <span className="text-gray-400">■ مجهول</span>
          </div>
        </div>
        <div className="space-y-2">
          {centuries.map(c => {
            const isSelected = selectedCentury === c.century
            const barMaxW = 300
            const scale = c.total / maxTotal
            const compW = Math.round((c.companion_count / c.total) * 100)
            const thiqaW = Math.round((c.thiqa_count / c.total) * 100)
            const saduqW = Math.round((c.saduq_count / c.total) * 100)
            const daifW = Math.round((c.daif_count / c.total) * 100)
            const majhulW = Math.round((c.majhul_count / c.total) * 100)
            return (
              <a key={c.century}
                href={`/narrators/grade-distribution?century=${c.century}&limit=${limit}`}
                className={`flex items-center gap-2 group rounded-lg px-2 py-1 hover:bg-gray-50 transition-colors ${isSelected ? 'bg-green-50' : ''}`}>
                <span className={`text-xs w-8 shrink-0 ${isSelected ? 'text-green-700 font-bold' : 'text-gray-500'}`}>
                  ق{c.century}
                </span>
                <div className="flex rounded-full overflow-hidden h-4" style={{ width: `${Math.round(scale * barMaxW)}px`, minWidth: '20px' }}>
                  {compW > 0 && <div className="bg-amber-500 h-4" style={{ width: `${compW}%` }} />}
                  {thiqaW > 0 && <div className="bg-green-500 h-4" style={{ width: `${thiqaW}%` }} />}
                  {saduqW > 0 && <div className="bg-blue-400 h-4" style={{ width: `${saduqW}%` }} />}
                  {daifW > 0 && <div className="bg-red-400 h-4" style={{ width: `${daifW}%` }} />}
                  {majhulW > 0 && <div className="bg-gray-300 h-4" style={{ width: `${majhulW}%` }} />}
                </div>
                <span className={`text-xs font-medium shrink-0 ${isSelected ? 'text-green-700' : 'text-gray-500'}`}>
                  {c.total.toLocaleString('ar-EG')}
                </span>
                <div className="flex gap-2 text-xs hidden sm:flex">
                  {c.companion_count > 0 && <span className="text-amber-600">{c.companion_count}ص</span>}
                  {c.thiqa_count > 0 && <span className="text-green-600">{c.thiqa_count}ث</span>}
                  {c.daif_count > 0 && <span className="text-red-500">{c.daif_count}ض</span>}
                </div>
              </a>
            )
          })}
        </div>
      </div>

      {selectedCentury !== null && (
        <>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <h2 className="font-bold text-green-900 text-sm">
              رواة القرن {selectedCentury} الهجري
              {selected && <span className="text-gray-500 font-normal mr-1">({selected.total.toLocaleString('ar-EG')} راوٍ)</span>}
            </h2>
            <div className="flex gap-1 flex-wrap">
              {CAT_OPTIONS.map(cat => (
                <a key={cat.key}
                  href={`/narrators/grade-distribution?century=${selectedCentury}&cat=${cat.key}&limit=${limit}`}
                  className={`text-xs px-2.5 py-1 rounded-full ${catFilter === cat.key ? cat.color : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'}`}>
                  {cat.label}
                </a>
              ))}
            </div>
            <div className="flex gap-1 flex-wrap mr-auto">
              {LIMIT_OPTIONS.map(l => (
                <a key={l}
                  href={`/narrators/grade-distribution?century=${selectedCentury}&cat=${catFilter}&limit=${l}`}
                  className={`text-xs px-2 py-0.5 rounded-full border ${limit === l ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-gray-500 border-gray-200'}`}>
                  {l}
                </a>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {narrators.map((n, i) => {
              const catStyle: Record<string, string> = {
                companion: 'border-amber-200 bg-amber-50/50',
                thiqa: 'border-green-200',
                saduq: 'border-blue-100',
                daif: 'border-red-100',
                majhul: 'border-gray-100',
                other: 'border-gray-100',
              }
              const gradeStyle: Record<string, string> = {
                companion: 'text-amber-700',
                thiqa: 'text-green-700',
                saduq: 'text-blue-600',
                daif: 'text-red-500',
                majhul: 'text-gray-400',
                other: 'text-gray-500',
              }
              return (
                <Link key={n.id}
                  href={`/narrator/${n.id}`}
                  className={`bg-white rounded-xl border px-4 py-3 flex items-center gap-3 hover:shadow-sm transition-all ${catStyle[n.grade_category] || 'border-gray-100'}`}>
                  <span className="text-xs text-gray-300 w-5 shrink-0">{(i + 1).toLocaleString('ar-EG')}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-medium text-sm hover:underline ${n.is_companion ? 'text-amber-800' : 'text-green-900'}`}>
                        {n.abb_name || n.name.split(' ').slice(0, 3).join(' ')}
                      </span>
                      {n.is_companion && <span className="text-xs text-amber-600">صحابي</span>}
                    </div>
                    <div className="flex gap-2 text-xs mt-0.5">
                      {n.death_year && <span className="text-gray-400">ت {n.death_year}</span>}
                      {n.grade && <span className={gradeStyle[n.grade_category]}>{n.grade.slice(0, 12)}</span>}
                    </div>
                  </div>
                  <span className="text-xs text-green-700 font-medium shrink-0">
                    {n.hadith_count.toLocaleString('ar-EG')}
                  </span>
                </Link>
              )
            })}
          </div>

          {narrators.length === 0 && (
            <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
              لا توجد بيانات لهذا التصفية
            </div>
          )}
        </>
      )}

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators/death-decade" className="text-green-700 hover:underline">← الرواة بعقد الوفاة</Link>
        <Link href="/narrators/generations" className="text-green-700 hover:underline">← طبقات الرواة</Link>
        <Link href="/narrators/city-century" className="text-green-700 hover:underline">← المدن والقرون</Link>
      </div>
    </div>
  )
}
