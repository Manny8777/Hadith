import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'تفرد الكتب — جامع خادم الحرمين' }

interface BookUniqueness {
  id: number
  title: string
  takhrij_author: string | null
  takhrij_death: number | null
  total_hadiths: number
  unique_hadiths: number
  shared_hadiths: number
  uniqueness_pct: number
}

function uniquenessColor(pct: number) {
  if (pct >= 70) return 'bg-purple-100 text-purple-800'
  if (pct >= 50) return 'bg-indigo-100 text-indigo-700'
  if (pct >= 30) return 'bg-green-100 text-green-700'
  if (pct >= 15) return 'bg-amber-100 text-amber-700'
  return 'bg-red-50 text-red-700'
}

function barColor(pct: number) {
  if (pct >= 70) return 'bg-purple-500'
  if (pct >= 50) return 'bg-indigo-500'
  if (pct >= 30) return 'bg-green-500'
  if (pct >= 15) return 'bg-amber-500'
  return 'bg-red-400'
}

export default async function BooksUniquenessPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; min_hadiths?: string }>
}) {
  const sp = await searchParams
  const sort = sp.sort || 'uniqueness_pct'
  const minHadiths = Math.max(50, parseInt(sp.min_hadiths || '100'))

  const orderBy = sort === 'total' ? 'total_hadiths DESC' :
    sort === 'unique' ? 'unique_hadiths DESC' :
    sort === 'death' ? 'takhrij_death ASC NULLS LAST' :
    'uniqueness_pct DESC'

  const booksRes = await pool.query<BookUniqueness>(
    `SELECT b.id, b.title, b.takhrij_author, b.takhrij_death,
            COUNT(DISTINCT t.hadith_id)::int AS total_hadiths,
            COUNT(DISTINCT CASE WHEN sub.source_count = 1 THEN t.hadith_id END)::int AS unique_hadiths,
            COUNT(DISTINCT CASE WHEN sub.source_count > 1 THEN t.hadith_id END)::int AS shared_hadiths,
            ROUND(
              COUNT(DISTINCT CASE WHEN sub.source_count = 1 THEN t.hadith_id END)::numeric
              / NULLIF(COUNT(DISTINCT t.hadith_id), 0) * 100
            , 1)::float AS uniqueness_pct
     FROM books b
     JOIN takhrij t ON t.book_id = b.id
     JOIN (
       SELECT group_id, COUNT(DISTINCT book_id)::int AS source_count
       FROM takhrij
       GROUP BY group_id
     ) sub ON sub.group_id = t.group_id
     GROUP BY b.id, b.title, b.takhrij_author, b.takhrij_death
     HAVING COUNT(DISTINCT t.hadith_id) >= $1
     ORDER BY ${orderBy}`,
    [minHadiths]
  ).catch(() => ({ rows: [] as BookUniqueness[] }))

  const books = booksRes.rows
  const maxUnique = Math.max(...books.map(b => b.unique_hadiths), 1)

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('sort', sort)
    p.set('min_hadiths', String(minHadiths))
    Object.entries(overrides).forEach(([k, v]) => p.set(k, v))
    return `/books/uniqueness?${p.toString()}`
  }

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">تفرد الكتب — مدى أصالة المحتوى</h1>
        <p className="text-sm text-gray-500 mb-3">
          نسبة الأحاديث الفريدة في كل كتاب مقارنةً بالأحاديث المشتركة مع غيره —
          يكشف عن مدى الاستقلالية البحثية لكل مصدر حديثي
        </p>

        <div className="bg-green-50 border border-green-100 rounded-xl p-3 mb-4 text-xs text-green-800">
          <span className="font-semibold">معلومة بحثية: </span>
          كتاب ذو نسبة تفرد عالية يعني أنه وعاء لأحاديث لا توجد في غيره — أهمية خاصة للتخريج.
          كتاب ذو نسبة تفرد منخفضة يعني معظم أحاديثه موجودة في كتب أخرى — قوة في التواتر والمتابعة.
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">ترتيب:</span>
          {[
            { key: 'uniqueness_pct', label: 'نسبة التفرد' },
            { key: 'unique', label: 'عدد الأحاديث الفردة' },
            { key: 'total', label: 'عدد الأحاديث الكلي' },
            { key: 'death', label: 'تاريخ التأليف' },
          ].map(s => (
            <Link key={s.key} href={buildUrl({ sort: s.key })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                sort === s.key
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {s.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">الحد الأدنى:</span>
          {[50, 100, 500, 1000].map(n => (
            <Link key={n} href={buildUrl({ min_hadiths: String(n) })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                minHadiths === n
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {n}+ حديث
            </Link>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mb-4 flex-wrap text-xs">
        {[
          { label: '70%+ تفرد', cls: 'bg-purple-100 text-purple-800' },
          { label: '50-70%', cls: 'bg-indigo-100 text-indigo-700' },
          { label: '30-50%', cls: 'bg-green-100 text-green-700' },
          { label: '15-30%', cls: 'bg-amber-100 text-amber-700' },
          { label: 'أقل من 15%', cls: 'bg-red-50 text-red-700' },
        ].map(l => (
          <span key={l.label} className={`px-2 py-0.5 rounded-full ${l.cls}`}>{l.label}</span>
        ))}
      </div>

      <div className="space-y-3">
        {books.map((b, idx) => (
          <div key={b.id} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm hover:border-green-200 transition-all">
            <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-300">{(idx + 1).toLocaleString('ar-EG')}</span>
                  <Link href={`/books/${b.id}`}
                    className="font-bold text-green-900 hover:underline text-sm">
                    {b.title}
                  </Link>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {b.takhrij_author}
                  {b.takhrij_death && ` (ت ${b.takhrij_death}هـ)`}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${uniquenessColor(b.uniqueness_pct)}`}>
                  {b.uniqueness_pct}% تفرد
                </span>
                <Link href={`/books/${b.id}/isnad-profile`}
                  className="text-xs text-indigo-600 hover:underline">ملف الإسناد</Link>
              </div>
            </div>

            {/* Bars */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-20 text-right shrink-0">الأحاديث الفردة</span>
                <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-3 rounded-full ${barColor(b.uniqueness_pct)}`}
                    style={{ width: `${(b.unique_hadiths / maxUnique) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-gray-700 w-16 text-left shrink-0">
                  {b.unique_hadiths.toLocaleString('ar-EG')} ح
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-20 text-right shrink-0">المشتركة</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gray-400 h-2 rounded-full"
                    style={{ width: `${(b.shared_hadiths / maxUnique) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400 w-16 text-left shrink-0">
                  {b.shared_hadiths.toLocaleString('ar-EG')} ح
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-20 text-right shrink-0">الإجمالي</span>
                <div className="flex-1 flex items-center gap-1">
                  {/* Stacked bar showing unique vs shared */}
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden flex">
                    <div
                      className={`h-2 ${barColor(b.uniqueness_pct)}`}
                      style={{ width: `${b.uniqueness_pct}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs font-medium text-gray-700 w-16 text-left shrink-0">
                  {b.total_hadiths.toLocaleString('ar-EG')} ح
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {books.length === 0 && (
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-8 text-center text-gray-500">
          لا توجد نتائج
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/books" className="text-green-700 hover:underline">← الكتب</Link>
        <Link href="/books/intersection" className="text-green-700 hover:underline">← تقاطع الكتب</Link>
        <Link href="/unique-hadiths" className="text-green-700 hover:underline">← الأحاديث الفردة</Link>
      </div>
    </div>
  )
}
