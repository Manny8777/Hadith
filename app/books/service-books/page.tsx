export const dynamic = 'force-dynamic'
export const metadata = { title: 'الكتب الخدمية — جامع خادم الحرمين' }

import pool from '@/lib/db'
import Link from 'next/link'

interface ServiceBook {
  id: number
  title: string
  takhrij_author: string | null
  takhrij_death: number | null
  hadith_count: number
}

// Infer category from title keywords
function inferCategory(title: string): {
  label: string
  color: string
  bg: string
  border: string
} {
  const t = title
  if (/شرح|فتح|عمدة|إرشاد|توضيح|كشف|مفتاح|الإفصاح/.test(t))
    return { label: 'شروح', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' }
  if (/رجال|ثقات|ضعفاء|تهذيب|تقريب|الجرح|ميزان|لسان|كمال|إكمال|أسماء|معرفة الرواة|الكنى|التاريخ الكبير|التاريخ الصغير|الضعفاء|المتروك/.test(t))
    return { label: 'كتب الرجال', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' }
  if (/مصطلح|علوم الحديث|الباعث|اختصار|النخبة|تدريب|ألفية|نزهة|محاسن|أنواع/.test(t))
    return { label: 'مصطلح الحديث', color: 'text-teal-700', bg: 'bg-teal-50', border: 'border-teal-200' }
  if (/معجم|مسالك|بلدان|الأماكن|جغرافي|أطراف/.test(t))
    return { label: 'معاجم وجغرافيا', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' }
  if (/تاريخ|طبقات|سير|وفيات|ذيل|مرآة/.test(t))
    return { label: 'تواريخ وتراجم', color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200' }
  return { label: 'مراجع أخرى', color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' }
}

function centuryLabel(c: number): string {
  const n = Math.floor(c / 100) + 1
  const labels: Record<number, string> = {
    1: 'الأول', 2: 'الثاني', 3: 'الثالث', 4: 'الرابع', 5: 'الخامس',
    6: 'السادس', 7: 'السابع', 8: 'الثامن', 9: 'التاسع', 10: 'العاشر',
    11: 'الحادي عشر', 12: 'الثاني عشر', 13: 'الثالث عشر', 14: 'الرابع عشر',
  }
  return `القرن ${labels[n] || n} الهجري`
}

export default async function ServiceBooksPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; category?: string }>
}) {
  const sp = await searchParams
  const sort = sp.sort || 'death'
  const filterCategory = sp.category || ''

  const orderSql =
    sort === 'title' ? 'b.title' :
    sort === 'hadiths' ? 'hadith_count DESC, b.title' :
    'b.takhrij_death ASC NULLS LAST, b.title'

  const { rows: books } = await pool.query<ServiceBook>(
    `SELECT b.id, b.title, b.takhrij_author, b.takhrij_death,
            COUNT(hsc.id)::int AS hadith_count
     FROM books b
     LEFT JOIN hadith_service_content hsc ON hsc.book_id = b.id
     WHERE b.id IN (SELECT DISTINCT book_id FROM hadith_service_content WHERE book_id IS NOT NULL)
     GROUP BY b.id, b.title, b.takhrij_author, b.takhrij_death
     ORDER BY ${orderSql}`,
    []
  ).catch(() => ({ rows: [] as ServiceBook[] }))

  // Annotate each book with its inferred category
  const annotated = books.map(b => ({
    ...b,
    category: inferCategory(b.title),
  }))

  // Apply optional client-side category filter
  const filtered = filterCategory
    ? annotated.filter(b => b.category.label === filterCategory)
    : annotated

  // Group by century when sort === 'death'
  const groupByCentury = sort === 'death'
  const centuries: Record<string | number, typeof annotated> = {}
  if (groupByCentury) {
    for (const b of filtered) {
      const key = Number(b.takhrij_death) > 0
        ? Math.floor(Number(b.takhrij_death) / 100) * 100
        : 'undated'
      if (!centuries[key]) centuries[key] = []
      centuries[key].push(b)
    }
  }

  // All unique category labels for filter chips
  const allCategories = [...new Set(annotated.map(b => b.category.label))]

  // Stats
  const totalHadiths = filtered.reduce((s, b) => s + (b.hadith_count || 0), 0)
  const datedCount = filtered.filter(b => Number(b.takhrij_death) > 0).length

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('sort', sort)
    if (filterCategory) p.set('category', filterCategory)
    Object.entries(overrides).forEach(([k, v]) => {
      if (v) p.set(k, v)
      else p.delete(k)
    })
    return `/books/service-books?${p.toString()}`
  }

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="mb-2">
        <Link href="/books" className="text-sm text-green-700 hover:underline">← الكتب الحديثية</Link>
      </div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الكتب الخدمية</h1>
        <p className="text-sm text-gray-500 max-w-2xl leading-relaxed">
          هي المصنفات التي تخدم علم الحديث دون أن تكون مجاميع حديثية أولية — تشمل الشروح، وكتب الرجال والتراجم،
          والتواريخ، وكتب مصطلح الحديث، والمعاجم الجغرافية، وسائر المراجع المساعدة في التخريج والتحقيق.
          تُكتشف من وجود مادة خدمة أو ترجمة أو شرح فيها، وتُجمَّع هنا بصرف النظر عن قيم ترتيبها أو قوتها في المنظومة.
        </p>
      </div>

      {/* Summary banner */}
      <div className="bg-green-900 text-white rounded-2xl p-5 mb-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-amber-300">
              {filtered.length.toLocaleString('ar-EG')}
            </div>
            <div className="text-green-200 text-xs mt-0.5">
              {filterCategory ? `كتاب (${filterCategory})` : 'كتاب خدمي'}
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-300">
              {datedCount.toLocaleString('ar-EG')}
            </div>
            <div className="text-green-200 text-xs mt-0.5">كتاب مؤرَّخ</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-300">
              {totalHadiths > 0 ? totalHadiths.toLocaleString('ar-EG') : '—'}
            </div>
            <div className="text-green-200 text-xs mt-0.5">إجمالي المحتويات</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-300">
              {allCategories.length}
            </div>
            <div className="text-green-200 text-xs mt-0.5">أصناف</div>
          </div>
        </div>
      </div>

      {/* Info box */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-5 text-xs text-amber-800 leading-relaxed">
        <strong>ملاحظة منهجية: </strong>
        هذا الفهرس يعرض الكتب التي تحوي مادة خدمة أو ترجمة أو شرحاً. ولا تعتمد قراءته على أن قيم القوة والترتيب
        والشهرة تساوي صفراً: بعض هذه الكتب له تاريخ تراثي صحيح، وبعض قيمها غير مسجلة. الكتاب غير المؤرخ
        أو صفّر تاريخه يوضع في مجموعة «غير مؤرخ» بدلاً من القرن الأول. التصنيف أمام كل عنوان استُنبط من العنوان وقد يحتاج مراجعة.
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mb-5">
        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 shrink-0">ترتيب:</span>
          {[
            { key: 'death', label: 'تاريخي' },
            { key: 'title', label: 'أبجدي' },
            { key: 'hadiths', label: 'عدد المداخل' },
          ].map(s => (
            <Link
              key={s.key}
              href={buildUrl({ sort: s.key })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                sort === s.key
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 shrink-0">الصنف:</span>
          <Link
            href={buildUrl({ category: '' })}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              !filterCategory
                ? 'bg-green-800 text-white border-green-800'
                : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
            }`}
          >
            الكل
          </Link>
          {allCategories.map(cat => (
            <Link
              key={cat}
              href={buildUrl({ category: cat })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                filterCategory === cat
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}
            >
              {cat}
            </Link>
          ))}
        </div>
      </div>

      {/* Book list */}
      {filtered.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-10 text-center text-gray-400 text-sm">
          لا توجد كتب خدمية في قاعدة البيانات تطابق المعايير المحددة
        </div>
      ) : groupByCentury ? (
        /* Grouped by century */
        <div className="space-y-5">
          {[...Object.keys(centuries).filter(k => k !== 'undated').map(Number).sort((a, b) => a - b),
            ...(centuries['undated'] ? ['undated' as const] : [])
          ].map(key => {
            const group = centuries[key]
            if (!group || group.length === 0) return null
            const isUndated = key === 'undated'
            return (
              <div key={String(key)} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="bg-green-50 border-b border-green-100 px-5 py-3 flex items-center justify-between gap-3">
                  <h2 className="font-bold text-green-900 text-sm">
                    {isUndated ? 'كتب غير محددة التاريخ' : centuryLabel(Number(key))}
                    {!isUndated && (
                      <span className="text-xs font-normal text-green-600 mr-1">
                        ({Number(key)}–{Number(key) + 99} هـ)
                      </span>
                    )}
                  </h2>
                  <span className="text-xs text-green-700 font-semibold shrink-0">{group.length} كتاب</span>
                </div>
                <div className="p-4">
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {group.map(b => (
                      <BookCard key={b.id} book={b} />
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* Flat list */
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {filtered.map(b => (
            <BookCard key={b.id} book={b} />
          ))}
        </div>
      )}

      {/* Footer nav */}
      <div className="mt-8 flex flex-wrap items-center gap-4 text-sm">
        <Link href="/books" className="text-green-700 hover:underline">← الكتب الحديثية</Link>
        <Link href="/books/timeline" className="text-green-700 hover:underline">تاريخية التدوين</Link>
        <Link href="/books/stats" className="text-green-700 hover:underline">إحصاءات الدرجات</Link>
      </div>
    </div>
  )
}

// ── Sub-component: single book card ─────────────────────────────────────────

function BookCard({
  book,
}: {
  book: ServiceBook & { category: { label: string; color: string; bg: string; border: string } }
}) {
  return (
    <Link
      href={`/books/${book.id}`}
      className={`flex flex-col gap-1.5 p-3 rounded-xl border transition-all hover:shadow-sm group ${book.category.bg} ${book.category.border} hover:opacity-90`}
    >
      {/* Category badge */}
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs px-2 py-0.5 rounded-full bg-white/70 border ${book.category.border} ${book.category.color} shrink-0`}>
          {book.category.label}
        </span>
        {book.hadith_count > 0 && (
          <span className="text-xs text-gray-400 shrink-0">
            {book.hadith_count.toLocaleString('ar-EG')} محتوى
          </span>
        )}
      </div>

      {/* Title */}
      <p className="text-sm font-semibold text-green-900 leading-snug group-hover:underline line-clamp-2">
        {book.title}
      </p>

      {/* Author + death */}
      {(book.takhrij_author || Number(book.takhrij_death) > 0) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {book.takhrij_author && (
            <span className="text-xs text-gray-600">{book.takhrij_author}</span>
          )}
          {Number(book.takhrij_death) > 0 && (
            <span className="text-xs text-gray-400">(ت {book.takhrij_death} هـ)</span>
          )}
        </div>
      )}
    </Link>
  )
}
