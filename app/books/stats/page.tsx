export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'

interface BookStat {
  id: number
  title: string
  takhrij_author: string | null
  takhrij_death: number | null
  fame: number | null
  total_hadiths: number
  sahih_count: number
  hasan_count: number
  daif_count: number
  judged_count: number
}

function gradeBar(count: number, total: number, color: string) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
        <div
          className={`h-2 rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs w-10 text-left tabular-nums">{pct}%</span>
    </div>
  )
}

export default async function BooksStatsPage() {
  // Per-book grade distribution from hadith_judgments
  const { rows } = await pool.query<BookStat>(`
    SELECT
      b.id,
      b.title,
      b.takhrij_author,
      b.takhrij_death,
      b.fame,
      COUNT(DISTINCT ht.main_id)::int AS total_hadiths,
      COUNT(DISTINCT CASE WHEN j.grade_class = 'صحيح'  THEN ht.main_id END)::int AS sahih_count,
      COUNT(DISTINCT CASE WHEN j.grade_class = 'حسن'   THEN ht.main_id END)::int AS hasan_count,
      COUNT(DISTINCT CASE WHEN j.grade_class = 'ضعيف'  THEN ht.main_id END)::int AS daif_count,
      COUNT(DISTINCT CASE WHEN j.grade_class IS NOT NULL THEN ht.main_id END)::int AS judged_count
    FROM books b
    LEFT JOIN hadith_toc ht ON ht.book_id = b.id AND ht.is_leaf = true
    LEFT JOIN (
      SELECT hadith_id,
        CASE
          WHEN say_text ~* 'صحيح' THEN 'صحيح'
          WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح' THEN 'حسن'
          WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
          ELSE NULL
        END AS grade_class
      FROM hadith_judgments
      WHERE say_text ~* 'صحيح|إسناده حسن|حديث حسن|سنده حسن|ضعيف|منكر|متروك|موضوع'
    ) j ON j.hadith_id = ht.main_id
    GROUP BY b.id, b.title, b.takhrij_author, b.takhrij_death, b.fame
    ORDER BY b.tarteeb, b.id
  `)

  const totalAcrossAll = rows.reduce((s, b) => s + b.total_hadiths, 0)
  const totalSahih = rows.reduce((s, b) => s + b.sahih_count, 0)
  const totalHasan = rows.reduce((s, b) => s + b.hasan_count, 0)
  const totalDaif = rows.reduce((s, b) => s + b.daif_count, 0)

  return (
    <div dir="rtl" className="min-h-screen bg-amber-50">
      <header className="bg-green-900 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/books" className="text-amber-200 hover:text-white text-sm">← الكتب</Link>
          <h1 className="text-lg font-bold text-amber-100">إحصاءات درجات الأحاديث</h1>
          <Link href="/" className="text-amber-200 hover:text-white text-sm">الرئيسية</Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Overall summary */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-bold text-green-900 text-base mb-4">الإجمالي عبر جميع الكتب</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-gray-800">{totalAcrossAll.toLocaleString('ar-EG')}</div>
              <div className="text-xs text-gray-500 mt-1">مجموع الأحاديث</div>
            </div>
            <div className="bg-green-50 rounded-xl p-4 text-center border border-green-100">
              <div className="text-2xl font-bold text-green-700">{totalSahih.toLocaleString('ar-EG')}</div>
              <div className="text-xs text-green-600 mt-1">صحيح</div>
            </div>
            <div className="bg-amber-50 rounded-xl p-4 text-center border border-amber-100">
              <div className="text-2xl font-bold text-amber-700">{totalHasan.toLocaleString('ar-EG')}</div>
              <div className="text-xs text-amber-600 mt-1">حسن</div>
            </div>
            <div className="bg-red-50 rounded-xl p-4 text-center border border-red-100">
              <div className="text-2xl font-bold text-red-700">{totalDaif.toLocaleString('ar-EG')}</div>
              <div className="text-xs text-red-600 mt-1">ضعيف</div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            ملاحظة: الأحاديث التي لها أحكام متعددة (مثل صحيح وحسن) قد تُعدّ في أكثر من خانة. الأحاديث غير المحكوم عليها لا تظهر في الخانات.
          </p>
        </div>

        {/* Per-book breakdown */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-bold text-green-900 text-base mb-5">توزيع الدرجات حسب الكتاب</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-right pb-3 pr-2 font-semibold text-gray-600 w-1/3">الكتاب</th>
                  <th className="text-center pb-3 font-semibold text-gray-600 w-16">المجموع</th>
                  <th className="text-center pb-3 font-semibold text-green-700 w-16">صحيح</th>
                  <th className="text-center pb-3 font-semibold text-amber-700 w-16">حسن</th>
                  <th className="text-center pb-3 font-semibold text-red-600 w-16">ضعيف</th>
                  <th className="pb-3 w-48 text-right font-semibold text-gray-500 text-xs">نسبة الصحيح</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(book => {
                  const judged = book.judged_count
                  const sahihPct = judged > 0 ? Math.round((book.sahih_count / judged) * 100) : 0
                  const hasanPct = judged > 0 ? Math.round((book.hasan_count / judged) * 100) : 0
                  const daifPct  = judged > 0 ? Math.round((book.daif_count  / judged) * 100) : 0

                  return (
                    <tr key={book.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 pr-2">
                        <Link href={`/books/${book.id}`} className="font-medium text-green-800 hover:underline block leading-snug">
                          {book.title}
                        </Link>
                        {book.takhrij_author && (
                          <span className="text-xs text-gray-400">
                            {book.takhrij_author}{book.takhrij_death ? ` (ت ${book.takhrij_death})` : ''}
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-center font-mono text-gray-600">
                        {book.total_hadiths.toLocaleString('ar-EG')}
                      </td>
                      <td className="py-3 text-center">
                        <span className="text-green-700 font-semibold">{book.sahih_count > 0 ? book.sahih_count.toLocaleString('ar-EG') : '—'}</span>
                        {sahihPct > 0 && <span className="text-xs text-gray-400 block">{sahihPct}%</span>}
                      </td>
                      <td className="py-3 text-center">
                        <span className="text-amber-700 font-semibold">{book.hasan_count > 0 ? book.hasan_count.toLocaleString('ar-EG') : '—'}</span>
                        {hasanPct > 0 && <span className="text-xs text-gray-400 block">{hasanPct}%</span>}
                      </td>
                      <td className="py-3 text-center">
                        <span className="text-red-600 font-semibold">{book.daif_count > 0 ? book.daif_count.toLocaleString('ar-EG') : '—'}</span>
                        {daifPct > 0 && <span className="text-xs text-gray-400 block">{daifPct}%</span>}
                      </td>
                      <td className="py-3 pl-2">
                        {judged > 0 ? (
                          <div className="space-y-1">
                            {book.sahih_count > 0 && gradeBar(book.sahih_count, judged, 'bg-green-500')}
                            {book.hasan_count > 0 && gradeBar(book.hasan_count, judged, 'bg-amber-400')}
                            {book.daif_count > 0 && gradeBar(book.daif_count, judged, 'bg-red-400')}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">لا أحكام</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Visual distribution — stacked bars per book */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-bold text-green-900 text-base mb-5">مقارنة بصرية بين الكتب</h2>
          <div className="space-y-3">
            {rows.filter(b => b.judged_count > 0).map(book => {
              const j = book.judged_count
              const sahihW = Math.round((book.sahih_count / j) * 100)
              const hasanW = Math.round((book.hasan_count / j) * 100)
              const daifW  = Math.round((book.daif_count  / j) * 100)
              const restW  = Math.max(0, 100 - sahihW - hasanW - daifW)
              return (
                <div key={book.id} className="flex items-center gap-3">
                  <Link href={`/books/${book.id}`} className="text-sm text-gray-700 hover:underline w-40 shrink-0 truncate text-right">
                    {book.title}
                  </Link>
                  <div className="flex-1 flex rounded-full overflow-hidden h-4 bg-gray-100">
                    {sahihW > 0 && <div title={`صحيح ${sahihW}%`} className="bg-green-500 h-4" style={{ width: `${sahihW}%` }} />}
                    {hasanW > 0 && <div title={`حسن ${hasanW}%`} className="bg-amber-400 h-4" style={{ width: `${hasanW}%` }} />}
                    {daifW  > 0 && <div title={`ضعيف ${daifW}%`} className="bg-red-400 h-4" style={{ width: `${daifW}%` }} />}
                    {restW  > 0 && <div title="غير محكوم" className="bg-gray-200 h-4" style={{ width: `${restW}%` }} />}
                  </div>
                  <span className="text-xs text-gray-400 w-16 shrink-0">
                    {j.toLocaleString('ar-EG')} محكوم
                  </span>
                </div>
              )
            })}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500 inline-block"></span>صحيح</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block"></span>حسن</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-400 inline-block"></span>ضعيف</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-200 inline-block"></span>غير محكوم</span>
          </div>
        </div>

      </main>
    </div>
  )
}
