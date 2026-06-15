import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'أحاديث ضعيفة لها شواهد — جامع خادم الحرمين' }

interface HadithRow {
  main_id: number
  tarf: string | null
  book_title: string
  daif_count: number
  parallel_count: number
  parallel_book_titles: string | null
  daif_scholar_names: string | null
}

function stripTags(html: string) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

async function fetchHadiths(minParallels: number, limit: number, offset: number) {
  return pool.query<HadithRow>(
    `WITH weak_no_sahih AS (
       SELECT DISTINCT j.hadith_id
       FROM hadith_judgments j
       WHERE j.grade_class = 'ضعيف'
         AND NOT EXISTS (
           SELECT 1 FROM hadith_judgments j2
           WHERE j2.hadith_id = j.hadith_id AND j2.grade_class = 'صحيح'
         )
     ),
     with_parallels AS (
       SELECT wns.hadith_id,
              COUNT(DISTINCT t2.hadith_id)::int - 1 AS parallel_count
       FROM weak_no_sahih wns
       JOIN takhrij t1 ON t1.hadith_id = wns.hadith_id
       JOIN takhrij t2 ON t2.group_id = t1.group_id AND t2.hadith_id != wns.hadith_id
       GROUP BY wns.hadith_id
       HAVING COUNT(DISTINCT t2.hadith_id) - 1 >= $1
     )
     SELECT
       wp.hadith_id AS main_id,
       h.tarf,
       b.title AS book_title,
       wp.parallel_count,
       par.parallel_book_titles,
       sch.daif_scholar_names,
       sch.daif_count
     FROM with_parallels wp
     JOIN hadith_toc h ON h.main_id = wp.hadith_id
     JOIN books b ON b.id = h.book_id
     LEFT JOIN LATERAL (
       SELECT STRING_AGG(DISTINCT b2.title, '، ') AS parallel_book_titles
       FROM takhrij t1
       JOIN takhrij t2 ON t2.group_id = t1.group_id AND t2.hadith_id != wp.hadith_id
       JOIN hadith_toc h2 ON h2.main_id = t2.hadith_id
       JOIN books b2 ON b2.id = h2.book_id
       WHERE t1.hadith_id = wp.hadith_id
     ) par ON true
     LEFT JOIN LATERAL (
       SELECT STRING_AGG(DISTINCT n.abb_name, '، ') AS daif_scholar_names,
              COUNT(*)::int AS daif_count
       FROM hadith_judgments j
       LEFT JOIN narrators n ON n.id = j.scientist_id
       WHERE j.hadith_id = wp.hadith_id AND j.grade_class = 'ضعيف'
     ) sch ON true
     ORDER BY wp.parallel_count DESC, wp.hadith_id
     LIMIT $2 OFFSET $3`,
    [minParallels, limit, offset]
  )
}

async function fetchTotal(minParallels: number) {
  return pool.query(
    `WITH weak_no_sahih AS (
       SELECT DISTINCT j.hadith_id
       FROM hadith_judgments j
       WHERE j.grade_class = 'ضعيف'
         AND NOT EXISTS (
           SELECT 1 FROM hadith_judgments j2
           WHERE j2.hadith_id = j.hadith_id AND j2.grade_class = 'صحيح'
         )
     )
     SELECT COUNT(*) AS cnt FROM (
       SELECT wns.hadith_id
       FROM weak_no_sahih wns
       JOIN takhrij t1 ON t1.hadith_id = wns.hadith_id
       JOIN takhrij t2 ON t2.group_id = t1.group_id AND t2.hadith_id != wns.hadith_id
       GROUP BY wns.hadith_id
       HAVING COUNT(DISTINCT t2.hadith_id) - 1 >= $1
     ) sub`,
    [minParallels]
  )
}

export default async function ParallelRoutesPage({
  searchParams,
}: {
  searchParams: Promise<{ min_parallels?: string; page?: string }>
}) {
  const sp = await searchParams
  const minParallels = Math.max(1, parseInt(sp.min_parallels || '2'))
  const pg = Math.max(1, parseInt(sp.page || '1'))
  const limit = 30
  const offset = (pg - 1) * limit

  const [totalRes, rowsRes] = await Promise.all([
    fetchTotal(minParallels).catch(() => ({ rows: [{ cnt: '0' }] })),
    fetchHadiths(minParallels, limit, offset).catch(() => ({ rows: [] })),
  ])

  const total = parseInt((totalRes as { rows: Array<{ cnt: string }> }).rows[0]?.cnt || '0')
  const hadiths = rowsRes.rows
  const totalPages = Math.ceil(total / limit)

  function pageUrl(p: number) {
    return `/scholars/parallel-routes?min_parallels=${minParallels}&page=${p}`
  }

  return (
    <div dir="rtl">
      <div className="mb-6">
        <Link href="/scholars" className="text-sm text-green-700 hover:underline">← أحكام المحدثين</Link>
        <h1 className="text-2xl font-bold text-green-900 mt-2 mb-1">أحاديث ضعيفة لها شواهد ومتابعات</h1>
        <p className="text-sm text-gray-500 leading-relaxed">
          أحاديث ضُعِّفت ولم يُصحَّح أيٌّ منها، غير أنها ترتبط بروايات موازية في مصادر أخرى عبر جدول التخريج —
          يُستفاد منها في دراسة التعدد والشواهد ومسألة التقوي بالطرق
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 text-sm text-blue-800 leading-relaxed">
        <strong>ملاحظة منهجية:</strong> هذه الصفحة تعرض بيانات خام من قاعدة التخريج — وجود الشواهد لا يعني بالضرورة تقوية الحديث
        إذ قد تكون الشواهد ضعيفة أيضاً. الحكم النهائي للباحث بعد استقراء جميع الطرق ودراسة ضعف كل راوٍ.
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-600">الحد الأدنى للشواهد:</span>
          {[1, 2, 3, 5].map(n => (
            <Link
              key={n}
              href={`/scholars/parallel-routes?min_parallels=${n}`}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                minParallels === n
                  ? 'bg-green-700 text-white border-green-700'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}
            >
              {n === 1 ? 'شاهد واحد فأكثر' : n === 2 ? 'شاهدان فأكثر' : n === 3 ? 'ثلاثة فأكثر' : 'خمسة فأكثر'}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <p className="text-sm text-gray-500">
          {total.toLocaleString('ar-EG')} حديث — صفحة {pg} من {Math.max(1, totalPages)}
        </p>
      </div>

      <div className="grid gap-3">
        {hadiths.map(h => (
          <Link
            key={h.main_id}
            href={`/hadith/${h.main_id}`}
            className="block bg-white rounded-xl border border-gray-100 px-5 py-4 hover:shadow-md hover:border-amber-200 transition-all group"
          >
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs font-semibold text-gray-600 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                {h.book_title}
              </span>
              <span className="text-xs bg-red-100 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-medium">
                ضعيف × {h.daif_count}
              </span>
              <span className="text-xs bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                {h.parallel_count} طريق موازية
              </span>
            </div>

            <p className="text-gray-800 text-sm leading-relaxed line-clamp-2 group-hover:text-green-900 mb-2">
              {stripTags(h.tarf || '').slice(0, 200)}
            </p>

            <div className="flex gap-4 text-xs text-gray-400 flex-wrap">
              {h.daif_scholar_names && (
                <span>
                  <span className="text-red-500 font-medium">ضعَّف: </span>
                  {h.daif_scholar_names.split('، ').filter(Boolean).slice(0, 3).join('، ')}
                </span>
              )}
              {h.parallel_book_titles && (
                <span>
                  <span className="text-blue-600 font-medium">الطرق الأخرى في: </span>
                  {h.parallel_book_titles.split('، ').slice(0, 3).join('، ')}
                  {h.parallel_book_titles.split('، ').length > 3 ? '...' : ''}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>

      {hadiths.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          لا توجد نتائج بهذه المعايير — جرب تقليل الحد الأدنى للشواهد
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2 flex-wrap">
          {pg > 1 && (
            <Link href={pageUrl(pg - 1)} className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">السابق</Link>
          )}
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const p = totalPages <= 5 ? i + 1 : Math.max(1, Math.min(pg - 2, totalPages - 4)) + i
            return (
              <Link key={p} href={pageUrl(p)}
                className={`px-4 py-2 rounded-lg border text-sm ${p === pg ? 'bg-green-800 text-white border-green-800' : 'border-gray-200 bg-white text-green-800 hover:border-green-300'}`}>
                {p.toLocaleString('ar-EG')}
              </Link>
            )
          })}
          {pg < totalPages && (
            <Link href={pageUrl(pg + 1)} className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">التالي</Link>
          )}
        </div>
      )}
    </div>
  )
}
