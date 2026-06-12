export const dynamic = 'force-dynamic'

import Link from 'next/link'
import pool from '@/lib/db'
import { notFound } from 'next/navigation'

interface SearchParams {
  book?: string
  depth?: string
  page?: string
}

const DEPTH_LABELS: Record<number, string> = {
  2: 'ثنائيات',
  3: 'ثلاثيات',
  4: 'رباعيات',
  5: 'خماسيات',
  6: 'سداسيات',
  7: 'سباعيات',
  8: 'ثمانيات',
  9: 'تساعيات',
  10: 'عشاريات',
}

const BOOKS = [
  { id: 1, name: 'صحيح البخاري' },
  { id: 2, name: 'صحيح مسلم' },
  { id: 3, name: 'سنن أبي داود' },
  { id: 4, name: 'جامع الترمذي' },
  { id: 5, name: 'سنن النسائي' },
  { id: 6, name: 'سنن ابن ماجه' },
  { id: 7, name: 'موطأ مالك' },
  { id: 8, name: 'مسند أحمد' },
]

function stripTags(html: string): string {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export default async function ChainsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const bookId = sp.book ? parseInt(sp.book, 10) : null
  const depth = sp.depth ? parseInt(sp.depth, 10) : null
  const page = Math.max(1, parseInt(sp.page ?? '1', 10))
  const limit = 30
  const offset = (page - 1) * limit

  // Summary stats per book and depth
  const statsRes = await pool.query(`
    SELECT ht.book_id, b.title as book_title, ic.chain_length, COUNT(DISTINCT ih.hadith_id) as cnt
    FROM isnad_chains ic
    JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
    JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
    JOIN books b ON b.id = ht.book_id
    WHERE ic.chain_length BETWEEN 2 AND 10 AND ht.book_id IN (1,2,3,4,5,6,7,8)
    GROUP BY ht.book_id, b.title, ic.chain_length
    ORDER BY ht.book_id, ic.chain_length
  `)

  // Group stats by book
  type StatRow = { book_id: number; book_title: string; chain_length: number; cnt: number }
  const statsByBook: Record<number, StatRow[]> = {}
  for (const row of statsRes.rows as StatRow[]) {
    if (!statsByBook[row.book_id]) statsByBook[row.book_id] = []
    statsByBook[row.book_id].push(row)
  }

  // Hadiths for selected filter
  let hadiths: Array<{ main_id: number; tarf: string | null; book_title: string; chain_length: number }> = []
  let total = 0
  if (bookId && depth) {
    const [cntRes, dataRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(DISTINCT ih.hadith_id) as cnt
         FROM isnad_chains ic
         JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
         JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
         WHERE ic.chain_length = $1 AND ht.book_id = $2`,
        [depth, bookId]
      ),
      pool.query(
        `SELECT DISTINCT ht.main_id, ht.tarf, b.title as book_title, ic.chain_length
         FROM isnad_chains ic
         JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
         JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
         JOIN books b ON b.id = ht.book_id
         WHERE ic.chain_length = $1 AND ht.book_id = $2
         ORDER BY ht.main_id
         LIMIT $3 OFFSET $4`,
        [depth, bookId, limit, offset]
      ),
    ])
    total = parseInt(cntRes.rows[0]?.cnt || '0')
    hadiths = dataRes.rows
  }

  const totalPages = Math.ceil(total / limit)
  const depthLabel = depth ? (DEPTH_LABELS[depth] || `${depth} رواة`) : ''
  const bookName = BOOKS.find(b => b.id === bookId)?.name || ''

  return (
    <div dir="rtl" className="min-h-screen bg-amber-50">
      <header className="bg-green-900 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-amber-200 hover:text-white text-sm">← الرئيسية</Link>
          <h1 className="text-lg font-bold text-amber-100">علو الإسناد</h1>
          <Link href="/search" className="text-amber-200 hover:text-white text-sm">البحث</Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* Intro */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="text-xl font-bold text-green-900 mb-2">علو الإسناد — تصفح حسب عدد الرواة</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            يُعدّ قِصَر الإسناد من أشرف صفات الحديث؛ فكلما قلّ عدد الرواة بين الجامع والنبي ﷺ كان الإسناد «عالياً».
            الثلاثيات أعلاها درجةً، ثم الرباعيات، وهكذا. ويشتهر موطأ مالك بكثرة ثلاثياته.
          </p>
        </div>

        {/* Stats grid per book */}
        <div className="space-y-4">
          {BOOKS.map(book => {
            const stats = statsByBook[book.id] || []
            if (stats.length === 0) return null
            return (
              <div key={book.id} className="bg-white rounded-2xl border border-gray-100 p-5">
                <Link href={`/books/${book.id}`} className="font-bold text-green-900 hover:underline text-base block mb-3">
                  {book.name}
                </Link>
                <div className="flex flex-wrap gap-2">
                  {stats.map(s => (
                    <Link
                      key={s.chain_length}
                      href={`/chains?book=${book.id}&depth=${s.chain_length}`}
                      className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all hover:shadow-sm ${
                        bookId === book.id && depth === s.chain_length
                          ? 'bg-green-900 text-white border-green-900'
                          : s.chain_length <= 3
                          ? 'bg-green-50 text-green-800 border-green-200 hover:bg-green-100'
                          : s.chain_length <= 5
                          ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {DEPTH_LABELS[s.chain_length] || `${s.chain_length} رواة`}
                      <span className="mr-1 opacity-70">({s.cnt.toLocaleString('ar-EG')})</span>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Hadith list for selected filter */}
        {bookId && depth && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-bold text-green-900 text-lg mb-1">
              {depthLabel} {bookName}
            </h3>
            <p className="text-sm text-gray-400 mb-5">
              {total.toLocaleString('ar-EG')} حديث — {depth} رواة في السند
            </p>

            {hadiths.length === 0 && (
              <p className="text-gray-400 text-center py-8">لا نتائج</p>
            )}

            <div className="space-y-3">
              {hadiths.map(h => (
                <Link
                  key={h.main_id}
                  href={`/hadith/${h.main_id}`}
                  className="block bg-gray-50 rounded-xl border border-gray-100 px-4 py-3 hover:border-green-200 hover:shadow-sm transition-all"
                >
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {stripTags(h.tarf || '').slice(0, 200) || `حديث رقم ${h.main_id}`}
                  </p>
                </Link>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center gap-3 mt-6">
                {page > 1 && (
                  <Link
                    href={`/chains?book=${bookId}&depth=${depth}&page=${page - 1}`}
                    className="px-4 py-2 rounded-lg bg-green-50 text-green-800 border border-green-200 text-sm hover:bg-green-100 transition-colors"
                  >
                    → السابق
                  </Link>
                )}
                <span className="px-4 py-2 text-sm text-gray-500">
                  {page} / {totalPages}
                </span>
                {page < totalPages && (
                  <Link
                    href={`/chains?book=${bookId}&depth=${depth}&page=${page + 1}`}
                    className="px-4 py-2 rounded-lg bg-green-50 text-green-800 border border-green-200 text-sm hover:bg-green-100 transition-colors"
                  >
                    ← التالي
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
