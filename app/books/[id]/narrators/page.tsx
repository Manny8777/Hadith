export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

interface NarratorRow {
  id: number
  name: string
  abb_name: string | null
  martaba_ibn_hajar: string | null
  martaba_zahabi: string | null
  is_companion: boolean
  death_year_num: number | null
  hadiths_count: number | null
}

function gradeColor(grade: string | null) {
  if (!grade) return 'bg-gray-100 text-gray-500'
  if (/ثقة|صحيح|عدل|صحابي/.test(grade)) return 'bg-green-100 text-green-700'
  if (/صدوق|حسن|مقبول/.test(grade)) return 'bg-amber-100 text-amber-700'
  if (/ضعيف|منكر|متروك|كذاب/.test(grade)) return 'bg-red-100 text-red-600'
  return 'bg-gray-100 text-gray-500'
}

export default async function BookNarratorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ grade?: string; companion?: string; page?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const bookId = parseInt(id)
  const gradeFilter = sp.grade ?? ''
  const companionFilter = sp.companion === '1'
  const page = Math.max(1, parseInt(sp.page || '1'))
  const LIMIT = 60
  const offset = (page - 1) * LIMIT

  const bookRes = await pool.query('SELECT id, title, takhrij_author FROM books WHERE id = $1', [bookId])
  if (!bookRes.rows[0]) notFound()
  const book = bookRes.rows[0]

  const conditions: string[] = ['nb.book_id = $1']
  const params2: (string | boolean | number)[] = [bookId]
  let pi = 2

  if (companionFilter) {
    conditions.push(`n.is_companion = true`)
  }
  if (gradeFilter) {
    conditions.push(`(n.martaba_ibn_hajar ILIKE $${pi} OR n.martaba_zahabi ILIKE $${pi})`)
    params2.push(`%${gradeFilter}%`)
    pi++
  }

  const where = conditions.join(' AND ')

  const [narRes, countRes, statsRes] = await Promise.all([
    pool.query<NarratorRow>(
      `SELECT n.id, n.name, n.abb_name, n.martaba_ibn_hajar, n.martaba_zahabi,
              n.is_companion, n.death_year_num, n.hadiths_count
       FROM narrator_books nb
       JOIN narrators n ON n.id = nb.narrator_id
       WHERE ${where}
       ORDER BY n.is_companion DESC, n.hadiths_count DESC NULLS LAST, n.name
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params2, LIMIT, offset]
    ),
    pool.query(
      `SELECT COUNT(*) FROM narrator_books nb JOIN narrators n ON n.id = nb.narrator_id WHERE ${where}`,
      params2
    ),
    pool.query(
      `SELECT
         COUNT(*) as total,
         COUNT(CASE WHEN n.is_companion THEN 1 END) as companions,
         COUNT(CASE WHEN n.martaba_ibn_hajar ILIKE '%ثقة%' THEN 1 END) as thiqa,
         COUNT(CASE WHEN n.martaba_ibn_hajar ILIKE '%ضعيف%' THEN 1 END) as daif,
         COUNT(CASE WHEN n.martaba_ibn_hajar IS NOT NULL AND n.martaba_ibn_hajar != '' THEN 1 END) as graded
       FROM narrator_books nb JOIN narrators n ON n.id = nb.narrator_id
       WHERE nb.book_id = $1`,
      [bookId]
    ),
  ])

  const narrators = narRes.rows
  const total = parseInt(countRes.rows[0]?.count || '0')
  const stats = statsRes.rows[0]
  const totalPages = Math.ceil(total / LIMIT)

  const buildHref = (overrides: Record<string, string | number | undefined>) => {
    const p: Record<string, string> = {}
    if (gradeFilter) p.grade = gradeFilter
    if (companionFilter) p.companion = '1'
    if (page > 1) p.page = String(page)
    Object.entries(overrides).forEach(([k, v]) => {
      if (v !== undefined && v !== '') p[k] = String(v)
      else delete p[k]
    })
    const qs = new URLSearchParams(p).toString()
    return `/books/${bookId}/narrators${qs ? '?' + qs : ''}`
  }

  const GRADE_FILTERS = [
    { label: 'ثقة', pattern: 'ثقة' },
    { label: 'صدوق', pattern: 'صدوق' },
    { label: 'ضعيف', pattern: 'ضعيف' },
    { label: 'مجهول', pattern: 'مجهول' },
  ]

  return (
    <div dir="rtl" className="min-h-screen bg-amber-50">
      <header className="bg-green-900 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-5">
          <div className="flex items-center gap-2 text-sm mb-3 flex-wrap">
            <Link href="/books" className="text-amber-300 hover:text-amber-100">الكتب</Link>
            <span className="text-white/30">›</span>
            <Link href={`/books/${bookId}`} className="text-amber-300 hover:text-amber-100 truncate max-w-40">{book.title}</Link>
            <span className="text-white/30">›</span>
            <span className="text-white/70">رواة الكتاب</span>
          </div>
          <h1 className="text-lg font-bold text-amber-100">رواة كتاب: {book.title}</h1>

          {/* Stats row */}
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-amber-200/70">
            <span>{parseInt(stats.total).toLocaleString('ar-EG')} راوٍ</span>
            <span className="text-amber-400">{parseInt(stats.companions)} صحابي</span>
            <span className="text-green-300">{parseInt(stats.thiqa)} ثقة</span>
            {parseInt(stats.daif) > 0 && <span className="text-red-300">{parseInt(stats.daif)} ضعيف</span>}
            <span className="text-white/40">{parseInt(stats.graded)} مجرَّح ومعدَّل</span>
          </div>

          {/* Filters */}
          <div className="mt-4 flex flex-wrap gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                readOnly
                checked={companionFilter}
                onClick={() => { window.location.href = buildHref({ companion: companionFilter ? undefined : '1', page: undefined }) }}
                className="w-4 h-4 rounded text-amber-500"
              />
              <span className="text-white/80 text-xs">الصحابة فقط</span>
            </label>
            {GRADE_FILTERS.map(gf => (
              <a
                key={gf.label}
                href={buildHref({ grade: gradeFilter === gf.pattern ? undefined : gf.pattern, page: undefined })}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${
                  gradeFilter === gf.pattern
                    ? 'bg-amber-400 text-green-900 font-bold'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                {gf.label}
              </a>
            ))}
            {(gradeFilter || companionFilter) && (
              <a href={`/books/${bookId}/narrators`} className="text-xs text-white/40 hover:text-white/70 underline">
                إزالة التصفية
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm text-gray-500">{total.toLocaleString('ar-EG')} راوٍ</span>
          {totalPages > 1 && <span className="text-xs text-gray-400">صفحة {page} من {totalPages}</span>}
        </div>

        <div className="space-y-1.5">
          {narrators.map(n => (
            <Link
              key={n.id}
              href={`/narrator/${n.id}`}
              className="flex items-center justify-between gap-3 bg-white rounded-xl border border-gray-100 hover:border-green-200 hover:shadow-sm px-4 py-3 transition-all group"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                {n.is_companion && (
                  <span className="shrink-0 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">صحابي</span>
                )}
                <span className="text-green-900 font-medium group-hover:text-green-700 transition-colors">
                  {n.name}
                </span>
                {n.martaba_ibn_hajar && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${gradeColor(n.martaba_ibn_hajar)}`}>
                    {n.martaba_ibn_hajar}
                  </span>
                )}
              </div>
              <div className="shrink-0 flex items-center gap-3 text-xs text-gray-400">
                {n.death_year_num != null && n.death_year_num > 0 && (
                  <span>ت.{n.death_year_num}هـ</span>
                )}
                {n.hadiths_count != null && n.hadiths_count > 0 && (
                  <span className="text-green-700 font-semibold">{n.hadiths_count.toLocaleString('ar-EG')}</span>
                )}
              </div>
            </Link>
          ))}
        </div>

        {narrators.length === 0 && (
          <div className="bg-white rounded-2xl p-12 text-center text-gray-400 border border-gray-100">
            لا توجد نتائج
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2 flex-wrap">
            {page > 1 && (
              <a href={buildHref({ page: page - 1 })}
                className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
                السابق
              </a>
            )}
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              let pg: number
              if (totalPages <= 7) pg = i + 1
              else if (page <= 4) pg = i + 1
              else if (page >= totalPages - 3) pg = totalPages - 6 + i
              else pg = page - 3 + i
              return (
                <a key={pg} href={buildHref({ page: pg })}
                  className={`px-4 py-2 rounded-lg border text-sm ${pg === page ? 'bg-green-800 text-white border-green-800' : 'border-gray-200 bg-white text-green-800 hover:border-green-300'}`}>
                  {pg.toLocaleString('ar-EG')}
                </a>
              )
            })}
            {page < totalPages && (
              <a href={buildHref({ page: page + 1 })}
                className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
                التالي
              </a>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
