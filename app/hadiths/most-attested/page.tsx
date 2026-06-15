import pool from '@/lib/db'
import Link from 'next/link'
import HadithNumber from '@/app/components/HadithNumber'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'الأحاديث الأوسع انتشاراً — جامع خادم الحرمين' }

interface TopHadith {
  main_id: number
  tarf: string | null
  book_title: string
  takhrij_author: string | null
  tarqeem_harf: string | null
  tarqeem_matboa1: string | null
  parallel_count: number
  book_count: number
  grade_hint: string | null
}

function stripTags(html: string) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export default async function MostAttestedPage({
  searchParams,
}: {
  searchParams: Promise<{ min_books?: string; page?: string }>
}) {
  const sp = await searchParams
  const minBooks = Math.max(2, parseInt(sp.min_books || '5'))
  const pg = Math.max(1, parseInt(sp.page || '1'))
  const limit = 40
  const offset = (pg - 1) * limit

  const [hadithsRes, countRes] = await Promise.all([
    pool.query<TopHadith>(
      `WITH group_counts AS (
         SELECT group_id,
                COUNT(DISTINCT hadith_id)::int AS parallel_count,
                COUNT(DISTINCT book_id)::int AS book_count
         FROM takhrij
         GROUP BY group_id
         HAVING COUNT(DISTINCT book_id) >= $1
       )
       SELECT ht.main_id, ht.tarf, b.title AS book_title, b.takhrij_author,
              ht.tarqeem_harf, ht.tarqeem_matboa1,
              gc.parallel_count, gc.book_count,
              jg.grade_hint
       FROM group_counts gc
       JOIN takhrij t ON t.group_id = gc.group_id
       JOIN hadith_toc ht ON ht.main_id = t.hadith_id
       JOIN books b ON b.id = ht.book_id
       LEFT JOIN LATERAL (
         SELECT CASE
           WHEN say_text ~* 'صحيح' THEN 'صحيح'
           WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح' THEN 'حسن'
           WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
           ELSE NULL END AS grade_hint
         FROM hadith_judgments j2
         WHERE j2.hadith_id = ht.main_id
           AND (j2.say_text ~* 'صحيح|إسناده حسن|حديث حسن|سنده حسن|ضعيف|منكر|متروك')
         ORDER BY CASE WHEN j2.say_text ~* 'صحيح' THEN 1 WHEN j2.say_text ~* 'حسن' THEN 2 ELSE 3 END
         LIMIT 1
       ) jg ON true
       WHERE ht.is_leaf = true AND ht.is_paragraph = true
         AND t.hadith_id = (
           SELECT MIN(t2.hadith_id) FROM takhrij t2
           WHERE t2.group_id = gc.group_id AND t2.book_id = (
             SELECT MIN(b2.id) FROM takhrij t3 JOIN books b2 ON b2.id = t3.book_id
             WHERE t3.group_id = gc.group_id ORDER BY b2.tarteeb LIMIT 1
           )
           LIMIT 1
         )
       ORDER BY gc.book_count DESC, gc.parallel_count DESC
       LIMIT $2 OFFSET $3`,
      [minBooks, limit, offset]
    ).catch(() => ({ rows: [] as TopHadith[] })),

    pool.query<{ cnt: number }>(
      `WITH group_counts AS (
         SELECT group_id, COUNT(DISTINCT book_id)::int AS book_count
         FROM takhrij
         GROUP BY group_id
         HAVING COUNT(DISTINCT book_id) >= $1
       )
       SELECT COUNT(*)::int AS cnt FROM group_counts`,
      [minBooks]
    ).catch(() => ({ rows: [{ cnt: 0 }] })),
  ])

  const hadiths = hadithsRes.rows
  const total = countRes.rows[0]?.cnt || 0
  const totalPages = Math.ceil(total / limit)

  function gradeClass(g: string | null) {
    if (g === 'صحيح') return 'bg-green-100 text-green-700'
    if (g === 'حسن') return 'bg-amber-100 text-amber-700'
    if (g === 'ضعيف') return 'bg-red-100 text-red-600'
    return ''
  }

  function attestationColor(cnt: number): string {
    if (cnt >= 8) return 'bg-green-700 text-white'
    if (cnt >= 6) return 'bg-green-500 text-white'
    if (cnt >= 4) return 'bg-green-300 text-green-900'
    return 'bg-green-100 text-green-800'
  }

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الأحاديث الأوسع انتشاراً</h1>
        <p className="text-sm text-gray-500 mb-3">
          أحاديث تتعدد رواياتها المتوازية عبر أكبر عدد من الكتب الحديثية —
          تعكس الانتشار الواسع والتواتر النسبي في التراث الحديثي
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-500">الحد الأدنى من الكتب:</span>
          {[3, 5, 7, 10].map(n => (
            <Link
              key={n}
              href={`/hadiths/most-attested?min_books=${n}`}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                minBooks === n
                  ? 'bg-green-900 text-white border-green-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}
            >
              {n}+ كتاب
            </Link>
          ))}
          <span className="text-xs text-gray-400 mr-auto">
            {total.toLocaleString('ar-EG')} مجموعة حديثية
          </span>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800">
        الأحاديث مرتبة بحسب عدد الكتب التي تضم روايات موازية لها — لا يعكس بالضرورة درجة صحة الحديث،
        لكنه مؤشر على شيوع الرواية وكثرة طرقها في المصادر المحدثية.
      </div>

      <div className="grid gap-3">
        {hadiths.map((h, idx) => (
          <Link
            key={h.main_id}
            href={`/hadith/${h.main_id}`}
            className="block bg-white rounded-xl border border-gray-100 px-5 py-4 hover:shadow-md hover:border-green-200 transition-all group"
          >
            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-6 text-left shrink-0">
                  {(offset + idx + 1).toLocaleString('ar-EG')}
                </span>
                <span className="text-xs text-green-700 font-medium">{h.book_title}</span>
                {h.takhrij_author && (
                  <span className="text-xs text-gray-400">{h.takhrij_author}</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {h.grade_hint && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${gradeClass(h.grade_hint)}`}>
                    {h.grade_hint}
                  </span>
                )}
                <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${attestationColor(h.book_count)}`}
                  title={`ورد في ${h.book_count} كتاب (${h.parallel_count} رواية موازية)`}>
                  {h.book_count} كتاب
                </span>
                {h.parallel_count > h.book_count && (
                  <span className="text-xs text-gray-400">
                    ({h.parallel_count} رواية)
                  </span>
                )}
              </div>
            </div>

            <HadithNumber harf={h.tarqeem_harf} matboa={h.tarqeem_matboa1} className="mr-1" />

            <p className="text-sm text-gray-700 leading-relaxed line-clamp-2 mt-1.5 group-hover:text-green-900">
              {stripTags(h.tarf || '').slice(0, 250) || '...'}
            </p>
          </Link>
        ))}
      </div>

      {hadiths.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center text-gray-500">
          لا توجد أحاديث تلبي هذا الشرط
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
          {pg > 1 && (
            <Link href={`/hadiths/most-attested?min_books=${minBooks}&page=${pg - 1}`}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
              السابق
            </Link>
          )}
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const p = totalPages <= 5 ? i + 1 : Math.max(1, Math.min(pg - 2, totalPages - 4)) + i
            return (
              <Link key={p} href={`/hadiths/most-attested?min_books=${minBooks}&page=${p}`}
                className={`px-4 py-2 rounded-lg border text-sm ${
                  p === pg ? 'bg-green-800 text-white border-green-800' : 'border-gray-200 bg-white text-green-800 hover:border-green-300'
                }`}>
                {p.toLocaleString('ar-EG')}
              </Link>
            )
          })}
          {pg < totalPages && (
            <Link href={`/hadiths/most-attested?min_books=${minBooks}&page=${pg + 1}`}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
              التالي
            </Link>
          )}
        </div>
      )}

      {/* Quick nav */}
      <div className="mt-6 flex items-center gap-4 flex-wrap text-sm">
        <Link href="/unique-hadiths" className="text-green-700 hover:underline">
          ← الأحاديث الفردة (أقل انتشاراً)
        </Link>
        <Link href="/books/intersection" className="text-green-700 hover:underline">
          ← تقاطع الكتب
        </Link>
        <Link href="/scholars/parallel-routes" className="text-green-700 hover:underline">
          ← الأحاديث الضعيفة ذات الشواهد
        </Link>
      </div>
    </div>
  )
}
