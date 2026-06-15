export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'

interface Companion {
  id: number
  name: string
  abb_name: string | null
  kunia: string | null
  tabaqa: string | null
  death_year_num: number | null
  death_city: string | null
  hadiths_count: number | null
  living_city: string | null
}

interface GradeStat { grade_class: string; cnt: number }

export default async function CompanionsPage() {
  const [companionsRes, gradeStatsRes, totalRes] = await Promise.all([
    pool.query<Companion>(
      `SELECT id, name, abb_name, kunia, tabaqa, death_year_num, death_city, hadiths_count, living_city
       FROM narrators
       WHERE is_companion = true
         AND (hadiths_count IS NULL OR hadiths_count >= 0)
       ORDER BY COALESCE(hadiths_count, 0) DESC NULLS LAST, name
       LIMIT 300`
    ),
    pool.query<GradeStat>(
      `SELECT grade_class, COUNT(DISTINCT hadith_id)::int AS cnt
       FROM (
         SELECT hadith_id,
           CASE
             WHEN say_text ~* 'صحيح' THEN 'صحيح'
             WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح' THEN 'حسن'
             WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
           END AS grade_class
         FROM hadith_judgments
         WHERE say_text ~* 'صحيح|إسناده حسن|حديث حسن|سنده حسن|ضعيف|منكر|متروك|موضوع'
       ) sub
       WHERE grade_class IS NOT NULL
       GROUP BY grade_class
       ORDER BY cnt DESC`
    ).catch(() => ({ rows: [] })),
    pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM narrators WHERE is_companion = true`
    ).catch(() => ({ rows: [{ cnt: '0' }] })),
  ])

  const companions = companionsRes.rows
  const gradeStats: GradeStat[] = (gradeStatsRes as { rows: GradeStat[] }).rows
  const totalCompanions = parseInt((totalRes as { rows: Array<{ cnt: string }> }).rows[0]?.cnt || '0')

  // Split into groups: top 10 (most prolific), then next 40 (major), rest
  const top10 = companions.slice(0, 10)
  const major = companions.slice(10, 50)
  const rest = companions.slice(50)

  const maxCount = top10[0]?.hadiths_count || 1

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900">الصحابة الكرام رضي الله عنهم</h1>
        <p className="text-sm text-gray-500 mt-1">
          {totalCompanions.toLocaleString('ar-EG')} صحابياً في الموسوعة — مرتبون حسب عدد الأحاديث المروية
        </p>
      </div>

      {/* Grade stats across companion-transmitted hadiths */}
      {gradeStats.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6 flex flex-wrap items-center gap-4">
          <span className="text-sm font-medium text-gray-600">درجات الأحاديث المروية عن الصحابة:</span>
          {gradeStats.map(gs => (
            <div key={gs.grade_class} className="flex items-center gap-1.5">
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
                gs.grade_class === 'صحيح' ? 'bg-green-100 text-green-700 border-green-200' :
                gs.grade_class === 'حسن' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                'bg-red-50 text-red-600 border-red-200'
              }`}>
                {gs.grade_class} ({gs.cnt.toLocaleString('ar-EG')})
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Top 10 most prolific companions */}
      <div className="mb-8">
        <h2 className="text-base font-bold text-amber-900 mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-amber-500 rounded-full inline-block"></span>
          أكثر الصحابة رواية للحديث
        </h2>
        <div className="space-y-2">
          {top10.map((c, i) => {
            const cnt = c.hadiths_count || 0
            const pct = Math.round((cnt / maxCount) * 100)
            return (
              <Link
                key={c.id}
                href={`/narrator/${c.id}`}
                className="block bg-white rounded-xl border border-amber-100 hover:border-amber-300 hover:shadow-sm transition-all overflow-hidden group"
              >
                <div className="flex items-center gap-4 p-4">
                  <span className="text-lg font-bold text-amber-600 min-w-8 text-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="font-bold text-green-900 group-hover:text-green-700">{c.name}</span>
                      {c.kunia && c.kunia.trim() && (
                        <span className="text-sm text-gray-500">({c.kunia.trim()})</span>
                      )}
                      {c.death_year_num && (
                        <span className="text-xs text-gray-400">ت {c.death_year_num} هـ</span>
                      )}
                      {(c.living_city || c.death_city) && (
                        <span className="text-xs text-gray-400">{c.living_city || c.death_city}</span>
                      )}
                    </div>
                    <div className="relative">
                      <div className="h-2 bg-amber-100 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-lg font-bold text-amber-700">{cnt.toLocaleString('ar-EG')}</span>
                    <span className="text-xs text-gray-400 block">حديث</span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Major companions (11–50) */}
      {major.length > 0 && (
        <div className="mb-8">
          <h2 className="text-base font-bold text-green-900 mb-4 flex items-center gap-2">
            <span className="w-1 h-5 bg-green-500 rounded-full inline-block"></span>
            كبار الصحابة الرواة
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {major.map(c => (
              <Link
                key={c.id}
                href={`/narrator/${c.id}`}
                className="flex items-center justify-between bg-white rounded-xl border border-gray-100 hover:border-green-200 hover:shadow-sm transition-all px-4 py-3 group"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-green-900 text-sm group-hover:text-green-700 truncate">{c.name}</div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {c.kunia && c.kunia.trim() && (
                      <span className="text-xs text-gray-500">{c.kunia.trim()}</span>
                    )}
                    {c.death_year_num && (
                      <span className="text-xs text-gray-400">ت {c.death_year_num} هـ</span>
                    )}
                    {(c.living_city || c.death_city) && (
                      <span className="text-xs text-gray-400">{c.living_city || c.death_city}</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-sm font-bold text-green-700">{(c.hadiths_count || 0).toLocaleString('ar-EG')}</span>
                  <span className="text-xs text-gray-400 block">حديث</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Remaining companions */}
      {rest.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-gray-700 mb-4 flex items-center gap-2">
            <span className="w-1 h-5 bg-gray-400 rounded-full inline-block"></span>
            سائر الصحابة الرواة
            <span className="text-sm font-normal text-gray-400">({rest.length})</span>
          </h2>
          <div className="grid sm:grid-cols-3 gap-2">
            {rest.map(c => (
              <Link
                key={c.id}
                href={`/narrator/${c.id}`}
                className="flex items-center justify-between bg-white rounded-lg border border-gray-100 hover:border-green-200 hover:shadow-sm transition-all px-3 py-2.5 group"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-green-900 group-hover:text-green-700 truncate">{c.name}</div>
                  {c.death_year_num && (
                    <span className="text-xs text-gray-400">ت {c.death_year_num} هـ</span>
                  )}
                </div>
                {(c.hadiths_count || 0) > 0 && (
                  <span className="shrink-0 text-xs text-gray-500 mr-1">{c.hadiths_count}</span>
                )}
              </Link>
            ))}
          </div>
          {totalCompanions > 300 && (
            <p className="text-sm text-gray-400 mt-4 text-center">
              يُعرض أول 300 صحابي — الرجاء البحث في <Link href="/narrators?companion=1" className="text-green-600 hover:underline">قائمة الرواة</Link> لإيجاد صحابي بعينه
            </p>
          )}
        </div>
      )}
    </div>
  )
}
