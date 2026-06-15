import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface BookSummary {
  book_id: number
  book_name: string
  hadith_count: number
  chapter_count: number
}

interface ChapterStat {
  chapter_name: string | null
  hadith_count: number
  chain_count: number
  sahih_count: number
  daif_count: number
  companion_count: number
  first_hadith_id: number
}

interface ChapterHadith {
  hadith_id: number
  hadith_text: string
  judgment_text: string | null
  chain_count: number
}

export default async function ChapterAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string; chapter?: string }>
}) {
  const sp = await searchParams
  const selectedBook = parseInt(sp.book || '0') || null
  const selectedChapter = sp.chapter || ''

  const [booksRes, chaptersRes, haditshRes] = await Promise.all([
    pool.query<BookSummary>(
      `SELECT
         b.id AS book_id,
         b.title AS book_name,
         COUNT(DISTINCT ht.main_id)::int AS hadith_count,
         COUNT(DISTINCT ht.chapter_text)::int AS chapter_count
       FROM books b
       JOIN hadith_toc ht ON ht.book_id = b.id
       WHERE ht.chapter_text IS NOT NULL
       GROUP BY b.id, b.title
       HAVING COUNT(DISTINCT ht.chapter_text) >= 3
       ORDER BY COUNT(DISTINCT ht.chapter_text) DESC
       LIMIT 60`,
      []
    ).catch(() => ({ rows: [] as BookSummary[] })),

    selectedBook ? pool.query<ChapterStat>(
      `SELECT
         ht.chapter_text AS chapter_name,
         COUNT(DISTINCT ht.main_id)::int AS hadith_count,
         COUNT(DISTINCT ic.id)::int AS chain_count,
         COUNT(DISTINCT hj.hadith_id) FILTER (WHERE hj.say_text ~* 'صحيح')::int AS sahih_count,
         COUNT(DISTINCT hj.hadith_id) FILTER (WHERE hj.say_text ~* 'ضعيف')::int AS daif_count,
         COUNT(DISTINCT ic.narrator_id_array[1])
           FILTER (WHERE (SELECT n.is_companion FROM narrators n WHERE n.id = ic.narrator_id_array[1]))::int AS companion_count,
         MIN(ht.main_id)::int AS first_hadith_id
       FROM hadith_toc ht
       LEFT JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
       LEFT JOIN isnad_chains ic ON ic.id = ih.isnad_id
       LEFT JOIN hadith_judgments hj ON hj.hadith_id = ht.main_id
       WHERE ht.book_id = $1
       GROUP BY ht.chapter_text
       ORDER BY MIN(ht.main_id)`,
      [selectedBook]
    ).catch(() => ({ rows: [] as ChapterStat[] })) : Promise.resolve({ rows: [] as ChapterStat[] }),

    (selectedBook && selectedChapter) ? pool.query<ChapterHadith>(
      `SELECT
         ht.main_id AS hadith_id,
         LEFT(ht.tarf, 200) AS hadith_text,
         (SELECT hj.say_text FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id LIMIT 1) AS judgment_text,
         (SELECT COUNT(DISTINCT ic.id)::int FROM isnad_chains ic
          JOIN isnad_hadiths ih ON ih.isnad_id = ic.id WHERE ih.hadith_id = ht.main_id) AS chain_count
       FROM hadith_toc ht
       WHERE ht.book_id = $1 AND ht.chapter_text = $2
       ORDER BY ht.main_id
       LIMIT 20`,
      [selectedBook, selectedChapter]
    ).catch(() => ({ rows: [] as ChapterHadith[] })) : Promise.resolve({ rows: [] as ChapterHadith[] }),
  ])

  const books = booksRes.rows
  const chapters = chaptersRes.rows
  const hadiths = haditshRes.rows
  const selectedBookObj = selectedBook ? books.find(b => b.book_id === selectedBook) : null

  const maxHadiths = Math.max(...chapters.map(c => c.hadith_count), 1)

  function judgmentColor(j: string | null) {
    if (!j) return 'text-gray-400'
    if (/صحيح/.test(j)) return 'text-green-700'
    if (/حسن/.test(j)) return 'text-blue-600'
    if (/ضعيف/.test(j)) return 'text-red-500'
    return 'text-gray-500'
  }

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">تحليل الأبواب في كل كتاب</h1>
        <p className="text-sm text-gray-500">
          فهرس الأبواب لكل كتاب مع عدد أحاديث كل باب ونسب الصحيح والضعيف فيه — يساعد الباحث في الإحاطة بمحتوى الكتاب وفهم ترتيبه وتوزيع أحكامه
        </p>
      </div>

      <div className="grid sm:grid-cols-5 gap-4">
        <div className="sm:col-span-2">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-green-50 px-4 py-2 border-b border-green-100 text-xs text-green-800 font-medium">
              الكتب — اختر لعرض الأبواب
            </div>
            <div className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
              {books.map((bk, i) => {
                const isSelected = selectedBook === bk.book_id
                return (
                  <a key={bk.book_id}
                    href={`/books/chapter-analysis?book=${bk.book_id}`}
                    className={`flex items-center gap-3 px-4 py-2.5 hover:bg-green-50 transition-colors ${isSelected ? 'bg-green-50' : ''}`}>
                    <span className="text-xs text-gray-300 w-5 shrink-0">{(i + 1).toLocaleString('ar-EG')}</span>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm font-medium ${isSelected ? 'text-green-900' : 'text-gray-800'} hover:underline`}>
                        {bk.book_name}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 shrink-0">
                      {bk.chapter_count} باب
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
                <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-2 mb-3 flex items-center gap-2">
                  <span className="font-medium text-green-900 text-sm">{selectedBookObj.book_name}</span>
                  <span className="text-xs text-gray-500 mr-auto">
                    {selectedBookObj.chapter_count} باب · {selectedBookObj.hadith_count.toLocaleString('ar-EG')} حديث
                  </span>
                  {selectedChapter && (
                    <a href={`/books/chapter-analysis?book=${selectedBook}`}
                      className="text-xs text-red-500 hover:underline">× الكل</a>
                  )}
                </div>
              )}

              {!selectedChapter ? (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="bg-blue-50 px-4 py-2 border-b border-blue-100 text-xs text-blue-800 font-medium">
                    الأبواب بالترتيب — اضغط للاستعراض
                  </div>
                  <div className="divide-y divide-gray-50 max-h-[60vh] overflow-y-auto">
                    {chapters.map((ch, i) => {
                      const barW = Math.round((ch.hadith_count / maxHadiths) * 100)
                      return (
                        <a key={i}
                          href={`/books/chapter-analysis?book=${selectedBook}&chapter=${encodeURIComponent(ch.chapter_name || '')}`}
                          className="flex items-center gap-2 px-4 py-2.5 hover:bg-blue-50 transition-colors">
                          <span className="text-xs text-gray-300 w-5 shrink-0">{(i + 1).toLocaleString('ar-EG')}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-gray-800 hover:underline truncate">
                              {ch.chapter_name || '(بدون باب)'}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-32">
                                <div className="bg-blue-300 h-1.5 rounded-full" style={{ width: `${barW}%` }} />
                              </div>
                              <span className="text-xs text-blue-700">{ch.hadith_count}</span>
                              {ch.sahih_count > 0 && <span className="text-xs text-green-600">{ch.sahih_count}ص</span>}
                              {ch.daif_count > 0 && <span className="text-xs text-red-500">{ch.daif_count}ض</span>}
                              {ch.companion_count > 0 && <span className="text-xs text-amber-600">{ch.companion_count}ص</span>}
                            </div>
                          </div>
                          <Link href={`/hadith/${ch.first_hadith_id}`}
                            className="text-xs text-green-600 hover:underline shrink-0"
                            onClick={e => e.stopPropagation()}>
                            ←
                          </Link>
                        </a>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2 mb-3">
                    <span className="font-medium text-blue-900 text-sm">{selectedChapter}</span>
                  </div>
                  <div className="space-y-2">
                    {hadiths.map(h => (
                      <div key={h.hadith_id} className="bg-white rounded-xl border border-gray-100 p-4 hover:border-blue-200 transition-all">
                        <div className="flex items-center gap-2 mb-2 text-xs">
                          {h.judgment_text && (
                            <span className={judgmentColor(h.judgment_text)}>{h.judgment_text.slice(0, 25)}</span>
                          )}
                          <span className="text-gray-300 mr-auto">{h.chain_count} سند</span>
                        </div>
                        <p className="text-sm text-gray-900 leading-relaxed mb-2">{h.hadith_text}...</p>
                        <Link href={`/hadith/${h.hadith_id}`} className="text-xs text-green-700 hover:underline">تفاصيل ←</Link>
                      </div>
                    ))}
                    {hadiths.length === 0 && (
                      <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">لا توجد أحاديث</div>
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="bg-gray-50 rounded-xl p-12 text-center">
              <div className="text-3xl mb-3">📑</div>
              <div className="font-semibold text-gray-700 text-sm mb-2">تحليل الأبواب</div>
              <p className="text-xs text-gray-500 leading-relaxed">
                اختر كتاباً لعرض جميع أبوابه مع عدد أحاديث كل باب ونسبة الصحيح والضعيف فيه
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/books/author-profile" className="text-green-700 hover:underline">← ملف الكتاب</Link>
        <Link href="/books" className="text-green-700 hover:underline">← الكتب</Link>
        <Link href="/hadiths/grade-by-book" className="text-green-700 hover:underline">← درجات الأحاديث</Link>
      </div>
    </div>
  )
}
