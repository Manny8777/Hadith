import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'تاريخية تدوين الحديث — جامع خادم الحرمين' }

interface BookRow {
  id: number
  title: string
  takhrij_author: string | null
  takhrij_death: number | null
  hadith_count: number
  fame: number | null
}

export default async function BooksTimelinePage() {
  const { rows } = await pool.query<BookRow>(
    `SELECT b.id, b.title, b.takhrij_author, b.takhrij_death, b.fame,
            COUNT(h.main_id)::int AS hadith_count
     FROM books b
     LEFT JOIN hadith_toc h ON h.book_id = b.id AND h.is_leaf = true AND h.is_paragraph = true
     WHERE b.takhrij_death IS NOT NULL
     GROUP BY b.id, b.title, b.takhrij_author, b.takhrij_death, b.fame
     ORDER BY b.takhrij_death, hadith_count DESC`
  ).catch(() => ({ rows: [] }))

  // Group by century
  const centuries: Record<number, BookRow[]> = {}
  for (const book of rows) {
    const century = Math.floor((book.takhrij_death || 0) / 100) * 100
    if (!centuries[century]) centuries[century] = []
    centuries[century].push(book)
  }

  const sortedCenturies = Object.keys(centuries).map(Number).sort((a, b) => a - b)

  function centuryLabel(c: number): string {
    const n = Math.floor(c / 100) + 1
    const labels: Record<number, string> = {
      1: 'الأول', 2: 'الثاني', 3: 'الثالث', 4: 'الرابع', 5: 'الخامس',
      6: 'السادس', 7: 'السابع', 8: 'الثامن', 9: 'التاسع', 10: 'العاشر',
      11: 'الحادي عشر', 12: 'الثاني عشر', 13: 'الثالث عشر', 14: 'الرابع عشر',
    }
    return `القرن ${labels[n] || n} الهجري (${c}–${c + 99} هـ)`
  }

  const maxInCentury = Math.max(...sortedCenturies.map(c => centuries[c].length))

  // Books without death year
  const undated = await pool.query<BookRow>(
    `SELECT b.id, b.title, b.takhrij_author, b.takhrij_death, b.fame,
            COUNT(h.main_id)::int AS hadith_count
     FROM books b
     LEFT JOIN hadith_toc h ON h.book_id = b.id AND h.is_leaf = true AND h.is_paragraph = true
     WHERE b.takhrij_death IS NULL
     GROUP BY b.id, b.title, b.takhrij_author, b.takhrij_death, b.fame
     ORDER BY b.title`
  ).catch(() => ({ rows: [] }))

  return (
    <div dir="rtl">
      <div className="mb-6">
        <Link href="/books" className="text-sm text-green-700 hover:underline">← الكتب</Link>
        <h1 className="text-2xl font-bold text-green-900 mt-2 mb-1">تاريخية تدوين الحديث</h1>
        <p className="text-sm text-gray-500">
          نشأة كتب الحديث وتطورها عبر القرون — يُتيح فهم السياق الزمني لكل مصدر ومكانته في الحقبة التي دُوِّن فيها
        </p>
      </div>

      {/* Summary */}
      <div className="bg-green-900 text-white rounded-2xl p-5 mb-6">
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-4 text-center text-sm">
          <div>
            <div className="text-2xl font-bold text-amber-300">{rows.length}</div>
            <div className="text-green-200 text-xs mt-0.5">كتاب مؤرَّخ</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-300">{undated.rows.length}</div>
            <div className="text-green-200 text-xs mt-0.5">كتاب غير مؤرَّخ</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-300">{sortedCenturies.length}</div>
            <div className="text-green-200 text-xs mt-0.5">قرن هجري</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-300">
              {rows.length > 0 ? Math.min(...rows.map(r => r.takhrij_death || 9999)) : '—'}
            </div>
            <div className="text-green-200 text-xs mt-0.5">أقدم كتاب (هـ)</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-300">
              {rows.length > 0 ? Math.max(...rows.map(r => r.takhrij_death || 0)) : '—'}
            </div>
            <div className="text-green-200 text-xs mt-0.5">أحدث كتاب (هـ)</div>
          </div>
        </div>
      </div>

      {/* Century timeline */}
      <div className="space-y-6">
        {sortedCenturies.map(c => {
          const books = centuries[c]
          const widthPct = maxInCentury > 0 ? Math.round((books.length / maxInCentury) * 100) : 0
          return (
            <div key={c} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="bg-green-50 border-b border-green-100 px-5 py-3 flex items-center gap-4">
                <h2 className="font-bold text-green-900 text-base flex-1">{centuryLabel(c)}</h2>
                <div className="flex items-center gap-3">
                  <div className="h-2 w-32 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${widthPct}%` }} />
                  </div>
                  <span className="text-sm text-green-700 font-semibold shrink-0">{books.length} كتاب</span>
                </div>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {books.map(b => (
                    <Link
                      key={b.id}
                      href={`/books/${b.id}`}
                      className={`flex items-start gap-3 p-3 rounded-xl border transition-all hover:shadow-sm group ${
                        b.fame && b.fame >= 4 ? 'bg-amber-50 border-amber-200 hover:border-amber-400' :
                        'bg-white border-gray-100 hover:border-green-300'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold leading-snug group-hover:underline ${b.fame && b.fame >= 4 ? 'text-amber-900' : 'text-green-900'}`}>
                          {b.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {b.takhrij_author && (
                            <span className="text-xs text-gray-500">{b.takhrij_author}</span>
                          )}
                          {b.takhrij_death && (
                            <span className="text-xs text-gray-400">ت.{b.takhrij_death}</span>
                          )}
                        </div>
                        {b.hadith_count > 0 && (
                          <span className="text-xs text-gray-400 mt-0.5 block">
                            {b.hadith_count.toLocaleString('ar-EG')} حديث
                          </span>
                        )}
                      </div>
                      {b.fame && b.fame >= 4 && (
                        <span className="text-amber-400 text-lg shrink-0" title="مصدر رئيسي">★</span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )
        })}

        {/* Undated books */}
        {undated.rows.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-100 px-5 py-3">
              <h2 className="font-bold text-gray-700 text-base">كتب غير محددة التاريخ</h2>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {undated.rows.map(b => (
                <Link key={b.id} href={`/books/${b.id}`}
                  className="flex items-start gap-2 p-3 rounded-xl border border-gray-100 hover:border-green-200 hover:shadow-sm transition-all group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-green-900 leading-snug group-hover:underline">{b.title}</p>
                    {b.takhrij_author && <span className="text-xs text-gray-400">{b.takhrij_author}</span>}
                    {b.hadith_count > 0 && (
                      <span className="text-xs text-gray-400 block mt-0.5">{b.hadith_count.toLocaleString('ar-EG')} حديث</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-700">
        <strong>الكتب المميزة بـ ★</strong> هي المصادر ذات الشهرة العالية في قاعدة البيانات — الكتب الستة والمسانيد الكبرى وما في حكمها.
        الترتيب حسب تاريخ وفاة المصنف.
      </div>
    </div>
  )
}
