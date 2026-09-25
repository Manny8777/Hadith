import pool from '@/lib/db'
import Link from 'next/link'
import UiIcon from '@/app/components/UiIcon'

export const dynamic = 'force-dynamic'

interface UniqueHadith {
  hadith_id: number
  hadith_text: string
  book_id: number
  book_name: string
  chapter_text: string | null
  judgment_text: string | null
  chain_count: number
  companion_name: string | null
}

interface BookUnique {
  book_id: number
  book_name: string
  unique_count: number
  total_hadiths: number
  unique_pct: number
}

export default async function UniqueToBookPage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string; grade?: string; page?: string; sort?: string }>
}) {
  const sp = await searchParams
  const selectedBook = parseInt(sp.book || '0') || null
  const gradeFilter = sp.grade || ''
  const page = Math.max(1, parseInt(sp.page || '1'))
  const sortBy = sp.sort || 'count'
  const pageSize = 20
  const offset = (page - 1) * pageSize

  const bookSortSql = sortBy === 'pct' ? 'unique_pct DESC' : 'unique_count DESC'

  const [booksRes, haditshRes] = await Promise.all([
    pool.query<BookUnique>(
      `SELECT
         b.id AS book_id,
         b.title AS book_name,
         COUNT(DISTINCT ht.main_id)::int AS unique_count,
         (SELECT COUNT(DISTINCT ht2.main_id) FROM hadith_toc ht2 WHERE ht2.book_id = b.id)::int AS total_hadiths,
         ROUND(100.0 * COUNT(DISTINCT ht.main_id) /
           NULLIF((SELECT COUNT(DISTINCT ht3.main_id) FROM hadith_toc ht3 WHERE ht3.book_id = b.id), 0))::int AS unique_pct
       FROM hadith_toc ht
       JOIN books b ON b.id = ht.book_id
       WHERE NOT EXISTS (
         SELECT 1 FROM takhrij t
         WHERE t.hadith_id = ht.main_id
           AND (SELECT COUNT(DISTINCT t2.book_id) FROM takhrij t2 WHERE t2.group_id = t.group_id) > 1
       )
       GROUP BY b.id, b.title
       HAVING COUNT(DISTINCT ht.main_id) >= 10
       ORDER BY ${bookSortSql}
       LIMIT 50`,
      []
    ).catch(() => ({ rows: [] as BookUnique[] })),

    selectedBook ? pool.query<UniqueHadith>(
      `SELECT
         ht.main_id AS hadith_id,
         LEFT(ht.tarf, 220) AS hadith_text,
         b.id AS book_id,
         b.title AS book_name,
         ht.chapter_text,
         (SELECT hj.say_text FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id LIMIT 1) AS judgment_text,
         (SELECT COUNT(DISTINCT ic.id)::int FROM isnad_chains ic
          JOIN isnad_hadiths ih ON ih.isnad_id = ic.id WHERE ih.hadith_id = ht.main_id) AS chain_count,
         (SELECT n.name FROM isnad_chains ic
          JOIN isnad_hadiths ih ON ih.isnad_id = ic.id AND ih.hadith_id = ht.main_id
          JOIN narrators n ON n.id = ic.narrator_id_array[1] AND n.is_companion = true
          LIMIT 1) AS companion_name
       FROM hadith_toc ht
       JOIN books b ON b.id = ht.book_id
       WHERE b.id = $1
         AND NOT EXISTS (
           SELECT 1 FROM takhrij t
           WHERE t.hadith_id = ht.main_id
             AND (SELECT COUNT(DISTINCT t2.book_id) FROM takhrij t2 WHERE t2.group_id = t.group_id) > 1
         )
         AND ($2 = '' OR EXISTS (
           SELECT 1 FROM hadith_judgments hj
           WHERE hj.hadith_id = ht.main_id AND hj.say_text ~* $2
         ))
       ORDER BY ht.main_id
       LIMIT $3 OFFSET $4`,
      [selectedBook, gradeFilter || '', pageSize, offset]
    ).catch(() => ({ rows: [] as UniqueHadith[] })) : Promise.resolve({ rows: [] as UniqueHadith[] }),
  ])

  const books = booksRes.rows
  const hadiths = haditshRes.rows
  const selectedBookObj = selectedBook ? books.find(b => b.book_id === selectedBook) : null

  function judgmentColor(j: string | null) {
    if (!j) return 'text-gray-400'
    if (/صحيح/.test(j)) return 'text-green-700'
    if (/حسن/.test(j)) return 'text-blue-600'
    if (/ضعيف/.test(j)) return 'text-red-500'
    return 'text-gray-500'
  }

  const GRADE_OPTIONS = [
    { key: '', label: 'كل الأحكام' },
    { key: 'صحيح', label: 'صحيح فقط' },
    { key: 'حسن', label: 'حسن فقط' },
    { key: 'ضعيف', label: 'ضعيف فقط' },
  ]

  const SORT_OPTIONS = [
    { key: 'count', label: 'بعدد الفريد' },
    { key: 'pct', label: 'بنسبة الفريد' },
  ]

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الأحاديث التي انفرد بها كل كتاب</h1>
        <p className="text-sm text-gray-500">
          أحاديث موجودة في كتاب واحد فقط ولا رواية لها في بقية الكتب — تكشف الخصائص الفريدة لكل مصنَّف وما تميَّز بجمعه
        </p>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {SORT_OPTIONS.map(s => (
          <a key={s.key}
            href={`/hadiths/unique-to-book?sort=${s.key}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${sortBy === s.key ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
            {s.label}
          </a>
        ))}
        {selectedBook && (
          <>
            <span className="text-gray-200">|</span>
            {GRADE_OPTIONS.map(g => (
              <a key={g.key}
                href={`/hadiths/unique-to-book?sort=${sortBy}&book=${selectedBook}&grade=${g.key}`}
                className={`text-xs px-3 py-1.5 rounded-full border ${gradeFilter === g.key ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                {g.label}
              </a>
            ))}
            <a href={`/hadiths/unique-to-book?sort=${sortBy}`} className="text-xs text-red-500 hover:underline">× الكل</a>
          </>
        )}
      </div>

      <div className="grid sm:grid-cols-5 gap-4">
        <div className="sm:col-span-2">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-green-50 px-4 py-2 border-b border-green-100 text-xs text-green-800 font-medium">
              الكتب — انفردت بأكثر الأحاديث
            </div>
            <div className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
              {books.map((bk, i) => {
                const isSelected = selectedBook === bk.book_id
                return (
                  <a key={bk.book_id}
                    href={`/hadiths/unique-to-book?sort=${sortBy}&book=${bk.book_id}`}
                    className={`flex items-center gap-2 px-4 py-3 hover:bg-green-50 transition-colors ${isSelected ? 'bg-green-50' : ''}`}>
                    <span className="text-xs text-gray-300 w-5 shrink-0">{(i + 1).toLocaleString('ar-EG')}</span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${isSelected ? 'text-green-900' : 'text-gray-800'} hover:underline`}>
                        {bk.book_name}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="flex-1 bg-gray-100 rounded-full h-1 max-w-24">
                          <div className="bg-green-400 h-1 rounded-full" style={{ width: `${Math.min(bk.unique_pct, 100)}%` }} />
                        </div>
                        <span className="text-xs text-green-700">{bk.unique_count.toLocaleString('ar-EG')}</span>
                        <span className="text-xs text-gray-400">({bk.unique_pct}%)</span>
                      </div>
                    </div>
                  </a>
                )
              })}
            </div>
          </div>
        </div>

        <div className="sm:col-span-3">
          {selectedBook ? (
            <>
              {selectedBookObj && (
                <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-2 mb-3 text-xs text-green-800">
                  <span className="font-medium">{selectedBookObj.book_name}</span>
                  {' '} — انفرد بـ {selectedBookObj.unique_count.toLocaleString('ar-EG')} حديث
                  ({selectedBookObj.unique_pct}% من إجمالي {selectedBookObj.total_hadiths.toLocaleString('ar-EG')})
                </div>
              )}
              <div className="space-y-2">
                {hadiths.map(h => (
                  <div key={h.hadith_id} className="bg-white rounded-xl border border-gray-100 p-4 hover:border-green-200 transition-all">
                    <div className="flex items-center gap-2 mb-2 flex-wrap text-xs">
                      {h.chapter_text && <span className="text-gray-400">{h.chapter_text}</span>}
                      {h.companion_name && (
                        <span className="bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full">
                          {h.companion_name.split(' ').slice(0, 2).join(' ')}
                        </span>
                      )}
                      {h.judgment_text && (
                        <span className={judgmentColor(h.judgment_text)}>{h.judgment_text.slice(0, 25)}</span>
                      )}
                      <span className="text-gray-300 mr-auto">{h.chain_count} سند</span>
                    </div>
                    <p className="text-sm text-gray-900 leading-relaxed mb-2">{h.hadith_text}...</p>
                    <div className="flex gap-3 text-xs">
                      <Link href={`/hadith/${h.hadith_id}`} className="text-green-700 hover:underline">تفاصيل ←</Link>
                      <Link href={`/hadith/${h.hadith_id}/research-report`} className="text-blue-600 hover:underline">تقرير ←</Link>
                    </div>
                  </div>
                ))}
                {hadiths.length === 0 && (
                  <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
                    لا توجد أحاديث بهذه الفلاتر
                  </div>
                )}
              </div>

              {(hadiths.length === pageSize || page > 1) && (
                <div className="flex gap-2 mt-4 justify-center">
                  {page > 1 && (
                    <a href={`/hadiths/unique-to-book?sort=${sortBy}&book=${selectedBook}&grade=${gradeFilter}&page=${page - 1}`}
                      className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">← السابق</a>
                  )}
                  <span className="text-sm text-gray-400 self-center">صفحة {page.toLocaleString('ar-EG')}</span>
                  {hadiths.length === pageSize && (
                    <a href={`/hadiths/unique-to-book?sort=${sortBy}&book=${selectedBook}&grade=${gradeFilter}&page=${page + 1}`}
                      className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">التالي →</a>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="bg-gray-50 rounded-xl p-8 text-center">
              <UiIcon name="lexicon" size={32} className="text-[#b28a43] mb-3" />
              <div className="font-semibold text-gray-700 text-sm mb-2">انفرادات كل كتاب</div>
              <p className="text-xs text-gray-500 leading-relaxed">
                اختر كتاباً لاستعراض الأحاديث التي انفرد بروايتها دون غيره من الكتب — مما يُعرِّف الباحث بمنهج الكتاب وما اختصَّ بجمعه
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/takhrij-spread" className="text-green-700 hover:underline">← انتشار التخريج</Link>
        <Link href="/hadiths/grade-by-book" className="text-green-700 hover:underline">← درجات الأحاديث بالكتاب</Link>
        <Link href="/books" className="text-green-700 hover:underline">← الكتب</Link>
      </div>
    </div>
  )
}
