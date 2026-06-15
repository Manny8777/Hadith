import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'تغطية تراجم الرواة — جامع خادم الحرمين' }

interface BookCoverage {
  book_id: number
  book_name: string
  book_death: number | null
  total_narrators: number
  with_biography: number
  with_criticism: number
  with_grade: number
  coverage_pct: number
  unrated_count: number
}

interface UncoveredNarrator {
  id: number
  name: string
  abb_name: string | null
  chain_count: number
  hadith_count: number
  book_name: string
}

export default async function NarratorCoveragePage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string; view?: string }>
}) {
  const sp = await searchParams
  const bookFilter = parseInt(sp.book || '0')
  const view = sp.view || 'books'

  const [booksRes, uncoveredRes] = await Promise.all([
    pool.query<BookCoverage>(
      `SELECT
         b.id AS book_id,
         b.title AS book_name,
         b.takhrij_death AS book_death,
         COUNT(DISTINCT nar_id)::int AS total_narrators,
         COUNT(DISTINCT nar_id) FILTER (
           WHERE EXISTS (SELECT 1 FROM narrator_biography nb WHERE nb.narrator_id = nar_id)
         )::int AS with_biography,
         COUNT(DISTINCT nar_id) FILTER (
           WHERE EXISTS (SELECT 1 FROM narrator_criticism nc WHERE nc.narrator_id = nar_id)
         )::int AS with_criticism,
         COUNT(DISTINCT nar_id) FILTER (
           WHERE EXISTS (SELECT 1 FROM narrators nf WHERE nf.id = nar_id AND nf.martaba_ibn_hajar IS NOT NULL)
         )::int AS with_grade,
         COUNT(DISTINCT nar_id) FILTER (
           WHERE NOT EXISTS (SELECT 1 FROM narrator_biography nb WHERE nb.narrator_id = nar_id)
         )::int AS unrated_count,
         ROUND(100.0 * COUNT(DISTINCT nar_id) FILTER (
           WHERE EXISTS (SELECT 1 FROM narrator_biography nb WHERE nb.narrator_id = nar_id)
         ) / NULLIF(COUNT(DISTINCT nar_id), 0), 1) AS coverage_pct
       FROM books b
       JOIN hadith_toc ht ON ht.book_id = b.id
       JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
       JOIN isnad_chains ic ON ic.id = ih.isnad_id,
       unnest(ic.narrator_id_array) AS nar_id
       GROUP BY b.id, b.title, b.takhrij_death
       HAVING COUNT(DISTINCT nar_id) >= 5
       ORDER BY coverage_pct DESC`
    ).catch(() => ({ rows: [] as BookCoverage[] })),

    bookFilter > 0 ? pool.query<UncoveredNarrator>(
      `SELECT DISTINCT
              n.id, n.name, n.abb_name,
              COUNT(DISTINCT ic.id)::int AS chain_count,
              COUNT(DISTINCT ih.hadith_id)::int AS hadith_count,
              b.title AS book_name
       FROM narrators n
       JOIN isnad_chains ic ON n.id = ANY(ic.narrator_id_array)
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       JOIN books b ON b.id = ht.book_id AND b.id = $1
       WHERE NOT EXISTS (SELECT 1 FROM narrator_biography nb WHERE nb.narrator_id = n.id)
         AND n.is_companion IS NOT TRUE
       GROUP BY n.id, n.name, n.abb_name, b.title
       ORDER BY chain_count DESC
       LIMIT 50`,
      [bookFilter]
    ).catch(() => ({ rows: [] as UncoveredNarrator[] })) : Promise.resolve({ rows: [] as UncoveredNarrator[] }),
  ])

  const books = booksRes.rows
  const uncovered = uncoveredRes.rows
  const maxNarrators = Math.max(...books.map(b => b.total_narrators), 1)

  function coverageColor(pct: number) {
    if (pct >= 80) return 'text-green-700 bg-green-50'
    if (pct >= 60) return 'text-blue-700 bg-blue-50'
    if (pct >= 40) return 'text-amber-700 bg-amber-50'
    return 'text-red-700 bg-red-50'
  }

  function coverageBar(pct: number) {
    if (pct >= 80) return 'bg-green-400'
    if (pct >= 60) return 'bg-blue-400'
    if (pct >= 40) return 'bg-amber-400'
    return 'bg-red-400'
  }

  const selectedBook = books.find(b => b.book_id === bookFilter)

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">تغطية تراجم الرواة</h1>
        <p className="text-sm text-gray-500 mb-3">
          نسبة الرواة في كل كتاب الذين لديهم ترجمة في كتب التراجم — يكشف الثغرات البحثية في توثيق سلاسل الرواة
        </p>
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 text-xs text-blue-700">
          رواة مرتفعة التغطية = أغلب رواتها موثَّقون في كتب التراجم الكلاسيكية المتوفرة في قاعدة البيانات
        </div>
      </div>

      {/* Book list */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-4">
        <div className="divide-y divide-gray-50">
          {books.map(b => (
            <div key={b.book_id}
              className={`px-4 py-3 hover:bg-gray-50 transition-colors ${bookFilter === b.book_id ? 'bg-blue-50' : ''}`}>
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <a href={`/narrators/coverage?book=${b.book_id}`}
                      className="font-semibold text-green-900 hover:underline text-sm">
                      {b.book_name}
                    </a>
                    {b.book_death && (
                      <span className="text-xs text-gray-400">ت {b.book_death}هـ</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-2 max-w-48">
                      <div className={`h-2 rounded-full ${coverageBar(b.coverage_pct)}`}
                        style={{ width: `${b.coverage_pct}%` }} />
                    </div>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${coverageColor(b.coverage_pct)}`}>
                      {b.coverage_pct}%
                    </span>
                  </div>
                </div>
                <div className="text-right text-xs text-gray-400 shrink-0">
                  <div>{b.total_narrators} راوٍ</div>
                  <div className="text-red-500">{b.unrated_count} بلا ترجمة</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Uncovered narrators for selected book */}
      {bookFilter > 0 && selectedBook && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="bg-red-50 px-4 py-3 border-b border-gray-100 rounded-t-xl">
            <h2 className="font-bold text-red-900 text-sm">
              رواة {selectedBook.book_name} بلا ترجمة ({uncovered.length})
            </h2>
            <p className="text-xs text-red-700 mt-0.5">
              هؤلاء الرواة يظهرون في أسانيد هذا الكتاب دون أن تُسجَّل لهم ترجمة في قاعدة البيانات
            </p>
          </div>
          <div className="divide-y divide-gray-50">
            {uncovered.map(n => (
              <div key={n.id} className="px-4 py-2.5 flex items-center gap-3">
                <Link href={`/narrator/${n.id}`}
                  className="flex-1 text-sm text-red-900 hover:underline font-medium">
                  {n.name}
                </Link>
                <span className="text-xs text-gray-400">
                  {n.chain_count} سند
                </span>
                <Link href={`/narrator/${n.id}`}
                  className="text-xs text-gray-400 hover:text-gray-600">←</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {books.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
          جاري تحميل البيانات...
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators/unrated" className="text-green-700 hover:underline">← الرواة غير المقيَّمين</Link>
        <Link href="/bio-search" className="text-green-700 hover:underline">← بحث التراجم</Link>
        <Link href="/books/authenticity" className="text-green-700 hover:underline">← جودة أسانيد الكتب</Link>
      </div>
    </div>
  )
}
