import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'خلاف المحدثين — جامع خادم الحرمين' }

interface DisputedHadith {
  hadith_id: number
  tarf: string | null
  book_title: string
  sahih_count: number
  hasan_count: number
  daif_count: number
  sahih_names: string | null
  daif_names: string | null
}

function stripTags(html: string) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export default async function DisagreementsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string }>
}) {
  const sp = await searchParams
  const type = sp.type || 'sahih_daif'
  const pg = Math.max(1, parseInt(sp.page || '1'))
  const limit = 30
  const offset = (pg - 1) * limit

  let hadiths: DisputedHadith[] = []
  let total = 0

  const GRADE_CTE = `
    WITH graded AS (
      SELECT hadith_id, scientist_id,
        CASE
          WHEN say_text ~* 'صحيح' THEN 'صحيح'
          WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح' THEN 'حسن'
          WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
        END AS grade_class
      FROM hadith_judgments
      WHERE say_text ~* 'صحيح|إسناده حسن|حديث حسن|سنده حسن|ضعيف|منكر|متروك|موضوع'
    )`

  if (type === 'sahih_daif') {
    const countRes = await pool.query(
      `${GRADE_CTE}
       SELECT COUNT(*) FROM (
         SELECT hadith_id
         FROM graded
         WHERE grade_class IS NOT NULL
         GROUP BY hadith_id
         HAVING COUNT(CASE WHEN grade_class = 'صحيح' THEN 1 END) > 0
            AND COUNT(CASE WHEN grade_class = 'ضعيف' THEN 1 END) > 0
       ) sub`
    ).catch(() => ({ rows: [{ count: 0 }] }))
    total = parseInt(countRes.rows[0].count as string)

    const res = await pool.query<DisputedHadith>(
      `${GRADE_CTE}
       SELECT j.hadith_id,
              h.tarf,
              b.title AS book_title,
              COUNT(CASE WHEN j.grade_class = 'صحيح' THEN 1 END)::int AS sahih_count,
              COUNT(CASE WHEN j.grade_class = 'حسن' THEN 1 END)::int AS hasan_count,
              COUNT(CASE WHEN j.grade_class = 'ضعيف' THEN 1 END)::int AS daif_count,
              STRING_AGG(DISTINCT CASE WHEN j.grade_class = 'صحيح' THEN n.abb_name END, '، ') AS sahih_names,
              STRING_AGG(DISTINCT CASE WHEN j.grade_class = 'ضعيف' THEN n.abb_name END, '، ') AS daif_names
       FROM graded j
       LEFT JOIN narrators n ON j.scientist_id = n.id
       JOIN hadith_toc h ON h.main_id = j.hadith_id
       JOIN books b ON b.id = h.book_id
       WHERE j.grade_class IS NOT NULL
       GROUP BY j.hadith_id, h.tarf, b.title
       HAVING COUNT(CASE WHEN j.grade_class = 'صحيح' THEN 1 END) > 0
          AND COUNT(CASE WHEN j.grade_class = 'ضعيف' THEN 1 END) > 0
       ORDER BY (COUNT(CASE WHEN j.grade_class = 'صحيح' THEN 1 END) + COUNT(CASE WHEN j.grade_class = 'ضعيف' THEN 1 END)) DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ).catch(() => ({ rows: [] }))
    hadiths = res.rows
  } else if (type === 'hasan_daif') {
    const countRes = await pool.query(
      `${GRADE_CTE}
       SELECT COUNT(*) FROM (
         SELECT hadith_id FROM graded
         WHERE grade_class IS NOT NULL
         GROUP BY hadith_id
         HAVING COUNT(CASE WHEN grade_class IN ('صحيح','حسن') THEN 1 END) > 0
            AND COUNT(CASE WHEN grade_class = 'ضعيف' THEN 1 END) > 0
            AND COUNT(CASE WHEN grade_class = 'صحيح' THEN 1 END) = 0
       ) sub`
    ).catch(() => ({ rows: [{ count: 0 }] }))
    total = parseInt(countRes.rows[0].count as string)

    const res = await pool.query<DisputedHadith>(
      `${GRADE_CTE}
       SELECT j.hadith_id,
              h.tarf,
              b.title AS book_title,
              COUNT(CASE WHEN j.grade_class = 'صحيح' THEN 1 END)::int AS sahih_count,
              COUNT(CASE WHEN j.grade_class = 'حسن' THEN 1 END)::int AS hasan_count,
              COUNT(CASE WHEN j.grade_class = 'ضعيف' THEN 1 END)::int AS daif_count,
              STRING_AGG(DISTINCT CASE WHEN j.grade_class = 'حسن' THEN n.abb_name END, '، ') AS sahih_names,
              STRING_AGG(DISTINCT CASE WHEN j.grade_class = 'ضعيف' THEN n.abb_name END, '، ') AS daif_names
       FROM graded j
       LEFT JOIN narrators n ON j.scientist_id = n.id
       JOIN hadith_toc h ON h.main_id = j.hadith_id
       JOIN books b ON b.id = h.book_id
       WHERE j.grade_class IS NOT NULL
       GROUP BY j.hadith_id, h.tarf, b.title
       HAVING COUNT(CASE WHEN j.grade_class IN ('صحيح','حسن') THEN 1 END) > 0
          AND COUNT(CASE WHEN j.grade_class = 'ضعيف' THEN 1 END) > 0
          AND COUNT(CASE WHEN j.grade_class = 'صحيح' THEN 1 END) = 0
       ORDER BY (COUNT(CASE WHEN j.grade_class = 'حسن' THEN 1 END) + COUNT(CASE WHEN j.grade_class = 'ضعيف' THEN 1 END)) DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    ).catch(() => ({ rows: [] }))
    hadiths = res.rows
  }

  const totalPages = Math.ceil(total / limit)

  function pageUrl(p: number) {
    return `/scholars/disagreements?type=${type}&page=${p}`
  }

  return (
    <div dir="rtl">
      <div className="mb-6">
        <Link href="/scholars" className="text-sm text-green-700 hover:underline">← أحكام المحدثين</Link>
        <h1 className="text-2xl font-bold text-green-900 mt-2 mb-1">مسائل خلاف المحدثين</h1>
        <p className="text-sm text-gray-500">
          أحاديث اختلف فيها العلماء تصحيحاً وتضعيفاً — مفيدة لدراسة منهج النقد والترجيح
        </p>
      </div>

      {/* Type selector */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { key: 'sahih_daif', label: 'صحيح عند قوم — ضعيف عند آخرين', color: 'from-green-700 to-red-600' },
          { key: 'hasan_daif', label: 'حسن عند قوم — ضعيف عند آخرين', color: 'from-amber-600 to-red-600' },
        ].map(t => (
          <Link
            key={t.key}
            href={`/scholars/disagreements?type=${t.key}`}
            className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
              type === t.key
                ? 'bg-green-800 text-white border-green-800 shadow-sm'
                : 'bg-white text-gray-700 border-gray-200 hover:border-green-300'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <p className="text-sm text-gray-500">
          إجمالي: <span className="font-semibold text-green-800">{total.toLocaleString('ar-EG')}</span> حديث محل خلاف
        </p>
        <span className="text-xs text-gray-400">— صفحة {pg} من {totalPages}</span>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-xs text-amber-800 leading-relaxed">
        <strong>تنبيه:</strong> الخلاف هنا مبني على ما ورد في أقوال العلماء المسجَّلة في قاعدة البيانات، وقد لا يعكس كامل المشهد النقدي لكل حديث.
        استخدم هذه الصفحة كنقطة انطلاق للبحث لا حكماً نهائياً.
      </div>

      <div className="grid grid-cols-1 gap-3">
        {hadiths.map(h => {
          const total_opinions = h.sahih_count + h.hasan_count + h.daif_count
          const positive = h.sahih_count + h.hasan_count
          const positivePercent = total_opinions > 0 ? Math.round((positive / total_opinions) * 100) : 50
          return (
            <Link
              key={h.hadith_id}
              href={`/hadith/${h.hadith_id}`}
              className="block bg-white rounded-xl border border-gray-100 px-5 py-4 hover:shadow-md hover:border-green-200 transition-all group"
            >
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-xs font-semibold text-gray-600 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                  {h.book_title}
                </span>
                {/* Opinion bars */}
                <div className="flex items-center gap-1 text-xs">
                  {h.sahih_count > 0 && (
                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium border border-green-200">
                      صحيح × {h.sahih_count}
                    </span>
                  )}
                  {h.hasan_count > 0 && (
                    <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium border border-amber-200">
                      حسن × {h.hasan_count}
                    </span>
                  )}
                  <span className="text-gray-300">⟷</span>
                  {h.daif_count > 0 && (
                    <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium border border-red-200">
                      ضعيف × {h.daif_count}
                    </span>
                  )}
                </div>
              </div>

              {/* Ratio bar */}
              <div className="h-1.5 bg-red-200 rounded-full mb-3 overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${positivePercent}%` }}
                />
              </div>

              <p className="text-gray-800 text-sm leading-relaxed line-clamp-2 group-hover:text-green-900 mb-2">
                {stripTags(h.tarf || '').slice(0, 200)}
              </p>

              {/* Scholar names */}
              <div className="flex gap-3 text-xs text-gray-400 flex-wrap">
                {h.sahih_names && (
                  <span>
                    <span className="text-green-600 font-medium">صحَّح: </span>
                    {h.sahih_names.split('، ').slice(0, 3).join('، ')}
                    {h.sahih_names.split('، ').length > 3 && '...'}
                  </span>
                )}
                {h.daif_names && (
                  <span>
                    <span className="text-red-500 font-medium">ضعَّف: </span>
                    {h.daif_names.split('، ').slice(0, 3).join('، ')}
                    {h.daif_names.split('، ').length > 3 && '...'}
                  </span>
                )}
              </div>
            </Link>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2 flex-wrap">
          {pg > 1 && (
            <Link href={pageUrl(pg - 1)} className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
              السابق
            </Link>
          )}
          {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
            let p: number
            if (totalPages <= 7) p = i + 1
            else if (pg <= 4) p = i + 1
            else if (pg >= totalPages - 3) p = totalPages - 6 + i
            else p = pg - 3 + i
            return (
              <Link
                key={p}
                href={pageUrl(p)}
                className={`px-4 py-2 rounded-lg border text-sm ${
                  p === pg ? 'bg-green-800 text-white border-green-800' : 'border-gray-200 bg-white text-green-800 hover:border-green-300'
                }`}
              >
                {p.toLocaleString('ar-EG')}
              </Link>
            )
          })}
          {pg < totalPages && (
            <Link href={pageUrl(pg + 1)} className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
              التالي
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
