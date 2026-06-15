import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface HadithJudgment {
  hadith_id: number
  say_text: string
  tarf: string | null
  book_title: string
  grade: string | null
}

interface NarratorAssessment {
  narrator_id: number
  narrator_name: string
  narrator_abb: string | null
  say_text: string
  garh_label: string | null
}

function gradeFromText(txt: string): string | null {
  if (!txt) return null
  if (/صحيح/.test(txt)) return 'صحيح'
  if (/إسناده حسن|حديث حسن|سنده حسن/.test(txt) && !/صحيح/.test(txt)) return 'حسن'
  if (/ضعيف|منكر|لا يصح|باطل|موضوع/.test(txt)) return 'ضعيف'
  return null
}

function gradeClass(g: string | null) {
  if (g === 'صحيح') return 'bg-green-100 text-green-700'
  if (g === 'حسن') return 'bg-amber-100 text-amber-700'
  if (g === 'ضعيف') return 'bg-red-100 text-red-600'
  return 'bg-gray-100 text-gray-500'
}

function garhClass(g: string | null) {
  if (!g) return 'bg-gray-100 text-gray-500'
  if (g.includes('ثق') || g.includes('صدوق') || g.includes('لا بأس')) return 'bg-green-100 text-green-700'
  if (g.includes('ضعيف') || g.includes('متروك') || g.includes('منكر')) return 'bg-red-100 text-red-600'
  return 'bg-gray-100 text-gray-600'
}

export default async function ScholarProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; page?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const scholarId = parseInt(id)
  if (isNaN(scholarId)) notFound()

  const tab = sp.tab || 'judgments'
  const pg = Math.max(1, parseInt(sp.page || '1'))
  const limit = 40
  const offset = (pg - 1) * limit

  const [scholarRes, judgementsRes, judgmentsTotalRes, assessmentsRes, statsRes] = await Promise.all([
    pool.query(
      `SELECT id, name, abb_name, death_year, tabaqa, martaba_ibn_hajar
       FROM narrators WHERE id = $1`,
      [scholarId]
    ),

    tab === 'judgments' ? pool.query<HadithJudgment>(
      `SELECT hj.hadith_id, hj.say_text,
              regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g') AS tarf,
              b.title AS book_title,
              CASE
                WHEN hj.say_text ~* 'صحيح' THEN 'صحيح'
                WHEN hj.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND hj.say_text !~* 'صحيح' THEN 'حسن'
                WHEN hj.say_text ~* 'ضعيف|منكر|لا يصح|باطل|موضوع' THEN 'ضعيف'
                ELSE NULL
              END AS grade
       FROM hadith_judgments hj
       JOIN hadith_toc ht ON ht.main_id = hj.hadith_id AND ht.is_leaf = true AND ht.is_paragraph = true
       JOIN books b ON b.id = ht.book_id
       WHERE hj.scientist_id = $1
       ORDER BY CASE WHEN hj.say_text ~* 'صحيح' THEN 1 WHEN hj.say_text ~* 'حسن' THEN 2 ELSE 3 END, hj.hadith_id
       LIMIT ${limit} OFFSET ${offset}`,
      [scholarId]
    ).catch(() => ({ rows: [] as HadithJudgment[] })) : Promise.resolve({ rows: [] as HadithJudgment[] }),

    pool.query<{ cnt: number; sahih_cnt: number; hasan_cnt: number; daif_cnt: number }>(
      `SELECT COUNT(*)::int AS cnt,
              SUM(CASE WHEN say_text ~* 'صحيح' THEN 1 ELSE 0 END)::int AS sahih_cnt,
              SUM(CASE WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح' THEN 1 ELSE 0 END)::int AS hasan_cnt,
              SUM(CASE WHEN say_text ~* 'ضعيف|منكر|لا يصح|باطل|موضوع' THEN 1 ELSE 0 END)::int AS daif_cnt
       FROM hadith_judgments WHERE scientist_id = $1`,
      [scholarId]
    ).catch(() => ({ rows: [{ cnt: 0, sahih_cnt: 0, hasan_cnt: 0, daif_cnt: 0 }] })),

    tab === 'assessments' ? pool.query<NarratorAssessment>(
      `SELECT nc.narrator_id, n.name AS narrator_name, n.abb_name AS narrator_abb,
              nc.say_text, nc.garh_label
       FROM narrator_criticism nc
       JOIN narrators n ON n.id = nc.narrator_id
       JOIN narrators sc ON sc.id = $1
       WHERE nc.scientist_name ILIKE '%' || sc.name || '%'
         AND nc.say_text IS NOT NULL AND nc.say_text != ''
       ORDER BY nc.garh_label NULLS LAST, n.name
       LIMIT ${limit} OFFSET ${offset}`,
      [scholarId]
    ).catch(() => ({ rows: [] as NarratorAssessment[] })) : Promise.resolve({ rows: [] as NarratorAssessment[] }),

    pool.query<{ assessments_cnt: number }>(
      `SELECT COUNT(*)::int AS assessments_cnt
       FROM narrator_criticism nc
       JOIN narrators sc ON sc.id = $1
       WHERE nc.scientist_name ILIKE '%' || sc.name || '%'`,
      [scholarId]
    ).catch(() => ({ rows: [{ assessments_cnt: 0 }] })),
  ])

  const scholar = scholarRes.rows[0]
  if (!scholar) notFound()

  const stats = judgmentsTotalRes.rows[0] || { cnt: 0, sahih_cnt: 0, hasan_cnt: 0, daif_cnt: 0 }
  const assessmentCount = statsRes.rows[0]?.assessments_cnt || 0
  const judgementsTotal = stats.cnt
  const judgementsPages = Math.ceil(judgementsTotal / limit)
  const assessmentsTotal = assessmentCount
  const assessmentsPages = Math.ceil(assessmentsTotal / limit)

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('tab', tab)
    p.set('page', '1')
    Object.entries(overrides).forEach(([k, v]) => p.set(k, v))
    return `/scholar/${scholarId}?${p.toString()}`
  }

  const totalPages = tab === 'judgments' ? judgementsPages : assessmentsPages

  return (
    <div dir="rtl">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4 flex-wrap">
        <Link href="/scholars" className="hover:text-green-700">المحدثون</Link>
        <span>›</span>
        <span className="text-gray-700">{scholar.abb_name || scholar.name}</span>
      </div>

      {/* Scholar header */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-green-900 mb-1">{scholar.name}</h1>
            <div className="flex items-center gap-2 flex-wrap">
              {scholar.tabaqa && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{scholar.tabaqa}</span>
              )}
              {scholar.death_year && (
                <span className="text-xs text-gray-500">ت {scholar.death_year}</span>
              )}
              {scholar.martaba_ibn_hajar && (
                <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
                  {scholar.martaba_ibn_hajar}
                </span>
              )}
            </div>
          </div>
          <Link href={`/narrator/${scholarId}`}
            className="text-xs text-green-700 bg-green-50 border border-green-100 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors shrink-0">
            صفحة الراوي ←
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div className="bg-green-50 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-green-800">{stats.cnt.toLocaleString('ar-EG')}</div>
            <div className="text-xs text-gray-500">حكم على حديث</div>
          </div>
          <div className="bg-green-100 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-green-700">{stats.sahih_cnt.toLocaleString('ar-EG')}</div>
            <div className="text-xs text-gray-500">صحيح</div>
          </div>
          <div className="bg-amber-100 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-amber-700">{stats.hasan_cnt.toLocaleString('ar-EG')}</div>
            <div className="text-xs text-gray-500">حسن</div>
          </div>
          <div className="bg-red-50 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-red-600">{stats.daif_cnt.toLocaleString('ar-EG')}</div>
            <div className="text-xs text-gray-500">ضعيف</div>
          </div>
        </div>
      </div>

      {/* Tab selector */}
      <div className="flex items-center gap-2 mb-4">
        <Link href={buildUrl({ tab: 'judgments' })}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            tab === 'judgments' ? 'bg-green-800 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-green-300'
          }`}>
          أحكامه على الأحاديث ({stats.cnt.toLocaleString('ar-EG')})
        </Link>
        <Link href={buildUrl({ tab: 'assessments' })}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            tab === 'assessments' ? 'bg-green-800 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-green-300'
          }`}>
          تقييماته للرواة ({assessmentCount.toLocaleString('ar-EG')})
        </Link>
      </div>

      {/* Judgments tab */}
      {tab === 'judgments' && (
        <div className="space-y-3">
          {judgementsRes.rows.map(j => (
            <Link key={j.hadith_id} href={`/hadith/${j.hadith_id}`}
              className="block bg-white rounded-xl border border-gray-100 px-4 py-4 hover:border-green-200 hover:shadow-sm transition-all group">
              <div className="flex items-start justify-between mb-2 gap-2 flex-wrap">
                <span className="text-xs text-green-700 font-medium">{j.book_title}</span>
                {j.grade && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${gradeClass(j.grade)}`}>
                    {j.grade}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-700 line-clamp-2 mb-2 group-hover:text-green-900">
                {(j.tarf || '').slice(0, 200) || '...'}
              </p>
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2 line-clamp-2">
                {j.say_text?.slice(0, 180)}
              </p>
            </Link>
          ))}
          {judgementsRes.rows.length === 0 && (
            <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">لا توجد أحكام مسجَّلة</div>
          )}
        </div>
      )}

      {/* Assessments tab */}
      {tab === 'assessments' && (
        <div className="space-y-2">
          {assessmentsRes.rows.map((a, idx) => (
            <div key={`${a.narrator_id}-${idx}`}
              className="bg-white rounded-xl border border-gray-100 px-4 py-3 hover:border-green-200 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between gap-2 mb-1 flex-wrap">
                <Link href={`/narrator/${a.narrator_id}`}
                  className="font-semibold text-sm text-green-900 hover:underline">
                  {a.narrator_abb || a.narrator_name}
                </Link>
                {a.garh_label && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${garhClass(a.garh_label)}`}>
                    {a.garh_label}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-600 line-clamp-2">{a.say_text}</p>
            </div>
          ))}
          {assessmentsRes.rows.length === 0 && (
            <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">لا توجد تقييمات مسجَّلة</div>
          )}
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

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/scholars" className="text-green-700 hover:underline">← المحدثون</Link>
        <Link href="/scholars/activity" className="text-green-700 hover:underline">← نشاط المحدثين</Link>
        <Link href={`/narrator/${scholarId}/criticism-history`} className="text-green-700 hover:underline">
          ← تاريخ الأحكام عليه
        </Link>
      </div>
    </div>
  )
}
