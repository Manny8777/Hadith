import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface BookCompanion {
  book_id: number
  book_name: string
  companion_id: number
  companion_name: string
  companion_abb: string | null
  hadith_count: number
  chain_count: number
  pct_of_book: number
}

interface BookSummary {
  book_id: number
  book_name: string
  total_hadiths: number
  unique_companions: number
  top_companion: string | null
  top_companion_pct: number
}

export default async function BookCompanionMatrixPage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string; companion?: string; minHadiths?: string }>
}) {
  const sp = await searchParams
  const selectedBook = parseInt(sp.book || '0') || null
  const selectedCompanion = parseInt(sp.companion || '0') || null
  const minHadiths = parseInt(sp.minHadiths || '5')

  const [booksRes, matrixRes] = await Promise.all([
    pool.query<BookSummary>(
      `SELECT
         b.id AS book_id,
         b.title AS book_name,
         COUNT(DISTINCT ht.main_id)::int AS total_hadiths,
         COUNT(DISTINCT ic.narrator_id_array[1])
           FILTER (WHERE (SELECT n.is_companion FROM narrators n WHERE n.id = ic.narrator_id_array[1]))::int AS unique_companions,
         (SELECT n2.name FROM narrators n2
          WHERE n2.id = (
            SELECT ic2.narrator_id_array[1] FROM isnad_chains ic2
            JOIN isnad_hadiths ih2 ON ih2.isnad_id = ic2.id AND ih2.hadith_id = ht2.main_id
            JOIN narrators cn ON cn.id = ic2.narrator_id_array[1] AND cn.is_companion = true
            FROM hadith_toc ht2 WHERE ht2.book_id = b.id
            GROUP BY ic2.narrator_id_array[1] ORDER BY COUNT(*) DESC LIMIT 1
          ) LIMIT 1) AS top_companion,
         ROUND(100.0 * (
           SELECT COUNT(DISTINCT ic3.id) FROM isnad_chains ic3
           JOIN isnad_hadiths ih3 ON ih3.isnad_id = ic3.id
           JOIN hadith_toc ht3 ON ht3.main_id = ih3.hadith_id AND ht3.book_id = b.id
           JOIN narrators cn3 ON cn3.id = ic3.narrator_id_array[1] AND cn3.is_companion = true
           WHERE ic3.narrator_id_array[1] = (
             SELECT ic4.narrator_id_array[1] FROM isnad_chains ic4
             JOIN isnad_hadiths ih4 ON ih4.isnad_id = ic4.id
             JOIN hadith_toc ht4 ON ht4.main_id = ih4.hadith_id AND ht4.book_id = b.id
             JOIN narrators cn4 ON cn4.id = ic4.narrator_id_array[1] AND cn4.is_companion = true
             GROUP BY ic4.narrator_id_array[1] ORDER BY COUNT(*) DESC LIMIT 1
           )
         ) / NULLIF(COUNT(DISTINCT ht.main_id), 0))::int AS top_companion_pct
       FROM books b
       JOIN hadith_toc ht ON ht.book_id = b.id
       LEFT JOIN isnad_chains ic ON ic.id IN (
         SELECT ih.isnad_id FROM isnad_hadiths ih WHERE ih.hadith_id = ht.main_id LIMIT 1
       )
       WHERE ($1::int IS NULL OR b.id = $1)
       GROUP BY b.id, b.title
       HAVING COUNT(DISTINCT ht.main_id) >= 50
       ORDER BY unique_companions DESC
       LIMIT 40`,
      [selectedBook || null]
    ).catch(() => ({ rows: [] as BookSummary[] })),

    (selectedBook || selectedCompanion) ? pool.query<BookCompanion>(
      `SELECT
         b.id AS book_id,
         b.title AS book_name,
         n.id AS companion_id,
         n.name AS companion_name,
         n.abb_name AS companion_abb,
         COUNT(DISTINCT ih.hadith_id)::int AS hadith_count,
         COUNT(DISTINCT ic.id)::int AS chain_count,
         ROUND(100.0 * COUNT(DISTINCT ih.hadith_id) /
           NULLIF((SELECT COUNT(DISTINCT ht2.main_id) FROM hadith_toc ht2 WHERE ht2.book_id = b.id), 0))::int AS pct_of_book
       FROM isnad_chains ic
       JOIN narrators n ON n.id = ic.narrator_id_array[1] AND n.is_companion = true
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       JOIN books b ON b.id = ht.book_id
       WHERE ($1::int IS NULL OR b.id = $1)
         AND ($2::int IS NULL OR n.id = $2)
       GROUP BY b.id, b.title, n.id, n.name, n.abb_name
       HAVING COUNT(DISTINCT ih.hadith_id) >= $3
       ORDER BY b.id, COUNT(DISTINCT ih.hadith_id) DESC`,
      [selectedBook || null, selectedCompanion || null, minHadiths]
    ).catch(() => ({ rows: [] as BookCompanion[] })) : Promise.resolve({ rows: [] as BookCompanion[] }),
  ])

  const books = booksRes.rows
  const matrix = matrixRes.rows
  const selectedBookObj = selectedBook ? books.find(b => b.book_id === selectedBook) : null

  const groupByBook: Record<number, BookCompanion[]> = {}
  matrix.forEach(row => {
    if (!groupByBook[row.book_id]) groupByBook[row.book_id] = []
    groupByBook[row.book_id].push(row)
  })

  const MIN_HADITHS_OPTIONS = [3, 5, 10, 20]

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">مصفوفة الكتب والصحابة</h1>
        <p className="text-sm text-gray-500">
          أحاديث كل صحابي في كل كتاب — يكشف تخصص كل مصنَّف في رواية بعينهم من الصحابة ومدى تنوع مصادره الصحابية
        </p>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <span className="text-xs text-gray-500">الحد الأدنى للأحاديث:</span>
        {MIN_HADITHS_OPTIONS.map(m => (
          <a key={m}
            href={`/hadiths/book-companion-matrix?minHadiths=${m}${selectedBook ? `&book=${selectedBook}` : ''}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${minHadiths === m ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
            {m}+
          </a>
        ))}
        {(selectedBook || selectedCompanion) && (
          <a href={`/hadiths/book-companion-matrix?minHadiths=${minHadiths}`}
            className="text-xs text-red-500 hover:underline">× مسح الفلتر</a>
        )}
      </div>

      {!selectedBook ? (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="bg-green-50 px-4 py-2 border-b border-green-100 text-xs text-green-800 font-medium">
            الكتب — مرتَّبة بعدد الصحابة المختلفين
          </div>
          <div className="divide-y divide-gray-50">
            {books.map((bk, i) => (
              <a key={bk.book_id}
                href={`/hadiths/book-companion-matrix?book=${bk.book_id}&minHadiths=${minHadiths}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-green-50 transition-colors">
                <span className="text-xs text-gray-300 w-5 shrink-0">{(i + 1).toLocaleString('ar-EG')}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800 hover:underline">{bk.book_name}</span>
                    <span className="text-xs text-gray-400 mr-auto">{bk.total_hadiths.toLocaleString('ar-EG')} حديث</span>
                  </div>
                  <div className="flex gap-2 text-xs mt-0.5">
                    <span className="text-amber-600">{bk.unique_companions} صحابي</span>
                    {bk.top_companion && (
                      <span className="text-gray-400">↑ {bk.top_companion.split(' ').slice(0, 2).join(' ')} ({bk.top_companion_pct}%)</span>
                    )}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="font-bold text-green-900 text-sm">
              {selectedBookObj?.book_name}
            </h2>
            <a href={`/hadiths/book-companion-matrix?minHadiths=${minHadiths}`} className="text-xs text-gray-400 hover:text-red-500">← الكل</a>
          </div>
          <div className="space-y-2">
            {(groupByBook[selectedBook] || []).map(row => (
              <div key={row.companion_id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3 hover:border-amber-200 transition-all">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Link href={`/narrator/${row.companion_id}`}
                      className="text-sm font-medium text-amber-800 hover:underline">
                      {row.companion_abb || row.companion_name.split(' ').slice(0, 3).join(' ')}
                    </Link>
                    <span className="text-xs text-amber-500">صحابي</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-48">
                      <div className="bg-amber-400 h-1.5 rounded-full" style={{ width: `${Math.min(row.pct_of_book, 100)}%` }} />
                    </div>
                    <span className="text-xs text-amber-600">{row.pct_of_book}% من الكتاب</span>
                  </div>
                </div>
                <div className="text-xs text-gray-400 shrink-0 text-left">
                  <div>{row.hadith_count.toLocaleString('ar-EG')} حديث</div>
                  <div>{row.chain_count} سند</div>
                </div>
              </div>
            ))}
            {(groupByBook[selectedBook] || []).length === 0 && (
              <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
                لا توجد بيانات بهذه الفلاتر
              </div>
            )}
          </div>
        </>
      )}

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/companion-overlap" className="text-green-700 hover:underline">← الأحاديث المشتركة للصحابة</Link>
        <Link href="/narrators/sahabi-students" className="text-green-700 hover:underline">← تلاميذ الصحابة</Link>
        <Link href="/books" className="text-green-700 hover:underline">← الكتب</Link>
      </div>
    </div>
  )
}
