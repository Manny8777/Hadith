import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'أحاديث منفردة بكتاب — جامع خادم الحرمين' }

interface BookStat {
  id: number
  name: string
  exclusive_count: number
  total_count: number
  exclusive_pct: number
}

interface HadithRow {
  hadith_id: number
  hadith_text: string
  chapter_name: string | null
  companion_name: string | null
  chain_count: number
  judgment_text: string | null
}

export default async function ExclusiveHadithsPage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string; page?: string }>
}) {
  const sp = await searchParams
  const selectedBook = parseInt(sp.book || '0') || null
  const page = Math.max(1, parseInt(sp.page || '1'))
  const pageSize = 25
  const offset = (page - 1) * pageSize

  const [booksRes, haditshRes] = await Promise.all([
    pool.query<BookStat>(
      `SELECT
         b.id,
         b.title AS name,
         COUNT(DISTINCT ht.main_id) FILTER (WHERE NOT EXISTS (
           SELECT 1 FROM takhrij t WHERE t.hadith_id = ht.main_id AND t.book_id != b.id
         ))::int AS exclusive_count,
         COUNT(DISTINCT ht.main_id)::int AS total_count,
         ROUND(COUNT(DISTINCT ht.main_id) FILTER (WHERE NOT EXISTS (
           SELECT 1 FROM takhrij t WHERE t.hadith_id = ht.main_id AND t.book_id != b.id
         )) * 100.0
               / NULLIF(COUNT(DISTINCT ht.main_id), 0), 1)::float AS exclusive_pct
       FROM books b
       JOIN hadith_toc ht ON ht.book_id = b.id AND ht.is_leaf = true AND ht.is_paragraph = true
       GROUP BY b.id, b.title
       HAVING COUNT(DISTINCT ht.main_id) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM takhrij t WHERE t.hadith_id = ht.main_id AND t.book_id != b.id
       )) > 0
       ORDER BY exclusive_count DESC
       LIMIT 50`
    ).catch(() => ({ rows: [] as BookStat[] })),

    selectedBook ? pool.query<HadithRow>(
      `SELECT
         ht.main_id AS hadith_id,
         LEFT(ht.tarf, 280) AS hadith_text,
         ht.chapter_text AS chapter_name,
         (SELECT n.name FROM isnad_chains ic
          JOIN isnad_hadiths ih ON ih.isnad_id = ic.id AND ih.hadith_id = ht.main_id
          JOIN narrators n ON n.id = ic.narrator_id_array[1]
          WHERE n.is_companion = true LIMIT 1) AS companion_name,
         (SELECT COUNT(DISTINCT ic.id)::int FROM isnad_chains ic
          JOIN isnad_hadiths ih ON ih.isnad_id = ic.id WHERE ih.hadith_id = ht.main_id) AS chain_count,
         (SELECT hj.say_text FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id LIMIT 1) AS judgment_text
       FROM hadith_toc ht
       WHERE ht.book_id = $1
         AND ht.is_leaf = true AND ht.is_paragraph = true
         AND NOT EXISTS (
           SELECT 1 FROM takhrij t WHERE t.hadith_id = ht.main_id AND t.book_id != $1
         )
       ORDER BY ht.main_id
       LIMIT $2 OFFSET $3`,
      [selectedBook, pageSize, offset]
    ).catch(() => ({ rows: [] as HadithRow[] })) : Promise.resolve({ rows: [] as HadithRow[] }),
  ])

  const books = booksRes.rows
  const hadiths = haditshRes.rows
  const selectedBookInfo = selectedBook ? books.find(b => b.id === selectedBook) : null
  const maxExclusive = Math.max(...books.map(b => b.exclusive_count), 1)

  function judgmentColor(j: string | null) {
    if (!j) return 'text-gray-400'
    if (/صحيح/.test(j)) return 'text-green-700 bg-green-50 border-green-100'
    if (/حسن/.test(j))  return 'text-blue-700 bg-blue-50 border-blue-100'
    if (/ضعيف/.test(j)) return 'text-red-600 bg-red-50 border-red-100'
    return 'text-gray-500 bg-gray-50 border-gray-100'
  }

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الأحاديث المنفردة بكتاب</h1>
        <p className="text-sm text-gray-500">
          أحاديث لم تُروَ إلا في كتاب واحد ولم تَرِد في غيره — تكشف المادة الفريدة التي ينفرد بها كل مصنَّف
        </p>
      </div>

      {/* Book list */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-5">
        <div className="bg-green-50 px-4 py-2 border-b border-gray-100 text-xs text-green-800 font-medium">
          الكتب — مرتَّبة بعدد الأحاديث المنفردة
        </div>
        <div className="divide-y divide-gray-50">
          {books.map(b => (
            <div key={b.id}
              className={`px-4 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors ${selectedBook === b.id ? 'bg-green-50' : ''}`}>
              <a href={`/books/exclusive-hadiths?book=${b.id}`} className="flex items-center gap-3 flex-1">
                <span className={`text-sm hover:underline font-medium ${selectedBook === b.id ? 'text-green-900' : 'text-gray-700'}`}>
                  {b.name}
                </span>
                <div className="flex-1 bg-gray-100 rounded-full h-2 max-w-32 hidden sm:block">
                  <div className="bg-green-500 h-2 rounded-full"
                    style={{ width: `${(b.exclusive_count / maxExclusive) * 100}%` }} />
                </div>
                <span className="text-xs text-green-700 font-medium shrink-0">
                  {b.exclusive_count.toLocaleString('ar-EG')} منفرد
                </span>
                <span className="text-xs text-gray-400 shrink-0">
                  {b.exclusive_pct}% من {b.total_count.toLocaleString('ar-EG')}
                </span>
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Selected book hadiths */}
      {selectedBook && selectedBookInfo && (
        <>
          <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 mb-4">
            <h2 className="font-bold text-green-900">
              {selectedBookInfo.name} — {selectedBookInfo.exclusive_count.toLocaleString('ar-EG')} حديث منفرد
            </h2>
            <p className="text-xs text-green-700 mt-0.5">
              {selectedBookInfo.exclusive_pct}% من أحاديث الكتاب البالغة {selectedBookInfo.total_count.toLocaleString('ar-EG')} حديث — هذه أحاديث لا يُغني عنه فيها أي مصدر آخر
            </p>
          </div>

          <div className="space-y-3">
            {hadiths.map(h => (
              <div key={h.hadith_id}
                className="bg-white rounded-xl border border-gray-100 p-4 hover:border-green-200 hover:shadow-sm transition-all">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {h.chapter_name && <span className="text-xs text-gray-400">{h.chapter_name}</span>}
                  {h.companion_name && (
                    <span className="text-xs bg-amber-50 text-amber-800 border border-amber-100 px-2 py-0.5 rounded-full">
                      {h.companion_name}
                    </span>
                  )}
                  {h.judgment_text && (
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${judgmentColor(h.judgment_text)}`}>
                      {h.judgment_text.slice(0, 40)}
                    </span>
                  )}
                  <span className="text-xs text-gray-300 mr-auto">{h.chain_count} سند</span>
                </div>
                <p className="text-sm text-gray-900 leading-relaxed mb-2">
                  {h.hadith_text}{h.hadith_text?.length === 280 && '...'}
                </p>
                <div className="flex gap-3 text-xs">
                  <Link href={`/hadith/${h.hadith_id}`} className="text-green-700 hover:underline">تفاصيل ←</Link>
                  <Link href={`/hadith/${h.hadith_id}/research-report`} className="text-blue-600 hover:underline">تقرير ←</Link>
                  <Link href={`/hadith/${h.hadith_id}/chain-weakness`} className="text-red-600 hover:underline">الحلقات ←</Link>
                </div>
              </div>
            ))}

            {hadiths.length === 0 && (
              <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
                لا توجد أحاديث منفردة لهذا الكتاب
              </div>
            )}
          </div>

          {(hadiths.length === pageSize || page > 1) && (
            <div className="flex gap-2 mt-5 justify-center">
              {page > 1 && (
                <a href={`/books/exclusive-hadiths?book=${selectedBook}&page=${page - 1}`}
                  className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">
                  ← السابق
                </a>
              )}
              <span className="text-sm text-gray-400 self-center">صفحة {page.toLocaleString('ar-EG')}</span>
              {hadiths.length === pageSize && (
                <a href={`/books/exclusive-hadiths?book=${selectedBook}&page=${page + 1}`}
                  className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">
                  التالي →
                </a>
              )}
            </div>
          )}
        </>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/books" className="text-green-700 hover:underline">← الكتب</Link>
        <Link href="/books/uniqueness" className="text-green-700 hover:underline">← تفرد الكتب</Link>
        <Link href="/books/transmission-genealogy" className="text-green-700 hover:underline">← تداخل الكتب</Link>
      </div>
    </div>
  )
}
