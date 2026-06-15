import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'الموقوف والمرسل والمقطوع — جامع خادم الحرمين' }

interface HadithRow {
  hadith_id: number
  tarf: string | null
  book_title: string
  book_id: number
  say_text: string
  chain_count: number
}

interface BookRow {
  id: number
  title: string
}

type IsnadType = 2 | 3 | 4

interface CategoryDef {
  key: string
  label: string
  desc: string
  types: IsnadType[]
  color: string
  textColor: string
  borderColor: string
  bgCard: string
  badgeColor: string
}

const CATEGORIES: CategoryDef[] = [
  {
    key: 'mawquf',
    label: 'موقوف',
    desc: 'ينتهي عند الصحابي',
    types: [2],
    color: 'bg-amber-50',
    textColor: 'text-amber-900',
    borderColor: 'border-amber-200',
    bgCard: 'bg-amber-50',
    badgeColor: 'bg-amber-100 text-amber-800',
  },
  {
    key: 'maqtuu',
    label: 'مقطوع',
    desc: 'ينتهي عند التابعي',
    types: [3],
    color: 'bg-orange-50',
    textColor: 'text-orange-900',
    borderColor: 'border-orange-200',
    bgCard: 'bg-orange-50',
    badgeColor: 'bg-orange-100 text-orange-800',
  },
  {
    key: 'mursal',
    label: 'مرسل',
    desc: 'التابعي يروي مباشرة عن النبي ﷺ',
    types: [4],
    color: 'bg-blue-50',
    textColor: 'text-blue-900',
    borderColor: 'border-blue-200',
    bgCard: 'bg-blue-50',
    badgeColor: 'bg-blue-100 text-blue-800',
  },
  {
    key: 'all',
    label: 'الكل',
    desc: 'موقوف + مقطوع + مرسل',
    types: [2, 3, 4],
    color: 'bg-gray-50',
    textColor: 'text-gray-900',
    borderColor: 'border-gray-200',
    bgCard: 'bg-gray-50',
    badgeColor: 'bg-gray-100 text-gray-700',
  },
]

function stripTags(s: string | null) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function isnadTypeLabel(t: IsnadType): string {
  const labels: Record<IsnadType, string> = {
    2: 'موقوف',
    3: 'مقطوع',
    4: 'مرسل',
  }
  return labels[t] || 'غير محدد'
}

export default async function MawqufPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; page?: string; book?: string }>
}) {
  const sp = await searchParams
  const activeKey = sp.cat || 'mawquf'
  const page = Math.max(1, parseInt(sp.page || '1'))
  const bookFilter = sp.book ? parseInt(sp.book) : 0
  const pageSize = 25
  const offset = (page - 1) * pageSize

  const cat = CATEGORIES.find(c => c.key === activeKey) || CATEGORIES[0]
  const typeList = cat.types.join(',')

  // Build book filter clause
  const bookParams: (string | number)[] = []
  const bookClause = bookFilter > 0 ? `AND ht.book_id = $${bookParams.push(bookFilter)}` : ''

  const [countsRes, hadithsRes, booksRes] = await Promise.all([
    // Count per category using isnad_hadiths.isnad_type
    Promise.all(
      CATEGORIES.map(c =>
        pool
          .query<{ cnt: number }>(
            `SELECT COUNT(DISTINCT ih.hadith_id)::int AS cnt
             FROM isnad_hadiths ih
             WHERE ih.isnad_type = ANY($1::int[])`,
            [c.types]
          )
          .catch(() => ({ rows: [{ cnt: 0 }] }))
      )
    ),

    // Hadith list with join to hadith_toc and books
    pool
      .query<HadithRow & { isnad_type: IsnadType }>(
        `SELECT DISTINCT ON (ih.hadith_id)
                ih.hadith_id,
                ih.isnad_type,
                regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g') AS tarf,
                b.title AS book_title,
                b.id AS book_id,
                (SELECT hj.say_text FROM hadith_judgments hj
                 WHERE hj.hadith_id = ih.hadith_id LIMIT 1) AS say_text,
                (SELECT COUNT(DISTINCT ih2.isnad_id)::int
                 FROM isnad_hadiths ih2
                 WHERE ih2.hadith_id = ih.hadith_id) AS chain_count
         FROM isnad_hadiths ih
         JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
                            AND ht.is_leaf = true AND ht.is_paragraph = true
         JOIN books b ON b.id = ht.book_id
         WHERE ih.isnad_type = ANY($1::int[])
           ${bookClause}
         ORDER BY ih.hadith_id
         LIMIT $${bookParams.length + 1} OFFSET $${bookParams.length + 2}`,
        [...cat.types, ...bookParams, pageSize, offset]
      )
      .catch(() => ({ rows: [] as (HadithRow & { isnad_type: IsnadType })[] })),

    // Books that have hadiths of these isnad types
    pool
      .query<BookRow>(
        `SELECT DISTINCT b.id, b.title
         FROM isnad_hadiths ih
         JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
                            AND ht.is_leaf = true AND ht.is_paragraph = true
         JOIN books b ON b.id = ht.book_id
         WHERE ih.isnad_type = ANY($1::int[])
         ORDER BY b.title
         LIMIT 50`,
        [cat.types]
      )
      .catch(() => ({ rows: [] as BookRow[] })),
  ])

  const categoryCounts = CATEGORIES.map((c, i) => ({
    ...c,
    count: countsRes[i]?.rows[0]?.cnt || 0,
  }))
  const hadiths = hadithsRes.rows
  const books = booksRes.rows

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('cat', activeKey)
    if (bookFilter) p.set('book', String(bookFilter))
    p.set('page', String(page))
    Object.entries(overrides).forEach(([k, v]) => {
      if (v) p.set(k, v)
      else p.delete(k)
    })
    return `/hadiths/mawquf?${p.toString()}`
  }

  const DEFS: Record<string, string> = {
    mawquf:
      'ما رُوي عن الصحابي قولاً أو فعلاً ولم يُسنده إلى النبي ﷺ — قد يكون له حكم الرفع إذا قال العلماء ذلك',
    maqtuu:
      'ما رُوي عن التابعي أو من بعده قولاً أو فعلاً، ولا يُعدُّ حديثاً مرفوعاً',
    mursal:
      'ما رواه التابعي عن النبي ﷺ مباشرةً دون ذكر الصحابي — وهو من أنواع الضعف عند جمهور المحدثين',
    all: 'يجمع الموقوف والمقطوع والمرسل — جميع الأحاديث التي لا تصل سنداً إلى النبي ﷺ مرفوعاً',
  }

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الموقوف والمرسل والمقطوع</h1>
        <p className="text-sm text-gray-500 mb-2">
          أحاديث مصنَّفة بحسب نوع الإسناد من جداول الأسانيد — موقوف على الصحابي أو مقطوع عند التابعي أو مرسل
        </p>
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5 text-xs text-amber-700">
          التصنيف مأخوذ من حقل{' '}
          <span className="font-mono font-bold">isnad_type</span> في جدول الأسانيد مباشرةً
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {categoryCounts.map(c => (
          <Link
            key={c.key}
            href={buildUrl({ cat: c.key, page: '1' })}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border font-medium text-sm transition-all
              ${
                activeKey === c.key
                  ? `${c.color} ${c.textColor} ${c.borderColor} shadow-sm`
                  : 'bg-white border-gray-100 text-gray-500 hover:border-gray-200'
              }`}
          >
            <span className="font-bold">{c.label}</span>
            <span className="text-xs opacity-70 hidden sm:inline">{c.desc}</span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeKey === c.key ? 'bg-white/60' : 'bg-gray-100'
              }`}
            >
              {c.count.toLocaleString('ar-EG')}
            </span>
          </Link>
        ))}
      </div>

      {/* Definition box */}
      <div className={`rounded-xl border px-4 py-3 mb-4 ${cat.color} ${cat.borderColor}`}>
        <span className={`text-sm font-semibold ${cat.textColor} ml-2`}>{cat.label}:</span>
        <span className="text-sm text-gray-600">{DEFS[cat.key]}</span>
      </div>

      {/* Book filter */}
      {books.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-3 mb-4">
          <p className="text-xs text-gray-500 mb-2">تصفية بالكتاب:</p>
          <div className="flex flex-wrap gap-1.5">
            <Link
              href={buildUrl({ book: '', page: '1' })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                !bookFilter
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}
            >
              كل الكتب
            </Link>
            {books.slice(0, 20).map(b => (
              <Link
                key={b.id}
                href={buildUrl({ book: String(b.id), page: '1' })}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  bookFilter === b.id
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'
                }`}
              >
                {b.title.slice(0, 25)}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-gray-400 mb-3">
        {hadiths.length === pageSize
          ? `${pageSize.toLocaleString('ar-EG')} نتيجة في الصفحة`
          : `${hadiths.length.toLocaleString('ar-EG')} نتيجة`}{' '}
        — صفحة {page.toLocaleString('ar-EG')}
      </div>

      {/* Hadith cards */}
      <div className="space-y-3">
        {hadiths.map((h, idx) => (
          <div
            key={h.hadith_id}
            className={`rounded-xl border p-4 hover:shadow-sm transition-all ${cat.bgCard} ${cat.borderColor}`}
          >
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs text-gray-400 shrink-0">
                {(offset + idx + 1).toLocaleString('ar-EG')}
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cat.badgeColor}`}>
                {isnadTypeLabel(h.isnad_type)}
              </span>
              <Link
                href={`/books/${h.book_id}`}
                className="text-xs text-green-700 hover:underline font-medium"
              >
                {h.book_title}
              </Link>
              {h.chain_count > 0 && (
                <span className="text-xs text-gray-400">{h.chain_count} سند</span>
              )}
              <div className="mr-auto">
                <Link
                  href={`/hadith/${h.hadith_id}`}
                  className="text-xs text-green-700 hover:underline"
                >
                  تفاصيل ←
                </Link>
              </div>
            </div>
            <p className="text-sm text-gray-900 leading-relaxed mb-2">
              {stripTags(h.tarf).slice(0, 250)}
              {(stripTags(h.tarf).length > 250 || !h.tarf) ? '...' : ''}
            </p>
            {h.say_text && (
              <div className="text-xs text-amber-800 bg-white/60 border border-amber-100 rounded-lg px-2.5 py-1.5">
                <span className="font-medium">الحكم: </span>
                {h.say_text.slice(0, 120)}
                {h.say_text.length > 120 ? '...' : ''}
              </div>
            )}
          </div>
        ))}
      </div>

      {hadiths.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
          لا توجد نتائج لهذا التصنيف
        </div>
      )}

      {/* Pagination */}
      {(hadiths.length === pageSize || page > 1) && (
        <div className="flex gap-2 mt-5 justify-center">
          {page > 1 && (
            <Link
              href={buildUrl({ page: String(page - 1) })}
              className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300"
            >
              ← السابق
            </Link>
          )}
          <span className="text-sm text-gray-400 self-center">
            صفحة {page.toLocaleString('ar-EG')}
          </span>
          {hadiths.length === pageSize && (
            <Link
              href={buildUrl({ page: String(page + 1) })}
              className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300"
            >
              التالي →
            </Link>
          )}
        </div>
      )}

      {/* Related links */}
      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/ilal" className="text-green-700 hover:underline">
          ← علل الحديث
        </Link>
        <Link href="/scholars/judgment-search" className="text-green-700 hover:underline">
          ← بحث الأحكام
        </Link>
        <Link href="/hadiths/grade-dispute" className="text-green-700 hover:underline">
          ← الخلاف في الدرجة
        </Link>
        <Link href="/hadiths/chain-gaps" className="text-green-700 hover:underline">
          ← كاشف الانقطاع
        </Link>
      </div>
    </div>
  )
}
