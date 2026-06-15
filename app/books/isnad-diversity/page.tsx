import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface BookDiversity {
  book_id: number
  book_name: string
  book_death: number | null
  total_hadiths: number
  unique_companions: number
  unique_students: number
  unique_books_shared: number
  avg_chain_length: number | null
  diversity_score: number
}

interface CompanionShare {
  companion_id: number
  companion_name: string
  hadith_count: number
  pct_of_book: number
}

export default async function IsnadDiversityPage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string }>
}) {
  const sp = await searchParams
  const selectedBook = parseInt(sp.book || '0') || null

  const [booksRes, companionsRes] = await Promise.all([
    pool.query<BookDiversity>(
      `SELECT
         b.id AS book_id,
         b.title AS book_name,
         b.takhrij_death AS book_death,
         COUNT(DISTINCT ht.main_id)::int AS total_hadiths,
         COUNT(DISTINCT ic.narrator_id_array[1])::int AS unique_companions,
         COUNT(DISTINCT ic.narrator_id_array[2])::int AS unique_students,
         COUNT(DISTINCT b2.id) FILTER (WHERE ht2.takhrij_id IS NOT NULL AND b2.id != b.id)::int AS unique_books_shared,
         ROUND(AVG(array_length(ic.narrator_id_array, 1)), 1)::float AS avg_chain_length,
         (COUNT(DISTINCT ic.narrator_id_array[1]) * 10
          + COUNT(DISTINCT ic.narrator_id_array[2]) * 5
          + COUNT(DISTINCT b2.id) FILTER (WHERE ht2.takhrij_id IS NOT NULL AND b2.id != b.id) * 3)::int AS diversity_score
       FROM books b
       JOIN hadith_toc ht ON ht.book_id = b.id
       JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
       JOIN isnad_chains ic ON ic.id = ih.isnad_id
       LEFT JOIN hadith_toc ht2 ON ht2.takhrij_id = ht.takhrij_id AND ht2.takhrij_id IS NOT NULL
       LEFT JOIN books b2 ON b2.id = ht2.book_id
       WHERE ic.narrator_id_array[1] IS NOT NULL
       GROUP BY b.id, b.title, b.takhrij_death
       HAVING COUNT(DISTINCT ht.main_id) >= 100
       ORDER BY COUNT(DISTINCT ic.narrator_id_array[1]) DESC`,
      []
    ).catch(() => ({ rows: [] as BookDiversity[] })),

    selectedBook ? pool.query<CompanionShare>(
      `SELECT
         n.id AS companion_id,
         n.name AS companion_name,
         COUNT(DISTINCT ih.hadith_id)::int AS hadith_count,
         ROUND(COUNT(DISTINCT ih.hadith_id) * 100.0 / NULLIF((
           SELECT COUNT(DISTINCT ht2.main_id) FROM hadith_toc ht2 WHERE ht2.book_id = $1
         ), 0), 1)::float AS pct_of_book
       FROM narrators n
       JOIN isnad_chains ic ON ic.narrator_id_array[1] = n.id AND n.is_companion = true
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id AND ht.book_id = $1
       GROUP BY n.id, n.name
       ORDER BY COUNT(DISTINCT ih.hadith_id) DESC
       LIMIT 25`,
      [selectedBook]
    ).catch(() => ({ rows: [] as CompanionShare[] })) : Promise.resolve({ rows: [] as CompanionShare[] }),
  ])

  const books = booksRes.rows
  const companions = companionsRes.rows
  const selectedBookInfo = selectedBook ? books.find(b => b.book_id === selectedBook) : null

  const maxCompanions = Math.max(...books.map(b => b.unique_companions), 1)
  const maxStudents = Math.max(...books.map(b => b.unique_students), 1)

  const topCompanion = companions[0]
  const concentrationPct = topCompanion?.pct_of_book || 0

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">تنوع المصادر الصحابية بالكتب</h1>
        <p className="text-sm text-gray-500">
          عدد الصحابة الذين يُغطَّر بهم حديث كل كتاب — كلما تعدد الصحابة كلما كان الكتاب أكثر شمولاً وتنوعاً
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-5">
        <div className="bg-green-50 px-4 py-2 border-b border-gray-100">
          <div className="flex text-xs text-green-800 font-medium gap-8">
            <span className="w-40 shrink-0">الكتاب</span>
            <span className="w-24 text-center">الصحابة</span>
            <span className="w-24 text-center">التابعون</span>
            <span className="hidden sm:block flex-1">التنوع</span>
          </div>
        </div>
        <div className="divide-y divide-gray-50">
          {books.map(b => (
            <div key={b.book_id}
              className={`px-4 py-3 hover:bg-gray-50 cursor-pointer ${selectedBook === b.book_id ? 'bg-green-50' : ''}`}>
              <a href={`/books/isnad-diversity?book=${b.book_id}`} className="flex items-center gap-4">
                <div className="w-40 shrink-0">
                  <div className={`text-sm font-medium ${selectedBook === b.book_id ? 'text-green-900' : 'text-gray-700'} hover:underline line-clamp-1`}>
                    {b.book_name}
                  </div>
                  {b.book_death && <div className="text-xs text-gray-400">ت {b.book_death.toLocaleString('ar-EG')} هـ</div>}
                </div>
                <div className="w-24 text-center">
                  <span className="text-lg font-bold text-amber-700">{b.unique_companions.toLocaleString('ar-EG')}</span>
                  <div className="h-1.5 bg-gray-100 rounded-full mt-1">
                    <div className="bg-amber-400 h-1.5 rounded-full" style={{ width: `${(b.unique_companions / maxCompanions) * 100}%` }} />
                  </div>
                </div>
                <div className="w-24 text-center">
                  <span className="text-sm font-semibold text-blue-700">{b.unique_students.toLocaleString('ar-EG')}</span>
                  <div className="h-1.5 bg-gray-100 rounded-full mt-1">
                    <div className="bg-blue-400 h-1.5 rounded-full" style={{ width: `${(b.unique_students / maxStudents) * 100}%` }} />
                  </div>
                </div>
                <div className="hidden sm:block flex-1 text-xs text-gray-400">
                  {b.total_hadiths.toLocaleString('ar-EG')} حديث
                  {b.avg_chain_length && ` · متوسط الطول ${b.avg_chain_length}`}
                </div>
              </a>
            </div>
          ))}
        </div>
      </div>

      {selectedBookInfo && (
        <div className="bg-green-50 border border-green-100 rounded-xl p-4 mb-4">
          <h2 className="font-bold text-green-900 mb-3">{selectedBookInfo.book_name} — توزيع الصحابة</h2>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 text-center mb-4">
            <div><div className="text-2xl font-bold text-amber-700">{selectedBookInfo.unique_companions.toLocaleString('ar-EG')}</div><div className="text-xs text-gray-500">صحابي</div></div>
            <div><div className="text-2xl font-bold text-blue-700">{selectedBookInfo.unique_students.toLocaleString('ar-EG')}</div><div className="text-xs text-gray-500">تابعي فريد</div></div>
            <div><div className="text-2xl font-bold text-gray-700">{selectedBookInfo.total_hadiths.toLocaleString('ar-EG')}</div><div className="text-xs text-gray-500">حديث</div></div>
          </div>

          {companions.length > 0 && (
            <>
              {concentrationPct > 30 && (
                <div className="bg-amber-100 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800 mb-3">
                  تنبيه: {Math.round(concentrationPct)}% من أحاديث الكتاب مصدرها صحابي واحد ({topCompanion.companion_name.split(' ').slice(0, 2).join(' ')}) — هذا مؤشر على تركز مصادر الكتاب
                </div>
              )}
              <div className="space-y-2">
                {companions.map((c, i) => (
                  <div key={c.companion_id} className="flex items-center gap-2">
                    <span className="text-xs text-gray-300 w-5 shrink-0">{(i + 1).toLocaleString('ar-EG')}</span>
                    <Link href={`/narrator/${c.companion_id}`}
                      className="text-sm text-amber-900 hover:underline font-medium w-40 shrink-0">
                      {c.companion_name.split(' ').slice(0, 3).join(' ')}
                    </Link>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 max-w-48">
                      <div className="bg-amber-400 h-2 rounded-full"
                        style={{ width: `${Math.min(c.pct_of_book, 100)}%` }} />
                    </div>
                    <span className="text-xs text-amber-700 font-medium shrink-0">{c.hadith_count.toLocaleString('ar-EG')}</span>
                    <span className="text-xs text-gray-400 shrink-0">({c.pct_of_book}%)</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/books" className="text-green-700 hover:underline">← الكتب</Link>
        <Link href="/companions/specialties" className="text-green-700 hover:underline">← تخصصات الصحابة</Link>
        <Link href="/books/transmission-genealogy" className="text-green-700 hover:underline">← تداخل الكتب</Link>
      </div>
    </div>
  )
}
