import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'زوائد الرواة عن المصنفين — جامع خادم الحرمين' }

interface BookPairRow {
  source_book: number
  source_title: string
  target_book: number
  target_title: string
  shared_hadiths: number
}

interface BookGroupRow {
  book_id: number
  title: string
  takhrij_author: string | null
  total_hadiths: number
  groups: number
}

interface SummaryRow {
  total_groups: number
  books_covered: number
}

function overlapColor(n: number) {
  if (n >= 500) return 'bg-purple-100 text-purple-800'
  if (n >= 200) return 'bg-indigo-100 text-indigo-700'
  if (n >= 100) return 'bg-green-100 text-green-700'
  if (n >= 30)  return 'bg-amber-100 text-amber-700'
  return 'bg-gray-100 text-gray-600'
}

function groupsColor(n: number) {
  if (n >= 2000) return 'bg-purple-100 text-purple-800'
  if (n >= 1000) return 'bg-indigo-100 text-indigo-700'
  if (n >= 500)  return 'bg-green-100 text-green-700'
  if (n >= 100)  return 'bg-amber-100 text-amber-700'
  return 'bg-gray-100 text-gray-600'
}

export default async function NarratorAdditionsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; min_shared?: string }>
}) {
  const sp = await searchParams
  const view = sp.view === 'books' ? 'books' : 'pairs'
  const minShared = Math.max(5, parseInt(sp.min_shared || '10'))

  // Run both queries + summary in parallel; fall back gracefully on error
  const [pairsRes, booksRes, summaryRes] = await Promise.all([
    // Main complex query: book-pair overlap via shared group_ids
    pool.query<BookPairRow>(
      `WITH group_books AS (
         SELECT t.group_id, t.book_id, b.title
         FROM takhrij t
         JOIN books b ON b.id = t.book_id
         WHERE t.group_id IS NOT NULL
         GROUP BY t.group_id, t.book_id, b.title
       ),
       book_pairs AS (
         SELECT a.book_id  AS source_book,
                a.title    AS source_title,
                b.book_id  AS target_book,
                b.title    AS target_title,
                COUNT(*)::int AS shared_hadiths
         FROM group_books a
         JOIN group_books b
           ON b.group_id = a.group_id
          AND b.book_id  > a.book_id
         GROUP BY a.book_id, a.title, b.book_id, b.title
         HAVING COUNT(*) >= $1
         ORDER BY shared_hadiths DESC
         LIMIT 60
       )
       SELECT * FROM book_pairs`,
      [minShared]
    ).catch(() => ({ rows: [] as BookPairRow[] })),

    // Fallback / complementary: per-book group counts
    pool.query<BookGroupRow>(
      `SELECT t.book_id,
              b.title,
              b.takhrij_author,
              COUNT(DISTINCT t.hadith_id)::int   AS total_hadiths,
              COUNT(DISTINCT t.group_id)::int     AS groups
       FROM takhrij t
       JOIN books b ON b.id = t.book_id
       WHERE t.group_id IS NOT NULL
       GROUP BY t.book_id, b.title, b.takhrij_author
       ORDER BY groups DESC
       LIMIT 25`
    ).catch(() => ({ rows: [] as BookGroupRow[] })),

    // Summary stats
    pool.query<SummaryRow>(
      `SELECT COUNT(DISTINCT group_id)::int   AS total_groups,
              COUNT(DISTINCT book_id)::int     AS books_covered
       FROM takhrij
       WHERE group_id IS NOT NULL`
    ).catch(() => ({ rows: [{ total_groups: 0, books_covered: 0 }] })),
  ])

  const pairs       = pairsRes.rows
  const books       = booksRes.rows
  const summary     = summaryRes.rows[0] ?? { total_groups: 0, books_covered: 0 }
  const maxShared   = pairs.length ? Math.max(...pairs.map(p => p.shared_hadiths)) : 1
  const maxGroups   = books.length ? Math.max(...books.map(b => b.groups)) : 1

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('view', view)
    p.set('min_shared', String(minShared))
    Object.entries(overrides).forEach(([k, v]) => p.set(k, v))
    return `/hadiths/narrator-additions?${p.toString()}`
  }

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">
          زوائد الرواة عن المصنفين
        </h1>
        <p className="text-sm text-gray-500 mb-4">
          الأحاديث التي رواها الرواة بأسانيد متعددة تتجاوز ما دوّنه أصحاب الكتب في مصنفاتهم
        </p>

        {/* Concept explanation box */}
        <div className="bg-green-50 border border-green-100 rounded-xl p-4 mb-5 text-sm text-green-900 leading-relaxed">
          <p className="font-semibold text-green-800 mb-1">ما هي الزوائد في علم الحديث؟</p>
          <p className="text-sm leading-relaxed mb-2">
            <span className="font-medium">الزيادة</span> هي الحديث الذي يوجد في كتاب دون آخر من نفس المجموعة المقارَنة —
            فزوائد ابن ماجه مثلاً هي الأحاديث التي انفرد بها عن بقية الكتب الستة.
            أما <span className="font-medium">زوائد الرواة عن المصنفين</span> فتعني تلك الأحاديث التي تشترك
            في نفس المتن (group_id) عبر روايات رواة متعددين في كتب مختلفة —
            مما يكشف عن مدى انتشار الحديث عبر طرق الرواية.
          </p>
          <p className="text-xs text-green-700">
            المنهج المتبع هنا: ربط الأحاديث ذات نفس <span className="font-mono bg-green-100 px-1 rounded">group_id</span> عبر الكتب المختلفة،
            ليظهر عدد الأحاديث المشتركة بين كل كتابَين — دليل على تداخل الأسانيد وتشابك روايات الرواة.
          </p>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <div className="text-xl font-bold text-green-900">
              {summary.total_groups.toLocaleString('ar-EG')}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">مجموعة روائية</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <div className="text-xl font-bold text-green-900">
              {summary.books_covered.toLocaleString('ar-EG')}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">كتاب مغطى</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <div className="text-xl font-bold text-indigo-700">
              {pairs.length.toLocaleString('ar-EG')}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">زوج كتب مشترك</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <div className="text-xl font-bold text-amber-700">
              {pairs.length ? pairs[0].shared_hadiths.toLocaleString('ar-EG') : '—'}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">أعلى تداخل (حديث)</div>
          </div>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">العرض:</span>
          <Link
            href={buildUrl({ view: 'pairs' })}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              view === 'pairs'
                ? 'bg-green-900 text-white border-green-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
            }`}
          >
            أزواج الكتب المتشاركة
          </Link>
          <Link
            href={buildUrl({ view: 'books' })}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              view === 'books'
                ? 'bg-green-900 text-white border-green-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
            }`}
          >
            الكتب وعدد مجموعاتها
          </Link>
        </div>

        {/* Min shared filter (only for pairs view) */}
        {view === 'pairs' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">الحد الأدنى للتشارك:</span>
            {[5, 10, 30, 50, 100, 200].map(n => (
              <Link
                key={n}
                href={buildUrl({ min_shared: String(n) })}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  minShared === n
                    ? 'bg-green-800 text-white border-green-800'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
                }`}
              >
                {n}+ حديث
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Pairs view */}
      {view === 'pairs' && (
        <>
          {pairs.length === 0 ? (
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-8 text-center text-gray-500">
              <p>لا توجد نتائج بهذا الحد الأدنى</p>
              <p className="text-xs mt-2 text-gray-400">جرّب تخفيض الحد الأدنى للتشارك</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-6">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-green-900 text-sm">
                  تشارك الأحاديث بين أزواج الكتب
                </h2>
                <span className="text-xs text-gray-400">
                  {pairs.length.toLocaleString('ar-EG')} زوج
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[580px]">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-500">
                      <th className="text-right py-2.5 pr-4 pl-2 font-medium w-8">#</th>
                      <th className="text-right py-2.5 px-2 font-medium">الكتاب الأول</th>
                      <th className="text-right py-2.5 px-2 font-medium">الكتاب الثاني</th>
                      <th className="text-center py-2.5 px-2 font-medium">الأحاديث المشتركة</th>
                      <th className="text-right py-2.5 pl-4 pr-2 font-medium hidden sm:table-cell">
                        النسبة من الأعلى
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {pairs.map((pair, idx) => {
                      const barPct = Math.round((pair.shared_hadiths / maxShared) * 100)
                      return (
                        <tr
                          key={`${pair.source_book}-${pair.target_book}`}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <td className="py-3 pr-4 pl-2 text-xs text-gray-300 tabular-nums">
                            {(idx + 1).toLocaleString('ar-EG')}
                          </td>
                          <td className="py-3 px-2">
                            <Link
                              href={`/books/${pair.source_book}`}
                              className="font-medium text-green-800 hover:underline text-sm leading-snug"
                            >
                              {pair.source_title}
                            </Link>
                          </td>
                          <td className="py-3 px-2">
                            <Link
                              href={`/books/${pair.target_book}`}
                              className="font-medium text-green-800 hover:underline text-sm leading-snug"
                            >
                              {pair.target_title}
                            </Link>
                          </td>
                          <td className="py-3 px-2 text-center">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${overlapColor(pair.shared_hadiths)}`}>
                              {pair.shared_hadiths.toLocaleString('ar-EG')}
                            </span>
                          </td>
                          <td className="py-3 pl-4 pr-2 hidden sm:table-cell">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden min-w-[80px]">
                                <div
                                  className="bg-green-600 h-2 rounded-full"
                                  style={{ width: `${barPct}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-400 tabular-nums w-8">
                                {barPct}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Color legend */}
          <div className="flex items-center gap-3 mb-4 flex-wrap text-xs">
            <span className="text-gray-500">مستوى التشارك:</span>
            {[
              { label: '500+ حديث',   cls: 'bg-purple-100 text-purple-800' },
              { label: '200-499',     cls: 'bg-indigo-100 text-indigo-700' },
              { label: '100-199',     cls: 'bg-green-100 text-green-700' },
              { label: '30-99',       cls: 'bg-amber-100 text-amber-700' },
              { label: 'أقل من 30',  cls: 'bg-gray-100 text-gray-600' },
            ].map(l => (
              <span key={l.label} className={`px-2 py-0.5 rounded-full ${l.cls}`}>
                {l.label}
              </span>
            ))}
          </div>
        </>
      )}

      {/* Books view */}
      {view === 'books' && (
        <>
          {books.length === 0 ? (
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-8 text-center text-gray-500">
              لا توجد بيانات
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-6">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-green-900 text-sm">
                  الكتب وعدد المجموعات الروائية
                </h2>
                <span className="text-xs text-gray-400">
                  أعلى {books.length} كتاباً
                </span>
              </div>

              <div className="divide-y divide-gray-50">
                {books.map((book, idx) => {
                  const barPct = Math.round((book.groups / maxGroups) * 100)
                  const overlapPct = book.total_hadiths > 0
                    ? Math.round((book.groups / book.total_hadiths) * 100)
                    : 0
                  return (
                    <div
                      key={book.book_id}
                      className="px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-300 tabular-nums">
                              {(idx + 1).toLocaleString('ar-EG')}
                            </span>
                            <Link
                              href={`/books/${book.book_id}`}
                              className="font-semibold text-green-900 hover:underline text-sm"
                            >
                              {book.title}
                            </Link>
                          </div>
                          {book.takhrij_author && (
                            <div className="text-xs text-gray-400 mt-0.5 mr-5">
                              {book.takhrij_author}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${groupsColor(book.groups)}`}>
                            {book.groups.toLocaleString('ar-EG')} مجموعة
                          </span>
                          <span className="text-xs text-gray-400">
                            {book.total_hadiths.toLocaleString('ar-EG')} حديث
                          </span>
                          {overlapPct > 0 && (
                            <span className="text-xs bg-amber-50 border border-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                              {overlapPct}% متداخل
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mr-5">
                        <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                          <div
                            className="bg-green-600 h-2.5 rounded-full"
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 tabular-nums w-8">
                          {barPct}%
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-800 mb-4">
            <span className="font-semibold">تفسير النسبة المتداخلة: </span>
            نسبة الأحاديث ذات group_id من إجمالي أحاديث الكتاب —
            كلما ارتفعت النسبة، كانت روايات الكتاب أكثر ارتباطاً بمسارات روائية مشتركة مع كتب أخرى.
          </div>
        </>
      )}

      {/* Footer links */}
      <div className="mt-4 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/in-all-six"    className="text-green-700 hover:underline">← في الكتب الستة</Link>
        <Link href="/books/intersection"     className="text-green-700 hover:underline">← تقاطع الكتب</Link>
        <Link href="/books/uniqueness"       className="text-green-700 hover:underline">← تفرد الكتب</Link>
        <Link href="/hadiths/most-attested"  className="text-green-700 hover:underline">← الأوسع انتشاراً</Link>
      </div>
    </div>
  )
}
