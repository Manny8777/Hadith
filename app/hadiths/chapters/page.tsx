import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'فهرس الأبواب — جامع خادم الحرمين' }

interface ChapterRow {
  chapter_name: string
  book_id: number
  book_name: string
  hadith_count: number
  first_hadith_id: number
}

export default async function ChaptersBrowserPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; book?: string; sort?: string }>
}) {
  const sp = await searchParams
  const q = sp.q?.trim() || ''
  const bookFilter = parseInt(sp.book || '0')
  const sort = sp.sort || 'count'

  const orderClause = sort === 'alpha' ? 'chapter_name ASC' :
    sort === 'book' ? 'book_name ASC, hadith_count DESC' :
    'hadith_count DESC'

  const [booksRes, chaptersRes, statsRes] = await Promise.all([
    pool.query<{ id: number; name: string; chapter_count: number }>(
      `SELECT b.id, b.title AS name,
              COUNT(DISTINCT ht.chapter_text)::int AS chapter_count
       FROM books b
       JOIN hadith_toc ht ON ht.book_id = b.id
       WHERE ht.chapter_text IS NOT NULL AND ht.chapter_text != ''
       GROUP BY b.id, b.title
       HAVING COUNT(DISTINCT ht.chapter_text) > 0
       ORDER BY chapter_count DESC`
    ).catch(() => ({ rows: [] })),

    pool.query<ChapterRow>(
      `SELECT ht.chapter_text AS chapter_name, ht.book_id, b.title AS book_name,
              COUNT(ht.main_id)::int AS hadith_count,
              MIN(ht.main_id)::int AS first_hadith_id
       FROM hadith_toc ht
       JOIN books b ON b.id = ht.book_id
       WHERE ht.chapter_text IS NOT NULL AND ht.chapter_text != ''
         AND ht.is_leaf = true AND ht.is_paragraph = true
         ${q ? `AND ht.chapter_text ~* $1` : ''}
         ${bookFilter > 0 ? (q ? `AND ht.book_id = $2` : `AND ht.book_id = $1`) : ''}
       GROUP BY ht.chapter_text, ht.book_id, b.title
       ORDER BY ${orderClause}
       LIMIT 100`,
      q && bookFilter > 0 ? [q, bookFilter] :
        q ? [q] :
        bookFilter > 0 ? [bookFilter] : []
    ).catch(() => ({ rows: [] as ChapterRow[] })),

    pool.query<{ total_chapters: number; total_books: number; max_hadiths: number }>(
      `SELECT
         COUNT(DISTINCT chapter_text)::int AS total_chapters,
         COUNT(DISTINCT book_id)::int AS total_books,
         MAX(cnt)::int AS max_hadiths
       FROM (
         SELECT chapter_text, book_id, COUNT(*)::int AS cnt
         FROM hadith_toc
         WHERE chapter_text IS NOT NULL AND chapter_text != ''
           AND is_leaf = true AND is_paragraph = true
         GROUP BY chapter_text, book_id
       ) sub`
    ).catch(() => ({ rows: [] })),
  ])

  const books = booksRes.rows
  const chapters = chaptersRes.rows
  const stats = statsRes.rows[0]

  const maxCount = Math.max(...chapters.map(c => c.hadith_count), 1)

  // Group by book for display when no search
  const groupedByBook = new Map<string, ChapterRow[]>()
  if (!q && sort === 'book') {
    for (const ch of chapters) {
      const key = ch.book_name
      if (!groupedByBook.has(key)) groupedByBook.set(key, [])
      groupedByBook.get(key)!.push(ch)
    }
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">فهرس الأبواب</h1>
        <p className="text-sm text-gray-500">
          تصفح أبواب كتب الحديث وعدد الأحاديث في كل باب — بحث وتصفية حسب الكتاب والموضوع
        </p>
        {stats && (
          <div className="flex gap-4 mt-2 text-xs text-gray-400">
            <span>{stats.total_chapters?.toLocaleString('ar-EG')} باب</span>
            <span>{stats.total_books?.toLocaleString('ar-EG')} كتاب</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <form action="/hadiths/chapters" method="get"
        className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
        <div className="flex flex-wrap gap-3 mb-3">
          <div className="flex-1 min-w-48">
            <input type="text" name="q" defaultValue={q}
              placeholder="ابحث في أسماء الأبواب... (مثال: الصلاة، الزكاة، الجنائز)"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400" />
          </div>
          <select name="book" defaultValue={bookFilter || ''}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400">
            <option value="">كل الكتب</option>
            {books.map(b => (
              <option key={b.id} value={b.id}>{b.name} ({b.chapter_count} باب)</option>
            ))}
          </select>
          <select name="sort" defaultValue={sort}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400">
            <option value="count">ترتيب حسب عدد الأحاديث</option>
            <option value="alpha">ترتيب أبجدي</option>
            <option value="book">ترتيب حسب الكتاب</option>
          </select>
        </div>
        <button type="submit"
          className="text-sm bg-green-800 text-white px-5 py-2 rounded-xl hover:bg-green-700 transition-colors font-medium">
          بحث
        </button>
        {q && (
          <a href="/hadiths/chapters"
            className="mr-3 text-sm text-gray-400 hover:text-gray-600">× مسح</a>
        )}
      </form>

      {/* Quick fiqh topic shortcuts */}
      {!q && (
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="text-xs text-gray-400 self-center">أبواب شائعة:</span>
          {['الصلاة', 'الزكاة', 'الصوم', 'الحج', 'النكاح', 'الطلاق', 'البيوع', 'الجنائز', 'الجهاد', 'الأذان', 'الطهارة', 'الإيمان'].map(topic => (
            <a key={topic}
              href={`/hadiths/chapters?q=${encodeURIComponent(topic)}`}
              className="text-xs bg-green-50 text-green-800 px-3 py-1 rounded-full hover:bg-green-100 transition-colors border border-green-100">
              {topic}
            </a>
          ))}
        </div>
      )}

      {/* Results count */}
      <div className="text-xs text-gray-400 mb-3">
        {chapters.length === 100 ? 'أول 100 نتيجة' : `${chapters.length.toLocaleString('ar-EG')} باب`}
        {q && <span> — بحث عن: <strong className="text-green-800">{q}</strong></span>}
      </div>

      {/* Chapters list */}
      {sort === 'book' && !q && groupedByBook.size > 0 ? (
        <div className="space-y-4">
          {Array.from(groupedByBook.entries()).map(([bookName, bookChapters]) => (
            <div key={bookName} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="bg-green-50 px-4 py-2 border-b border-gray-100">
                <span className="font-bold text-green-900 text-sm">{bookName}</span>
                <span className="text-xs text-gray-400 mr-2">({bookChapters.length} باب)</span>
              </div>
              <div className="divide-y divide-gray-50">
                {bookChapters.map((ch, i) => (
                  <div key={i} className="px-4 py-2 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                    <div className="flex-1">
                      <Link href={`/hadith/${ch.first_hadith_id}`}
                        className="text-sm text-green-900 hover:underline">
                        {ch.chapter_name}
                      </Link>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-16 bg-gray-100 rounded-full h-1.5">
                        <div className="bg-green-400 h-1.5 rounded-full"
                          style={{ width: `${(ch.hadith_count / maxCount) * 100}%` }} />
                      </div>
                      <span className="text-xs text-gray-400 w-12 text-left">
                        {ch.hadith_count.toLocaleString('ar-EG')} ح
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="divide-y divide-gray-50">
            {chapters.map((ch, i) => (
              <div key={i}
                className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <Link href={`/hadith/${ch.first_hadith_id}`}
                    className="text-sm text-green-900 hover:underline block truncate">
                    {ch.chapter_name}
                  </Link>
                  <span className="text-xs text-gray-400">{ch.book_name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-24 bg-gray-100 rounded-full h-1.5 hidden sm:block">
                    <div className="bg-green-400 h-1.5 rounded-full"
                      style={{ width: `${(ch.hadith_count / maxCount) * 100}%` }} />
                  </div>
                  <span className="text-xs text-gray-500 w-16 text-left shrink-0">
                    {ch.hadith_count.toLocaleString('ar-EG')} حديث
                  </span>
                  <Link href={`/hadiths/chapters?q=${encodeURIComponent(ch.chapter_name)}`}
                    className="text-xs text-green-600 hover:underline shrink-0">
                    كل الكتب ←
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {chapters.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
          لا توجد أبواب تطابق البحث
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/chapters" className="text-green-700 hover:underline">← بحث الأبواب</Link>
        <Link href="/books" className="text-green-700 hover:underline">← الكتب</Link>
        <Link href="/search" className="text-green-700 hover:underline">← البحث في المتون</Link>
      </div>
    </div>
  )
}
