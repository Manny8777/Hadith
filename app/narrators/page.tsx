import Link from 'next/link'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

interface Narrator {
  id: number
  name: string
  abb_name: string | null
  death_year_num: number | null
  hadiths_count: number | null
  martaba_ibn_hajar: string | null
  is_companion: boolean
}

interface SearchParams {
  q?: string
  page?: string
}

export default async function NarratorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const q = sp.q ?? ''
  const page = Math.max(1, parseInt(sp.page ?? '1', 10))
  const limit = 30
  const offset = (page - 1) * limit

  let narrators: Narrator[] = []
  let total = 0

  try {
    if (q.trim()) {
      const pattern = `%${q.trim()}%`
      const [countRes, dataRes] = await Promise.all([
        pool.query(`SELECT COUNT(*) FROM narrators WHERE name ILIKE $1`, [pattern]),
        pool.query<Narrator>(
          `SELECT id, name, abb_name, death_year_num, hadiths_count, martaba_ibn_hajar, is_companion
           FROM narrators WHERE name ILIKE $1
           ORDER BY hadiths_count DESC NULLS LAST, name
           LIMIT $2 OFFSET $3`,
          [pattern, limit, offset]
        ),
      ])
      total = parseInt(countRes.rows[0].count, 10)
      narrators = dataRes.rows
    } else {
      const [countRes, dataRes] = await Promise.all([
        pool.query(`SELECT COUNT(*) FROM narrators`),
        pool.query<Narrator>(
          `SELECT id, name, abb_name, death_year_num, hadiths_count, martaba_ibn_hajar, is_companion
           FROM narrators
           ORDER BY hadiths_count DESC NULLS LAST, name
           LIMIT $1 OFFSET $2`,
          [limit, offset]
        ),
      ])
      total = parseInt(countRes.rows[0].count, 10)
      narrators = dataRes.rows
    }
  } catch (err) {
    console.error('Narrators page error:', err)
  }

  const totalPages = Math.ceil(total / limit)

  const buildHref = (p: number) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return `/narrators${qs ? '?' + qs : ''}`
  }

  const gradingBadge = (grade: string | null) => {
    if (!grade) return null
    let cls = 'bg-gray-100 text-gray-500'
    if (/ثقة|صحيح|عدل/.test(grade)) cls = 'bg-green-100 text-green-700'
    else if (/صدوق|حسن/.test(grade)) cls = 'bg-amber-100 text-amber-700'
    else if (/ضعيف|منكر/.test(grade)) cls = 'bg-red-100 text-red-600'
    return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{grade}</span>
  }

  return (
    <div dir="rtl" className="min-h-screen bg-amber-50">
      {/* Header */}
      <header className="bg-green-900 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-5">
          <div className="flex items-center justify-between mb-4">
            <Link href="/" className="text-amber-200 hover:text-white text-sm transition-colors">
              ← الرئيسية
            </Link>
            <h1 className="text-xl font-bold text-amber-100">رواة الحديث</h1>
            <span className="text-amber-300 text-sm">{total.toLocaleString('ar-EG')} راوٍ</span>
          </div>

          {/* Search Form */}
          <form method="GET" action="/narrators" className="relative">
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="ابحث باسم الراوي..."
              className="w-full bg-white/10 border border-white/20 text-white placeholder-white/50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-300 transition-colors"
            />
            <button
              type="submit"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-300 hover:text-white transition-colors text-sm"
            >
              بحث
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Results summary */}
        {q && (
          <div className="mb-4 flex items-center gap-2">
            <span className="text-gray-600 text-sm">
              نتائج البحث عن: <strong className="text-green-800">{q}</strong>
            </span>
            <Link href="/narrators" className="text-xs text-gray-400 hover:text-gray-600 underline">
              إلغاء
            </Link>
          </div>
        )}

        {/* Narrator Cards */}
        {narrators.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
            لا توجد نتائج
          </div>
        ) : (
          <div className="space-y-2">
            {narrators.map((narrator) => (
              <Link
                key={narrator.id}
                href={`/narrator/${narrator.id}`}
                className="block bg-white rounded-xl border border-gray-100 hover:border-green-200 hover:shadow-sm px-5 py-3.5 transition-all group"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {narrator.is_companion && (
                      <span className="shrink-0 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        صحابي
                      </span>
                    )}
                    <span className="text-green-900 font-medium group-hover:text-green-700 transition-colors truncate">
                      {narrator.name}
                    </span>
                    {gradingBadge(narrator.martaba_ibn_hajar)}
                  </div>
                  <div className="shrink-0 flex items-center gap-4 text-sm text-gray-400">
                    {narrator.death_year_num && (
                      <span>ت. {narrator.death_year_num} هـ</span>
                    )}
                    {narrator.hadiths_count != null && narrator.hadiths_count > 0 && (
                      <span className="text-green-700 font-medium">
                        {narrator.hadiths_count.toLocaleString('ar-EG')} حديث
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2 flex-wrap">
            {page > 1 && (
              <Link
                href={buildHref(page - 1)}
                className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm transition-colors"
              >
                السابق
              </Link>
            )}
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              let p: number
              if (totalPages <= 7) {
                p = i + 1
              } else if (page <= 4) {
                p = i + 1
              } else if (page >= totalPages - 3) {
                p = totalPages - 6 + i
              } else {
                p = page - 3 + i
              }
              return (
                <Link
                  key={p}
                  href={buildHref(p)}
                  className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
                    p === page
                      ? 'bg-green-800 text-white border-green-800'
                      : 'border-gray-200 bg-white text-green-800 hover:border-green-300'
                  }`}
                >
                  {p.toLocaleString('ar-EG')}
                </Link>
              )
            })}
            {page < totalPages && (
              <Link
                href={buildHref(page + 1)}
                className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm transition-colors"
              >
                التالي
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
