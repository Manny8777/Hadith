import pool from '@/lib/db'
import Link from 'next/link'
import StretchedLink from '@/app/components/StretchedLink'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'الأحاديث غير المحكوم عليها — جامع خادم الحرمين' }

interface UnjudgedHadith {
  hadith_id: number
  tarf: string | null
  book_title: string
  book_id: number
  chain_count: number
  dorar_hukm: string | null
}

interface BookStat {
  book_id: number
  title: string
  unjudged_count: number
  total_count: number
}

function stripTags(s: string | null) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

// No ruling in the program's own judgments (hadith_judgments)…
const NO_JUDGMENT = `NOT EXISTS (SELECT 1 FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id)`
// …and, in the main list, none from al-Durar al-Saniyya either (dorar_rulings, filled by
// scripts/dorar-crawl.mjs and keyed by book and printed number, as on the hadith page). Those with a
// Dorar ruling are listed separately (?dorar=1), so the counts follow the crawl as it goes.
// The ruled numbers are gathered once and hash-joined: a lookup per hadith (EXISTS) took 30s+.
const WITH_DORAR = `WITH dn AS MATERIALIZED (SELECT DISTINCT book_id, number FROM dorar_rulings)`
const JOIN_DORAR = `LEFT JOIN dn ON dn.book_id = ht.book_id AND dn.number = btrim(ht.tarqeem_matboa1)`
const HAS_DORAR = `dn.book_id IS NOT NULL`

export default async function UnjudgedPage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string; page?: string; dorar?: string }>
}) {
  const sp = await searchParams
  const bookId = sp.book ? parseInt(sp.book) : null
  const dorarView = sp.dorar === '1'
  const pg = Math.max(1, parseInt(sp.page || '1'))
  const limit = 40
  const offset = (pg - 1) * limit
  const viewClause = dorarView ? `AND ${HAS_DORAR}` : `AND dn.book_id IS NULL`

  const bookParam: (string | number)[] = []
  const bookClause = bookId
    ? `AND ht.book_id = $${bookParam.push(bookId)}`
    : ''

  const countParams: (string | number)[] = []
  const countBookClause = bookId
    ? `AND ht.book_id = $${countParams.push(bookId)}`
    : ''

  const [hadiths, countsRes, booksRes] = await Promise.all([
    pool.query<UnjudgedHadith>(
      `${WITH_DORAR}
       SELECT ht.main_id AS hadith_id,
              regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g') AS tarf,
              b.title AS book_title, b.id AS book_id,
              (
                SELECT COUNT(DISTINCT ih2.isnad_id)::int
                FROM isnad_hadiths ih2
                WHERE ih2.hadith_id = ht.main_id
              ) AS chain_count,
              ${dorarView ? `(
                SELECT d.hukm FROM dorar_rulings d
                WHERE d.book_id = ht.book_id AND d.number = btrim(ht.tarqeem_matboa1)
                ORDER BY d.dorar_source_id NULLS LAST LIMIT 1
              )` : 'NULL'} AS dorar_hukm
       FROM hadith_toc ht
       JOIN books b ON b.id = ht.book_id
       ${JOIN_DORAR}
       WHERE ht.is_leaf = true AND ht.is_paragraph = true
         ${bookClause}
         AND ${NO_JUDGMENT}
         ${viewClause}
       ORDER BY ht.main_id
       LIMIT ${limit} OFFSET ${offset}`,
      bookParam
    ).catch(() => ({ rows: [] as UnjudgedHadith[] })),

    // Both counts at once: with no ruling anywhere, and with a Dorar ruling only
    pool.query<{ none: number; dorar: number }>(
      `${WITH_DORAR}
       SELECT COUNT(*) FILTER (WHERE dn.book_id IS NULL)::int AS none,
              COUNT(*) FILTER (WHERE ${HAS_DORAR})::int AS dorar
       FROM hadith_toc ht
       ${JOIN_DORAR}
       WHERE ht.is_leaf = true AND ht.is_paragraph = true
         ${countBookClause}
         AND ${NO_JUDGMENT}`,
      countParams
    ).catch(() => ({ rows: [{ none: 0, dorar: 0 }] })),

    pool.query<BookStat>(
      `${WITH_DORAR}
       SELECT b.id AS book_id, b.title,
              COUNT(*)::int AS unjudged_count,
              (SELECT COUNT(*)::int FROM hadith_toc ht2 WHERE ht2.book_id = b.id AND ht2.is_leaf AND ht2.is_paragraph) AS total_count
       FROM hadith_toc ht
       JOIN books b ON b.id = ht.book_id
       ${JOIN_DORAR}
       WHERE ht.is_leaf = true AND ht.is_paragraph = true
         AND ${NO_JUDGMENT}
         ${viewClause}
       GROUP BY b.id, b.title
       ORDER BY unjudged_count DESC
       LIMIT 30`,
      []
    ).catch(() => ({ rows: [] as BookStat[] })),
  ])

  const noneCount = countsRes.rows[0]?.none || 0
  const dorarCount = countsRes.rows[0]?.dorar || 0
  const total = dorarView ? dorarCount : noneCount
  const totalPages = Math.ceil(total / limit)
  const books = booksRes.rows

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    if (bookId) p.set('book', String(bookId))
    if (dorarView) p.set('dorar', '1')
    p.set('page', '1')
    Object.entries(overrides).forEach(([k, v]) => {
      if (v) p.set(k, v); else p.delete(k)
    })
    return `/hadiths/unjudged?${p.toString()}`
  }

  const selectedBook = books.find(b => b.book_id === bookId)

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">
          {dorarView ? 'أحاديث حكمُها في الدرر السنية وحدها' : 'الأحاديث غير المحكوم عليها'}
        </h1>
        <p className="text-sm text-gray-500 mb-3">
          {dorarView
            ? 'أحاديث ليس لها حكمٌ في أحكام البرنامج، ولها خلاصة حكمٍ في الدرر السنية'
            : 'أحاديث لم يُسجَّل لها حكمٌ في أحكام البرنامج ولا في الدرر السنية — تمثل فرصاً للبحث العلمي والتحقيق في صحتها'}
        </p>

        {/* the other list, so nothing leaves this page silently */}
        <div className="bg-green-50 border border-green-100 rounded-xl p-3 mb-3 text-xs text-green-900 flex items-center justify-between gap-3 flex-wrap">
          {dorarView ? (
            <>
              <span>هذه القائمة ما استُثني من «غير المحكوم عليها» لأن له حكمًا في الدرر السنية.</span>
              <Link href={buildUrl({ dorar: '' })} className="font-semibold text-green-800 hover:underline">
                ← العودة إلى غير المحكوم عليها ({noneCount.toLocaleString('ar-EG')})
              </Link>
            </>
          ) : (
            <>
              <span>
                يُستثنى ما له حكمٌ في الدرر السنية: <b>{dorarCount.toLocaleString('ar-EG')}</b> حديثًا
                {bookId ? ' في هذا الكتاب' : ''} — ويزيد العدد كلما جُلبت أحكامٌ جديدة.
              </span>
              {dorarCount > 0 && (
                <Link href={buildUrl({ dorar: '1' })} className="font-semibold text-green-800 hover:underline">
                  عرضها ←
                </Link>
              )}
            </>
          )}
        </div>

        {!dorarView && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4 text-xs text-amber-800">
            <span className="font-semibold">ملاحظة بحثية: </span>
            غياب الحكم لا يعني ضعف الحديث — قد يكون الحديث صحيحاً لكن لم يُدرَس بعد في إطار هذه القاعدة.
            هذه الأحاديث تستحق الدراسة المستقلة بالرجوع إلى مصادر التخريج الكلاسيكية.
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-green-800 text-white rounded-xl p-3 text-center">
            <div className="text-xl font-bold">{total.toLocaleString('ar-EG')}</div>
            <div className="text-xs opacity-80">
              {dorarView
                ? (bookId ? 'حكمها في الدرر وحدها في الكتاب' : 'حكمها في الدرر وحدها')
                : (bookId ? 'غير محكوم في الكتاب' : 'إجمالي غير المحكوم')}
            </div>
          </div>
          {selectedBook && (
            <div className="bg-indigo-700 text-white rounded-xl p-3 text-center">
              <div className="text-xl font-bold">
                {selectedBook.total_count > 0
                  ? `${Math.round((selectedBook.unjudged_count / selectedBook.total_count) * 100)}%`
                  : '—'}
              </div>
              <div className="text-xs opacity-80">{dorarView ? 'من أحاديث الكتاب' : 'نسبة غير المحكوم'}</div>
            </div>
          )}
        </div>

        {/* Book filter */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
          <p className="text-xs text-gray-500 mb-2">
            {dorarView ? 'تصفية بالكتاب:' : 'تصفية بالكتاب (أكثر الكتب في الأحاديث غير المحكومة):'}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={dorarView ? '/hadiths/unjudged?dorar=1' : '/hadiths/unjudged'}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                !bookId ? 'bg-green-800 text-white border-green-800' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              الجميع
            </Link>
            {books.slice(0, 15).map(b => (
              <Link key={b.book_id} href={buildUrl({ book: String(b.book_id) })}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  bookId === b.book_id
                    ? 'bg-green-800 text-white border-green-800'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
                }`}>
                {b.title.slice(0, 20)} ({b.unjudged_count.toLocaleString('ar-EG')})
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {hadiths.rows.map((h, idx) => (
          <div key={h.hadith_id}
            className="relative block bg-white rounded-xl border border-gray-100 px-4 py-4 hover:shadow-sm hover:border-amber-200 transition-all group">
            <StretchedLink href={`/hadith/${h.hadith_id}`} label={`الحديث ${h.hadith_id}`} />
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-300">{(offset + idx + 1).toLocaleString('ar-EG')}</span>
                <Link href={`/books/${h.book_id}`}
                  className="relative z-10 text-xs text-green-700 font-medium hover:underline">
                  {h.book_title}
                </Link>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {h.chain_count > 0 && (
                  <span className="text-xs text-gray-400">{h.chain_count} سند</span>
                )}
                {dorarView ? (
                  <span className="text-xs bg-green-50 text-green-800 border border-green-100 px-2 py-0.5 rounded-full">
                    الدرر السنية: {h.dorar_hukm || '—'}
                  </span>
                ) : (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                    لم يُحكم عليه
                  </span>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed line-clamp-2 group-hover:text-green-900">
              {stripTags(h.tarf).slice(0, 220) || '...'}
            </p>
          </div>
        ))}
      </div>

      {hadiths.rows.length === 0 && (
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-8 text-center text-gray-500">
          {dorarView ? 'لا توجد أحاديث بهذا الفلتر' : 'لا توجد أحاديث غير محكوم عليها بهذا الفلتر'}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
          {pg > 1 && (
            <Link href={buildUrl({ page: String(pg - 1) })}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
              السابق
            </Link>
          )}
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const start = Math.max(1, Math.min(pg - 2, totalPages - 4))
            const p = start + i
            if (p > totalPages) return null
            return (
              <Link key={p} href={buildUrl({ page: String(p) })}
                className={`px-3 py-2 rounded-lg border text-sm ${
                  p === pg ? 'bg-green-800 text-white border-green-800' : 'border-gray-200 bg-white text-green-800 hover:border-green-300'
                }`}>
                {p.toLocaleString('ar-EG')}
              </Link>
            )
          })}
          {pg < totalPages && (
            <Link href={buildUrl({ page: String(pg + 1) })}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
              التالي
            </Link>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/scholars" className="text-green-700 hover:underline">← أحكام المحدثين</Link>
        <Link href="/unique-hadiths" className="text-green-700 hover:underline">← الأحاديث الفردة</Link>
        <Link href="/hadiths/most-attested" className="text-green-700 hover:underline">← الأوسع انتشاراً</Link>
      </div>
    </div>
  )
}
