import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface BookNarrator {
  id: number
  name: string
  abb_name: string | null
  martaba_ibn_hajar: string | null
  death_year_num: number | null
  tabaqa: string | null
  is_companion: boolean
  chain_appearances: number
  hadith_count: number
}

function gradeClass(g: string | null, isComp: boolean) {
  if (isComp) return 'bg-amber-100 text-amber-800'
  if (!g) return 'bg-gray-100 text-gray-500'
  if (g.includes('ثق') || g.includes('حافظ')) return 'bg-green-100 text-green-700'
  if (g.includes('صدوق') || g.includes('لا بأس') || g.includes('حسن')) return 'bg-amber-100 text-amber-700'
  if (g.includes('ضعيف') || g.includes('متروك') || g.includes('منكر')) return 'bg-red-100 text-red-600'
  if (g.includes('مجهول')) return 'bg-gray-100 text-gray-500'
  return 'bg-blue-50 text-blue-700'
}

export default async function BookIsnadProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ grade?: string; page?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const bookId = parseInt(id)
  if (isNaN(bookId)) notFound()

  const gradeFilter = sp.grade || ''
  const pg = Math.max(1, parseInt(sp.page || '1'))
  const limit = 60
  const offset = (pg - 1) * limit

  const gradeParams: (string | number)[] = [bookId]
  const gradeClause = gradeFilter
    ? `AND n.martaba_ibn_hajar ILIKE $${gradeParams.push(`%${gradeFilter}%`)}`
    : ''

  const [bookRes, narratorsRes, totalRes, gradeDistRes] = await Promise.all([
    pool.query(
      `SELECT id, title, takhrij_author, takhrij_death FROM books WHERE id = $1`,
      [bookId]
    ),

    pool.query<BookNarrator>(
      `SELECT n.id, n.name, n.abb_name, n.martaba_ibn_hajar,
              n.death_year_num, n.tabaqa, n.is_companion,
              COUNT(DISTINCT ic.id)::int AS chain_appearances,
              COUNT(DISTINCT ih.hadith_id)::int AS hadith_count
       FROM hadith_toc ht
       JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
       JOIN isnad_chains ic ON ic.id = ih.isnad_id
       JOIN LATERAL unnest(ic.narrator_id_array) WITH ORDINALITY AS pos(nar_id, ord) ON true
       JOIN narrators n ON n.id = pos.nar_id
       WHERE ht.book_id = $1 AND ht.is_leaf = true AND ht.is_paragraph = true
         ${gradeClause}
       GROUP BY n.id, n.name, n.abb_name, n.martaba_ibn_hajar, n.death_year_num, n.tabaqa, n.is_companion
       ORDER BY hadith_count DESC, chain_appearances DESC
       LIMIT ${limit} OFFSET ${offset}`,
      gradeParams
    ).catch(() => ({ rows: [] as BookNarrator[] })),

    pool.query<{ cnt: number }>(
      `SELECT COUNT(DISTINCT n.id)::int AS cnt
       FROM hadith_toc ht
       JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
       JOIN isnad_chains ic ON ic.id = ih.isnad_id
       JOIN LATERAL unnest(ic.narrator_id_array) AS pos(nar_id) ON true
       JOIN narrators n ON n.id = pos.nar_id
       WHERE ht.book_id = $1 AND ht.is_leaf = true`,
      [bookId]
    ).catch(() => ({ rows: [{ cnt: 0 }] })),

    pool.query<{ grade_label: string; cnt: number }>(
      `SELECT
         CASE
           WHEN n.is_companion THEN 'الصحابة'
           WHEN n.martaba_ibn_hajar ILIKE '%ثق%' OR n.martaba_ibn_hajar ILIKE '%حافظ%' THEN 'ثقة'
           WHEN n.martaba_ibn_hajar ILIKE '%صدوق%' OR n.martaba_ibn_hajar ILIKE '%لا بأس%' THEN 'صدوق'
           WHEN n.martaba_ibn_hajar ILIKE '%ضعيف%' OR n.martaba_ibn_hajar ILIKE '%متروك%' THEN 'ضعيف'
           WHEN n.martaba_ibn_hajar ILIKE '%مجهول%' THEN 'مجهول'
           ELSE 'غير محدد'
         END AS grade_label,
         COUNT(DISTINCT n.id)::int AS cnt
       FROM hadith_toc ht
       JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
       JOIN isnad_chains ic ON ic.id = ih.isnad_id
       JOIN LATERAL unnest(ic.narrator_id_array) AS pos(nar_id) ON true
       JOIN narrators n ON n.id = pos.nar_id
       WHERE ht.book_id = $1 AND ht.is_leaf = true
       GROUP BY grade_label
       ORDER BY cnt DESC`,
      [bookId]
    ).catch(() => ({ rows: [] as { grade_label: string; cnt: number }[] })),
  ])

  const book = bookRes.rows[0]
  if (!book) notFound()

  const narrators = narratorsRes.rows
  const total = totalRes.rows[0]?.cnt || 0
  const totalPages = Math.ceil(total / limit)
  const gradeDist = gradeDistRes.rows
  const maxCount = narrators[0]?.hadith_count || 1

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    if (gradeFilter) p.set('grade', gradeFilter)
    p.set('page', '1')
    Object.entries(overrides).forEach(([k, v]) => {
      if (v) p.set(k, v); else p.delete(k)
    })
    return `/books/${bookId}/isnad-profile?${p.toString()}`
  }

  const gradeOptions = [
    { key: '', label: 'الجميع' },
    { key: 'ثقة', label: 'ثقة' },
    { key: 'صدوق', label: 'صدوق' },
    { key: 'ضعيف', label: 'ضعيف' },
    { key: 'مجهول', label: 'مجهول' },
  ]

  return (
    <div dir="rtl">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4 flex-wrap">
        <Link href="/books" className="hover:text-green-700">الكتب</Link>
        <span>›</span>
        <Link href={`/books/${bookId}`} className="hover:text-green-700">{book.title}</Link>
        <span>›</span>
        <span className="text-gray-700">رجال الكتاب</span>
      </div>

      <div className="mb-5">
        <h1 className="text-xl font-bold text-green-900 mb-1">رجال {book.title}</h1>
        <p className="text-sm text-gray-500">
          الرواة الذين يمر بهم إسناد هذا الكتاب — مرتبون بعدد الأحاديث
          {book.takhrij_author && ` — ${book.takhrij_author}`}
          {book.takhrij_death && ` (ت ${book.takhrij_death}هـ)`}
        </p>
      </div>

      {/* Grade distribution */}
      {gradeDist.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
          <p className="text-xs text-gray-500 mb-2">توزيع درجات رواة الكتاب ({total.toLocaleString('ar-EG')} راوٍ):</p>
          <div className="flex items-center gap-2 flex-wrap">
            {gradeDist.map(d => (
              <span key={d.grade_label}
                className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  d.grade_label === 'ثقة' ? 'bg-green-100 text-green-700' :
                  d.grade_label === 'صدوق' ? 'bg-amber-100 text-amber-700' :
                  d.grade_label === 'الصحابة' ? 'bg-amber-200 text-amber-800' :
                  d.grade_label === 'ضعيف' ? 'bg-red-100 text-red-600' :
                  d.grade_label === 'مجهول' ? 'bg-gray-100 text-gray-600' :
                  'bg-blue-50 text-blue-600'
                }`}>
                {d.grade_label}: {d.cnt.toLocaleString('ar-EG')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Grade filter */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs text-gray-500">تصفية:</span>
        {gradeOptions.map(g => (
          <Link key={g.key} href={buildUrl({ grade: g.key })}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              gradeFilter === g.key
                ? 'bg-green-800 text-white border-green-800'
                : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
            }`}>
            {g.label}
          </Link>
        ))}
      </div>

      {/* Narrators list */}
      <div className="space-y-2">
        {narrators.map((n, idx) => (
          <div key={n.id} className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3 hover:border-green-200 hover:shadow-sm transition-all">
            <span className="text-xs text-gray-300 tabular-nums w-8 text-left shrink-0">
              {(offset + idx + 1).toLocaleString('ar-EG')}
            </span>

            {/* Bar */}
            <div className="w-20 bg-gray-100 rounded-full h-2 shrink-0">
              <div
                className="bg-green-600 h-2 rounded-full"
                style={{ width: `${(n.hadith_count / maxCount) * 100}%` }}
              />
            </div>

            <Link href={`/narrator/${n.id}`}
              className="font-semibold text-sm text-green-900 hover:text-green-700 hover:underline flex-1 truncate">
              {n.abb_name || n.name}
            </Link>

            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {n.is_companion && (
                <span className="text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-medium">صحابي</span>
              )}
              {n.martaba_ibn_hajar && !n.is_companion && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${gradeClass(n.martaba_ibn_hajar, false)}`}>
                  {n.martaba_ibn_hajar.slice(0, 8)}
                </span>
              )}
              {n.death_year_num && (
                <span className="text-xs text-gray-400">ت {n.death_year_num}</span>
              )}
              <span className="text-xs font-medium text-green-800 tabular-nums">
                {n.hadith_count.toLocaleString('ar-EG')} ح
              </span>
            </div>
          </div>
        ))}
      </div>

      {narrators.length === 0 && (
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-8 text-center text-gray-500">
          لم يُعثر على رواة بهذا الفلتر
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
        <Link href={`/books/${bookId}`} className="text-green-700 hover:underline">← الكتاب</Link>
        <Link href="/narrators/sahihayn" className="text-green-700 hover:underline">← رجال الصحيحين</Link>
        <Link href="/narrators/multi-book" className="text-green-700 hover:underline">← رواة الكتب المتعددة</Link>
      </div>
    </div>
  )
}
