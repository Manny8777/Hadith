export const dynamic = 'force-dynamic'

import Link from 'next/link'
import pool from '@/lib/db'

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

  // Dynamic: get all books with chain data, sorted by total chain hadiths
  const [statsRes, booksRes] = await Promise.all([
    pool.query(`
      SELECT ht.book_id, b.title AS book_title, ic.chain_length,
             COUNT(DISTINCT ih.hadith_id)::int AS cnt
      FROM isnad_chains ic
      JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
      JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
      JOIN books b ON b.id = ht.book_id
      WHERE ic.chain_length BETWEEN 2 AND 10
      GROUP BY ht.book_id, b.title, ic.chain_length
      ORDER BY ht.book_id, ic.chain_length
    `),
    pool.query<{ id: number; title: string; takhrij_author: string | null; total: number }>(
      `SELECT ht.book_id AS id, b.title, b.takhrij_author,
              COUNT(DISTINCT ih.hadith_id)::int AS total
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       JOIN books b ON b.id = ht.book_id
       GROUP BY ht.book_id, b.title, b.takhrij_author
       ORDER BY total DESC`
    ),
  ])

  type StatRow = { book_id: number; book_title: string; chain_length: number; cnt: number }
  const statsByBook: Record<number, StatRow[]> = {}
  for (const row of statsRes.rows as StatRow[]) {
    if (!statsByBook[row.book_id]) statsByBook[row.book_id] = []
    statsByBook[row.book_id].push(row)
  }

  const books = booksRes.rows
  const currentBook = books.find(b => b.id === bookId)

  // Hadiths for selected filter
  let hadiths: Array<{ main_id: number; tarf: string | null; book_title: string; chain_length: number; grade_hint: string | null }> = []
  let total = 0
  if (bookId && depth) {
    const [cntRes, dataRes] = await Promise.all([
      pool.query<{ cnt: number }>(
        `SELECT COUNT(DISTINCT ih.hadith_id)::int AS cnt
         FROM isnad_chains ic
         JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
         JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
         WHERE ic.chain_length = $1 AND ht.book_id = $2`,
        [depth, bookId]
      ),
      pool.query(
        `SELECT DISTINCT ON (ht.main_id) ht.main_id,
                regexp_replace(ht.tarf, '<[^>]+>', ' ', 'g') AS tarf,
                b.title AS book_title, ic.chain_length,
                jg.grade_hint
         FROM isnad_chains ic
         JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
         JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
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
         WHERE ic.chain_length = $1 AND ht.book_id = $2
         ORDER BY ht.main_id
         LIMIT $3 OFFSET $4`,
        [depth, bookId, limit, offset]
      ),
    ])
    total = cntRes.rows[0]?.cnt || 0
    hadiths = dataRes.rows
  }

  const totalPages = Math.ceil(total / limit)
  const depthLabel = depth ? (DEPTH_LABELS[depth] || `${depth} رواة`) : ''

  function gradeClass(g: string | null) {
    if (g === 'صحيح') return 'bg-green-100 text-green-700'
    if (g === 'حسن') return 'bg-amber-100 text-amber-700'
    if (g === 'ضعيف') return 'bg-red-100 text-red-600'
    return ''
  }

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">علو الإسناد</h1>
        <p className="text-sm text-gray-500">
          كلما قلّ عدد الرواة بين الجامع والنبي ﷺ كان الإسناد «عالياً». الثلاثيات أعلاها درجةً.
        </p>
      </div>

      {/* Stats grid per book */}
      <div className="space-y-3 mb-6">
        {books.map(book => {
          const stats = statsByBook[book.id] || []
          if (stats.length === 0) return null
          return (
            <div key={book.id} className={`bg-white rounded-xl border px-4 py-3 transition-colors ${
              bookId === book.id ? 'border-green-300 shadow-sm' : 'border-gray-100'
            }`}>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Link href={`/books/${book.id}`} className="font-bold text-green-900 hover:underline text-sm">
                  {book.title}
                </Link>
                {book.takhrij_author && (
                  <span className="text-xs text-gray-400">{book.takhrij_author}</span>
                )}
                <span className="text-xs text-gray-300 mr-auto">
                  {book.total.toLocaleString('ar-EG')} حديث بإسناد
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {stats.map(s => (
                  <Link
                    key={s.chain_length}
                    href={`/chains?book=${book.id}&depth=${s.chain_length}`}
                    className={`px-3 py-1 rounded-lg border text-xs font-medium transition-all hover:shadow-sm ${
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
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <h2 className="font-bold text-green-900">
              {depthLabel} — {currentBook?.title}
            </h2>
            <span className="text-xs text-gray-400">
              {total.toLocaleString('ar-EG')} حديث — عدد الرواة: {depth}
            </span>
          </div>

          {hadiths.length === 0 && (
            <p className="text-gray-400 text-center py-8">لا نتائج</p>
          )}

          <div className="space-y-2">
            {hadiths.map((h, idx) => (
              <Link
                key={h.main_id}
                href={`/hadith/${h.main_id}`}
                className="flex items-start gap-3 bg-gray-50 rounded-xl border border-gray-100 px-4 py-3 hover:border-green-200 hover:shadow-sm transition-all group"
              >
                <span className="text-xs text-gray-300 mt-0.5 shrink-0">
                  {(offset + idx + 1).toLocaleString('ar-EG')}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {h.grade_hint && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${gradeClass(h.grade_hint)}`}>
                        {h.grade_hint}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed group-hover:text-green-900">
                    {stripTags(h.tarf || '').slice(0, 200) || `حديث رقم ${h.main_id}`}
                  </p>
                </div>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-3 mt-6">
              {page > 1 && (
                <Link href={`/chains?book=${bookId}&depth=${depth}&page=${page - 1}`}
                  className="px-4 py-2 rounded-lg bg-green-50 text-green-800 border border-green-200 text-sm hover:bg-green-100">
                  السابق
                </Link>
              )}
              <span className="px-4 py-2 text-sm text-gray-500">
                {page.toLocaleString('ar-EG')} / {totalPages.toLocaleString('ar-EG')}
              </span>
              {page < totalPages && (
                <Link href={`/chains?book=${bookId}&depth=${depth}&page=${page + 1}`}
                  className="px-4 py-2 rounded-lg bg-green-50 text-green-800 border border-green-200 text-sm hover:bg-green-100">
                  التالي
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/most-attested" className="text-green-700 hover:underline">
          الأحاديث الأوسع انتشاراً →
        </Link>
        <Link href="/hadiths/tarf-index" className="text-green-700 hover:underline">
          فهرس الأطراف الأبجدي →
        </Link>
        <Link href="/unique-hadiths" className="text-green-700 hover:underline">
          الأفراد (الأحاديث الفردة) →
        </Link>
      </div>
    </div>
  )
}
