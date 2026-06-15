import pool from '@/lib/db'
import Link from 'next/link'
import HadithNumber from '@/app/components/HadithNumber'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'الأحاديث الفردة — جامع خادم الحرمين' }

interface BookUnique {
  book_id: number
  book_title: string
  takhrij_author: string | null
  takhrij_death: number | null
  unique_count: number
  total_hadiths: number
}

interface HadithRow {
  main_id: number
  tarf: string | null
  tarqeem_harf: string | null
  tarqeem_matboa1: string | null
  grade_hint: string | null
}

function stripTags(html: string) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export default async function UniqueHadithsPage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string; page?: string }>
}) {
  const sp = await searchParams
  const bookId = parseInt(sp.book || '')
  const pg = Math.max(1, parseInt(sp.page || '1'))
  const limit = 40
  const offset = (pg - 1) * limit

  // Per-book unique hadith counts
  const booksRes = await pool.query<BookUnique>(
    `WITH book_totals AS (
       SELECT book_id, COUNT(DISTINCT main_id)::int AS total_hadiths
       FROM hadith_toc
       WHERE is_leaf = true AND is_paragraph = true
       GROUP BY book_id
     ),
     unique_counts AS (
       SELECT ht.book_id, COUNT(DISTINCT ht.main_id)::int AS unique_count
       FROM hadith_toc ht
       JOIN takhrij t ON t.hadith_id = ht.main_id
       WHERE ht.is_leaf = true AND ht.is_paragraph = true
         AND NOT EXISTS (
           SELECT 1 FROM takhrij t2
           WHERE t2.group_id = t.group_id AND t2.hadith_id != ht.main_id
         )
       GROUP BY ht.book_id
     )
     SELECT b.id AS book_id, b.title AS book_title, b.takhrij_author, b.takhrij_death,
            uc.unique_count, bt.total_hadiths
     FROM unique_counts uc
     JOIN books b ON b.id = uc.book_id
     JOIN book_totals bt ON bt.book_id = uc.book_id
     WHERE uc.unique_count > 0
     ORDER BY uc.unique_count DESC
     LIMIT 50`
  ).catch(() => ({ rows: [] }))

  const books = booksRes.rows
  const selectedBook = books.find(b => b.book_id === bookId) || null

  let hadiths: HadithRow[] = []
  let total = 0
  let totalPages = 0

  if (!isNaN(bookId)) {
    const countRes = await pool.query(
      `SELECT COUNT(DISTINCT ht.main_id)::int AS cnt
       FROM hadith_toc ht
       JOIN takhrij t ON t.hadith_id = ht.main_id
       WHERE ht.book_id = $1 AND ht.is_leaf = true AND ht.is_paragraph = true
         AND NOT EXISTS (
           SELECT 1 FROM takhrij t2
           WHERE t2.group_id = t.group_id AND t2.hadith_id != ht.main_id
         )`,
      [bookId]
    ).catch(() => ({ rows: [{ cnt: 0 }] }))
    total = countRes.rows[0]?.cnt || 0
    totalPages = Math.ceil(total / limit)

    const hadithsRes = await pool.query<HadithRow>(
      `SELECT ht.main_id, ht.tarf, ht.tarqeem_harf, ht.tarqeem_matboa1, g.grade_hint
       FROM hadith_toc ht
       JOIN takhrij t ON t.hadith_id = ht.main_id
       LEFT JOIN LATERAL (
         SELECT CASE
           WHEN say_text ~* 'صحيح' THEN 'صحيح'
           WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح' THEN 'حسن'
           WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
         END AS grade_hint
         FROM hadith_judgments
         WHERE hadith_id = ht.main_id
           AND say_text ~* 'صحيح|إسناده حسن|حديث حسن|سنده حسن|ضعيف|منكر|متروك|موضوع'
         LIMIT 1
       ) g ON true
       WHERE ht.book_id = $1 AND ht.is_leaf = true AND ht.is_paragraph = true
         AND NOT EXISTS (
           SELECT 1 FROM takhrij t2
           WHERE t2.group_id = t.group_id AND t2.hadith_id != ht.main_id
         )
       ORDER BY ht.left_value
       LIMIT $2 OFFSET $3`,
      [bookId, limit, offset]
    ).catch(() => ({ rows: [] }))
    hadiths = hadithsRes.rows
  }

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الأحاديث الفردة والغرائب</h1>
        <p className="text-sm text-gray-500">
          أحاديث لا توجد لها رواية موازية في أي كتاب آخر عبر قاعدة التخريج —
          تعكس المنهج الفريد لكل مصنِّف وما انفرد بتصويبه أو جمعه
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Books list */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="bg-green-900 text-white px-4 py-3 text-sm font-semibold">
              الكتب (بعدد الأحاديث الفردة)
            </div>
            <div className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
              {books.map(b => {
                const uniquePct = b.total_hadiths > 0
                  ? Math.round((b.unique_count / b.total_hadiths) * 100)
                  : 0
                const isSelected = b.book_id === bookId
                return (
                  <Link
                    key={b.book_id}
                    href={`/unique-hadiths?book=${b.book_id}`}
                    className={`block px-4 py-3 hover:bg-green-50 transition-colors ${isSelected ? 'bg-green-50 border-r-4 border-green-600' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-800 leading-snug">{b.book_title}</span>
                      <span className="text-xs font-bold text-green-700 shrink-0 mr-2">
                        {b.unique_count.toLocaleString('ar-EG')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full" style={{ width: `${uniquePct}%` }} />
                      </div>
                      <span className="text-xs text-gray-400">{uniquePct}%</span>
                    </div>
                    {b.takhrij_author && (
                      <span className="text-xs text-gray-400 mt-0.5 block">{b.takhrij_author}</span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>

        {/* Selected book's unique hadiths */}
        <div className="lg:col-span-2">
          {selectedBook ? (
            <div>
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <h2 className="font-bold text-green-900 text-lg">{selectedBook.book_title}</h2>
                <span className="text-sm text-gray-400">
                  {total.toLocaleString('ar-EG')} حديث فرد
                  {selectedBook.total_hadiths > 0 && (
                    <span className="mr-1">
                      ({Math.round((total / selectedBook.total_hadiths) * 100)}% من الكتاب)
                    </span>
                  )}
                </span>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800">
                هذه الأحاديث موجودة في {selectedBook.book_title} ولا توجد لها نظائر في أي كتاب آخر من قاعدة التخريج — قد تعكس تفرُّد المصنف في جمع بعض الطرق أو إيراد بعض الألفاظ
              </div>

              <div className="grid gap-2">
                {hadiths.map(h => {
                  return (
                    <Link
                      key={h.main_id}
                      href={`/hadith/${h.main_id}`}
                      className="block bg-white rounded-xl border border-gray-100 px-4 py-3 hover:shadow-md hover:border-amber-200 transition-all group"
                    >
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <HadithNumber harf={h.tarqeem_harf} matboa={h.tarqeem_matboa1} />
                        {h.grade_hint && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            h.grade_hint === 'صحيح' ? 'bg-green-100 text-green-700' :
                            h.grade_hint === 'حسن' ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-600'
                          }`}>{h.grade_hint}</span>
                        )}
                        <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full mr-auto">فرد</span>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed line-clamp-2 group-hover:text-green-900">
                        {stripTags(h.tarf || '').slice(0, 200)}
                      </p>
                    </Link>
                  )
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
                  {pg > 1 && (
                    <Link href={`/unique-hadiths?book=${bookId}&page=${pg - 1}`}
                      className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">السابق</Link>
                  )}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const p = totalPages <= 5 ? i + 1 : Math.max(1, Math.min(pg - 2, totalPages - 4)) + i
                    return (
                      <Link key={p} href={`/unique-hadiths?book=${bookId}&page=${p}`}
                        className={`px-4 py-2 rounded-lg border text-sm ${p === pg ? 'bg-green-800 text-white border-green-800' : 'border-gray-200 bg-white text-green-800 hover:border-green-300'}`}>
                        {p.toLocaleString('ar-EG')}
                      </Link>
                    )
                  })}
                  {pg < totalPages && (
                    <Link href={`/unique-hadiths?book=${bookId}&page=${pg + 1}`}
                      className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">التالي</Link>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
              <div className="text-4xl mb-4">📜</div>
              <h2 className="font-bold text-amber-900 mb-2">اختر كتاباً</h2>
              <p className="text-sm text-amber-700">
                اختر كتاباً من القائمة لعرض أحاديثه التي لا توجد لها نظائر في سائر المصادر
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
