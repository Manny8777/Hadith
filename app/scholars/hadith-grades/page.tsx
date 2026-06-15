import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'أحكام عالم على الأحاديث — جامع خادم الحرمين' }

interface ScholarOption {
  scholar_id: number
  scholar_name: string
  judgment_count: number
}

interface JudgmentRow {
  hadith_id: number
  hadith_text: string
  book_title: string
  chapter_text: string | null
  judgment_text: string
  takhrij_id: number | null
}

interface GradeStat {
  grade_type: string
  cnt: number
}

interface BookOption {
  id: number
  title: string
}

export default async function ScholarHadithGradesPage({
  searchParams,
}: {
  searchParams: Promise<{
    scholar_id?: string; grade?: string; page?: string; book?: string
  }>
}) {
  const sp = await searchParams
  const scholarId = parseInt(sp.scholar_id || '0') || null
  const gradeFilter = sp.grade?.trim() || ''
  const pageNum = Math.max(1, parseInt(sp.page || '1'))
  const bookFilter = parseInt(sp.book || '0') || null
  const pageSize = 25
  const offset = (pageNum - 1) * pageSize

  // Build dynamic params for the hadith query
  const params: (string | number)[] = scholarId ? [scholarId] : []
  if (scholarId && gradeFilter) params.push(gradeFilter)
  if (scholarId && bookFilter) params.push(bookFilter)
  params.push(pageSize, offset)
  const gradeIdx = gradeFilter ? params.indexOf(gradeFilter) + 1 : 0
  const bookIdx = bookFilter ? params.indexOf(bookFilter) + 1 : 0
  const limitIdx = params.length - 1
  const offsetIdx = params.length

  const [scholarsRes, gradeStatsRes, haditSRes, booksRes] = await Promise.all([
    pool.query<ScholarOption>(
      `SELECT n.id AS scholar_id, n.name AS scholar_name, COUNT(*)::int AS judgment_count
       FROM hadith_judgments hj
       JOIN narrators n ON n.id = hj.scientist_id
       GROUP BY n.id, n.name
       ORDER BY judgment_count DESC
       LIMIT 40`
    ).catch(() => ({ rows: [] as ScholarOption[] })),

    scholarId ? pool.query<GradeStat>(
      `SELECT
         CASE
           WHEN hj.say_text ~* 'صحيح' AND hj.say_text !~* 'ضعيف|ليس بصحيح' THEN 'صحيح'
           WHEN hj.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND hj.say_text !~* 'ضعيف' THEN 'حسن'
           WHEN hj.say_text ~* 'موضوع|مكذوب|باطل|مختلق' THEN 'موضوع'
           WHEN hj.say_text ~* 'منكر|شاذ' THEN 'منكر/شاذ'
           WHEN hj.say_text ~* 'مرسل|منقطع|معلق' THEN 'مرسل/منقطع'
           WHEN hj.say_text ~* 'ضعيف|متروك|واهٍ' THEN 'ضعيف'
           ELSE 'أخرى'
         END AS grade_type,
         COUNT(*)::int AS cnt
       FROM hadith_judgments hj
       WHERE hj.scientist_id = $1
       GROUP BY grade_type
       ORDER BY cnt DESC`,
      [scholarId]
    ).catch(() => ({ rows: [] as GradeStat[] })) : Promise.resolve({ rows: [] as GradeStat[] }),

    scholarId ? pool.query<JudgmentRow>(
      `SELECT DISTINCT ON (hj.hadith_id)
              hj.hadith_id,
              regexp_replace(coalesce(ht.tarf, ''), '<[^>]+>', ' ', 'g') AS hadith_text,
              b.title AS book_title,
              ht.chapter_text,
              hj.say_text AS judgment_text,
              (SELECT tk.group_id FROM takhrij tk WHERE tk.hadith_id = hj.hadith_id LIMIT 1) AS takhrij_id
       FROM hadith_judgments hj
       JOIN hadith_toc ht ON ht.main_id = hj.hadith_id
       JOIN books b ON b.id = ht.book_id
       WHERE hj.scientist_id = $1
         ${gradeFilter ? `AND hj.say_text ~* $${gradeIdx}` : ''}
         ${bookFilter ? `AND ht.book_id = $${bookIdx}` : ''}
       ORDER BY hj.hadith_id, b.takhrij_death
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    ).catch(() => ({ rows: [] as JudgmentRow[] })) : Promise.resolve({ rows: [] as JudgmentRow[] }),

    scholarId ? pool.query<BookOption>(
      `SELECT DISTINCT b.id, b.title
       FROM books b
       JOIN hadith_toc ht ON ht.book_id = b.id AND ht.is_leaf = true AND ht.is_paragraph = true
       JOIN hadith_judgments hj ON hj.hadith_id = ht.main_id AND hj.scientist_id = $1
       ORDER BY b.title LIMIT 50`,
      [scholarId]
    ).catch(() => ({ rows: [] as BookOption[] })) : Promise.resolve({ rows: [] as BookOption[] }),
  ])

  const scholars = scholarsRes.rows
  const gradeStats = gradeStatsRes.rows
  const hadiths = haditSRes.rows
  const books = booksRes.rows
  const selectedScholar = scholars.find(s => s.scholar_id === scholarId)

  const totalGraded = gradeStats.reduce((a, s) => a + s.cnt, 0)

  function judgmentColor(j: string) {
    if (/صحيح/.test(j)) return 'text-green-700 bg-green-50 border-green-100'
    if (/حسن/.test(j))  return 'text-blue-700 bg-blue-50 border-blue-100'
    if (/ضعيف/.test(j)) return 'text-red-600 bg-red-50 border-red-100'
    if (/موضوع|كذب|باطل/.test(j)) return 'text-red-900 bg-red-100 border-red-200'
    return 'text-gray-500 bg-gray-50 border-gray-100'
  }

  const baseUrl = `/scholars/hadith-grades?${scholarId ? `scholar_id=${scholarId}&` : ''}${gradeFilter ? `grade=${encodeURIComponent(gradeFilter)}&` : ''}${bookFilter ? `book=${bookFilter}&` : ''}`

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">أحكام عالم على الأحاديث</h1>
        <p className="text-sm text-gray-500">
          تصفح أحكام محدِّث بعينه — صحَّح ماذا؟ وضعَّف ماذا؟ ومنهجه في التصحيح والتضعيف
        </p>
      </div>

      {/* Scholar selection */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
        <div className="text-xs text-gray-500 mb-2 font-medium">اختر العالم</div>
        <div className="flex flex-wrap gap-2">
          {scholars.map(s => (
            <Link key={s.scholar_id}
              href={`/scholars/hadith-grades?scholar_id=${s.scholar_id}`}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                s.scholar_id === scholarId
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {s.scholar_name}
              <span className="text-xs opacity-60 mr-1">({s.judgment_count.toLocaleString('ar-EG')})</span>
            </Link>
          ))}
        </div>
      </div>

      {scholarId && (
        <>
          {/* Grade distribution */}
          {gradeStats.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-green-900 text-sm">
                  توزيع أحكام {selectedScholar?.scholar_name || ''}
                </h2>
                <span className="text-xs text-gray-400">{totalGraded.toLocaleString('ar-EG')} حكم</span>
              </div>
              <div className="space-y-2">
                {gradeStats.filter(g => g.grade_type !== 'أخرى').map(g => (
                  <div key={g.grade_type} className="flex items-center gap-3">
                    <Link href={`/scholars/hadith-grades?scholar_id=${scholarId}&grade=${encodeURIComponent(g.grade_type)}`}
                      className={`text-xs font-medium w-24 shrink-0 px-2 py-0.5 rounded-full border text-center ${judgmentColor(g.grade_type)}`}>
                      {g.grade_type}
                    </Link>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div className="h-2 rounded-full bg-green-500"
                        style={{ width: `${(g.cnt / totalGraded) * 100}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 shrink-0 w-20 text-left">
                      {g.cnt.toLocaleString('ar-EG')} ({Math.round((g.cnt / totalGraded) * 100)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filters */}
          {(gradeFilter || bookFilter || books.length > 0) && (
            <div className="flex flex-wrap gap-2 mb-4 items-center">
              {gradeFilter && (
                <Link href={`/scholars/hadith-grades?scholar_id=${scholarId}`}
                  className="text-xs bg-green-100 text-green-800 px-3 py-1.5 rounded-full flex items-center gap-1 hover:bg-green-200">
                  الدرجة: {gradeFilter} ×
                </Link>
              )}
              {bookFilter && (
                <Link href={`/scholars/hadith-grades?scholar_id=${scholarId}${gradeFilter ? `&grade=${encodeURIComponent(gradeFilter)}` : ''}`}
                  className="text-xs bg-blue-100 text-blue-800 px-3 py-1.5 rounded-full flex items-center gap-1 hover:bg-blue-200">
                  كتاب محدد ×
                </Link>
              )}
              {books.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {books.map(b => (
                    <Link key={b.id}
                      href={`/scholars/hadith-grades?scholar_id=${scholarId}${gradeFilter ? `&grade=${encodeURIComponent(gradeFilter)}` : ''}&book=${b.id}`}
                      className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                        b.id === bookFilter
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'border-gray-200 text-gray-500 hover:border-blue-300'
                      }`}>
                      {b.title.slice(0, 20)}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Hadith list */}
          <div className="space-y-3">
            {hadiths.map(h => (
              <div key={h.hadith_id}
                className="bg-white rounded-xl border border-gray-100 p-4 hover:border-green-200 hover:shadow-sm transition-all">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-xs text-gray-500">{h.book_title}</span>
                  {h.chapter_text && <span className="text-xs text-gray-400">— {h.chapter_text.slice(0, 40)}</span>}
                  <span className={`text-xs px-2 py-0.5 rounded-full border mr-auto ${judgmentColor(h.judgment_text)}`}>
                    {h.judgment_text.slice(0, 60)}
                  </span>
                </div>
                <p className="text-sm text-gray-900 leading-relaxed mb-2">
                  {h.hadith_text.slice(0, 250)}{h.hadith_text.length > 249 && '...'}
                </p>
                <div className="flex gap-3 text-xs">
                  <Link href={`/hadith/${h.hadith_id}`} className="text-green-700 hover:underline">تفاصيل ←</Link>
                  <Link href={`/hadith/${h.hadith_id}/research-report`} className="text-blue-600 hover:underline">تقرير ←</Link>
                  {h.takhrij_id && (
                    <Link href={`/hadith/${h.hadith_id}/across-books`} className="text-indigo-600 hover:underline">مقارنة ←</Link>
                  )}
                </div>
              </div>
            ))}
            {hadiths.length === 0 && (
              <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
                لا توجد أحاديث — جرب تعديل الفلتر
              </div>
            )}
          </div>

          {/* Pagination */}
          {(hadiths.length === pageSize || pageNum > 1) && (
            <div className="flex gap-2 mt-5 justify-center">
              {pageNum > 1 && (
                <Link href={`${baseUrl}page=${pageNum - 1}`}
                  className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">← السابق</Link>
              )}
              <span className="text-sm text-gray-400 self-center">صفحة {pageNum.toLocaleString('ar-EG')}</span>
              {hadiths.length === pageSize && (
                <Link href={`${baseUrl}page=${pageNum + 1}`}
                  className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">التالي →</Link>
              )}
            </div>
          )}
        </>
      )}

      {!scholarId && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-8 text-center">
          <p className="text-sm text-amber-800 font-medium">اختر عالماً من القائمة أعلاه</p>
          <p className="text-xs text-amber-600 mt-1">لعرض أحكامه التفصيلية على الأحاديث</p>
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/scholars" className="text-green-700 hover:underline">← أحكام المحدثين</Link>
        <Link href="/scholars/compare" className="text-green-700 hover:underline">← مقارنة المحدثين</Link>
        <Link href="/hadiths/grade-dispute" className="text-green-700 hover:underline">← الخلاف في الدرجة</Link>
      </div>
    </div>
  )
}
