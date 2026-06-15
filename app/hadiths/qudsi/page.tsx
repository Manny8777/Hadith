import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'الأحاديث القدسية — جامع خادم الحرمين' }

interface QudsiRow {
  hadith_id: number
  book_id: number
  book_title: string
  book_death: number | null
  tarf: string | null
  content: string | null
  say_text: string | null
  chain_count: number
}

interface BookFilter {
  id: number
  title: string
  cnt: number
}

// Patterns that identify hadith qudsi — Allah speaking through the Prophet
const QUDSI_PATTERNS = [
  'قال الله',
  'يقول الله',
  'يقول ربكم',
  'قال ربكم',
  'يقول ربي',
  'قال ربي',
  'يقول الله تعالى',
  'يقول الله عز وجل',
]

const TARF_PATTERN = QUDSI_PATTERNS.join('|')

// Also search in tarf field for "قدسي"
const FULL_PATTERN = `قدسي|${TARF_PATTERN}`

function stripTags(s: string | null) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

const SORT_OPTIONS = [
  { key: 'default', label: 'الافتراضي' },
  { key: 'death', label: 'تاريخ الكتاب' },
  { key: 'chains', label: 'عدد الأسانيد' },
]

export default async function QudsiPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; page?: string; book?: string }>
}) {
  const sp = await searchParams
  const sort = sp.sort || 'default'
  const page = Math.max(1, parseInt(sp.page || '1'))
  const bookFilter = sp.book ? parseInt(sp.book) : 0
  const limit = 30
  const offset = (page - 1) * limit

  const bookParams: (string | number)[] = []
  const bookClause = bookFilter > 0 ? `AND ht.book_id = $${bookParams.push(bookFilter)}` : ''

  const orderClause =
    sort === 'death'
      ? 'ORDER BY b.takhrij_death ASC NULLS LAST, ht.main_id'
      : sort === 'chains'
      ? 'ORDER BY chain_count DESC, ht.main_id'
      : 'ORDER BY ht.main_id'

  const [rowsRes, countRes, booksRes] = await Promise.all([
    pool
      .query<QudsiRow>(
        `SELECT
                ht.main_id AS hadith_id,
                ht.book_id,
                b.title AS book_title,
                b.takhrij_death AS book_death,
                regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g') AS tarf,
                LEFT(regexp_replace(coalesce(ht.content,''), '<[^>]+>', ' ', 'g'), 300) AS content,
                (SELECT hj.say_text FROM hadith_judgments hj
                 WHERE hj.hadith_id = ht.main_id LIMIT 1) AS say_text,
                (SELECT COUNT(DISTINCT ih.isnad_id)::int
                 FROM isnad_hadiths ih
                 WHERE ih.hadith_id = ht.main_id) AS chain_count
         FROM hadith_toc ht
         JOIN books b ON b.id = ht.book_id
         WHERE ht.is_leaf = true AND ht.is_paragraph = true
           AND (
             ht.tarf ~* $${bookParams.length + 1}
             OR ht.content ~* $${bookParams.length + 1}
           )
           ${bookClause}
         ${orderClause}
         LIMIT $${bookParams.length + 2} OFFSET $${bookParams.length + 3}`,
        [...bookParams, FULL_PATTERN, limit, offset]
      )
      .catch(() => ({ rows: [] as QudsiRow[] })),

    pool
      .query<{ total: number }>(
        `SELECT COUNT(*)::int AS total
         FROM hadith_toc ht
         WHERE ht.is_leaf = true AND ht.is_paragraph = true
           AND (ht.tarf ~* $1 OR ht.content ~* $1)`,
        [FULL_PATTERN]
      )
      .catch(() => ({ rows: [{ total: 0 }] })),

    // Books containing qudsi hadiths with counts
    pool
      .query<BookFilter>(
        `SELECT b.id, b.title, COUNT(*)::int AS cnt
         FROM hadith_toc ht
         JOIN books b ON b.id = ht.book_id
         WHERE ht.is_leaf = true AND ht.is_paragraph = true
           AND (ht.tarf ~* $1 OR ht.content ~* $1)
         GROUP BY b.id, b.title
         ORDER BY cnt DESC
         LIMIT 30`,
        [FULL_PATTERN]
      )
      .catch(() => ({ rows: [] as BookFilter[] })),
  ])

  const rows = rowsRes.rows
  const total = countRes.rows[0]?.total || 0
  const totalPages = Math.ceil(total / limit)
  const books = booksRes.rows

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('sort', sort)
    p.set('page', String(page))
    if (bookFilter) p.set('book', String(bookFilter))
    Object.entries(overrides).forEach(([k, v]) => {
      if (v) p.set(k, v)
      else p.delete(k)
    })
    return `/hadiths/qudsi?${p.toString()}`
  }

  const selectedBook = books.find(b => b.id === bookFilter)

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الأحاديث القدسية</h1>
        <p className="text-sm text-gray-500 mb-3">
          أحاديث ينقل فيها النبي ﷺ كلام الله تعالى مباشرةً — يُستدلّ عليها بوجود &ldquo;قال
          الله&rdquo; أو &ldquo;يقول ربكم&rdquo; أو ما في معناها في متن الحديث، أو بورود لفظ
          &ldquo;قدسي&rdquo; في الطرف
        </p>

        <div className="bg-green-50 border border-green-100 rounded-xl p-3 mb-4 text-xs text-green-900">
          <span className="font-semibold">تعريف الحديث القدسي: </span>
          ما يرويه النبي ﷺ عن ربه عز وجل، وليس بقرآن كريم. يتميز بالمعنى الإلهي مع ألفاظ النبي
          ﷺ. ويسمى أيضاً الحديث الإلهي أو الحديث الرباني.
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-green-800 text-white rounded-xl p-3 text-center">
            <div className="text-xl font-bold">{total.toLocaleString('ar-EG')}</div>
            <div className="text-xs opacity-80">إجمالي القدسية</div>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-amber-800">{books.length.toLocaleString('ar-EG')}</div>
            <div className="text-xs text-amber-600">كتاب تحتوي عليها</div>
          </div>
          {selectedBook && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-indigo-800">
                {selectedBook.cnt.toLocaleString('ar-EG')}
              </div>
              <div className="text-xs text-indigo-600 truncate">{selectedBook.title}</div>
            </div>
          )}
        </div>

        {/* Book filter */}
        {books.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-3 mb-4">
            <p className="text-xs text-gray-500 mb-2">تصفية بالكتاب:</p>
            <div className="flex flex-wrap gap-1.5">
              <Link
                href={buildUrl({ book: '', page: '1' })}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  !bookFilter
                    ? 'bg-green-800 text-white border-green-800'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
                }`}
              >
                الكل ({total.toLocaleString('ar-EG')})
              </Link>
              {books.map(b => (
                <Link
                  key={b.id}
                  href={buildUrl({ book: String(b.id), page: '1' })}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    bookFilter === b.id
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-400'
                  }`}
                >
                  {b.title.slice(0, 22)} ({b.cnt})
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Sort + count */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">ترتيب:</span>
          {SORT_OPTIONS.map(s => (
            <Link
              key={s.key}
              href={buildUrl({ sort: s.key, page: '1' })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                sort === s.key
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}
            >
              {s.label}
            </Link>
          ))}
          <span className="text-xs text-gray-400 mr-auto">
            صفحة {page} من {totalPages}
          </span>
        </div>
      </div>

      {/* Hadith cards */}
      <div className="space-y-3">
        {rows.map((r, idx) => {
          const tarf = stripTags(r.tarf)
          const content = stripTags(r.content)
          const displayText = tarf || content

          return (
            <div
              key={r.hadith_id}
              className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm hover:border-green-200 transition-all"
            >
              <div className="flex items-start gap-3">
                <span className="text-xs text-gray-300 shrink-0 w-6">
                  {(offset + idx + 1).toLocaleString('ar-EG')}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-bold">
                      قدسي
                    </span>
                    <Link
                      href={`/books/${r.book_id}`}
                      className="text-xs text-gray-500 hover:text-green-700"
                    >
                      {r.book_title}
                    </Link>
                    {r.book_death && (
                      <span className="text-xs text-gray-400">ت {r.book_death}هـ</span>
                    )}
                    {r.chain_count > 0 && (
                      <span className="text-xs text-gray-400">{r.chain_count} سند</span>
                    )}
                  </div>

                  <div className="text-sm text-gray-800 leading-loose mb-2">
                    {displayText.slice(0, 280)}
                    {displayText.length > 280 ? '...' : ''}
                  </div>

                  {r.say_text && (
                    <div className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mb-2">
                      <span className="font-semibold">الحكم: </span>
                      {r.say_text.slice(0, 150)}
                      {r.say_text.length > 150 ? '...' : ''}
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-xs flex-wrap">
                    <Link
                      href={`/hadith/${r.hadith_id}`}
                      className="text-green-700 hover:underline font-medium"
                    >
                      الحديث الكامل مع الإسناد ←
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {rows.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">
          لا توجد نتائج
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
          {page > 1 && (
            <Link
              href={buildUrl({ page: String(page - 1) })}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-green-400"
            >
              ← السابق
            </Link>
          )}
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const start = Math.max(1, Math.min(page - 2, totalPages - 4))
            const p = start + i
            if (p > totalPages) return null
            return (
              <Link
                key={p}
                href={buildUrl({ page: String(p) })}
                className={`text-xs px-3 py-1.5 rounded-lg border ${
                  p === page
                    ? 'bg-green-800 text-white border-green-800'
                    : 'border-gray-200 hover:border-green-400'
                }`}
              >
                {p.toLocaleString('ar-EG')}
              </Link>
            )
          })}
          {page < totalPages && (
            <Link
              href={buildUrl({ page: String(page + 1) })}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-green-400"
            >
              التالي ←
            </Link>
          )}
        </div>
      )}

      {/* Methodological note */}
      <div className="bg-gray-50 rounded-xl p-4 mt-5 text-xs text-gray-500">
        <p className="font-semibold text-gray-700 mb-1">ملاحظة منهجية:</p>
        <p>
          يعتمد الاستخراج على البحث في نص الطرف والمتن عن عبارات الإسناد الإلهي ولفظ &ldquo;قدسي&rdquo;.
          قد تُستثنى بعض الأحاديث القدسية إذا لم تحوِ هذه العبارات صراحةً، كما قد تُضمَّن بعض
          الأحاديث التي تحكي عن أحداث بأسلوب الخطاب الإلهي دون أن تكون قدسية بالمعنى الاصطلاحي.
        </p>
      </div>

      {/* Related links */}
      <div className="mt-4 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/search" className="text-green-700 hover:underline">
          ← البحث المتقدم
        </Link>
        <Link href="/hadiths/ilal" className="text-green-700 hover:underline">
          ← علل الحديث
        </Link>
        <Link href="/hadith-terms" className="text-green-700 hover:underline">
          ← مصطلح الحديث
        </Link>
        <Link href="/hadiths/mawquf" className="text-green-700 hover:underline">
          ← الموقوف والمرسل
        </Link>
      </div>
    </div>
  )
}
