import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface BookRow { id: number; title: string; takhrij_author: string | null; takhrij_death: number | null }
interface NarratorRow {
  id: number
  name: string
  martaba_ibn_hajar: string | null
  martaba_zahabi: string | null
  tabaqa: string | null
  tabaqa_num: number | null
  is_companion: boolean
  death_year_num: number | null
  hadith_cnt: number
  min_pos: number
}

function martabaColor(m: string | null, isCompanion: boolean) {
  if (isCompanion) return 'bg-amber-100 text-amber-800 border-amber-200'
  if (!m) return 'bg-gray-100 text-gray-500 border-gray-200'
  if (/ثقة|ثبت|حجة|عدل/.test(m)) return 'bg-green-100 text-green-700 border-green-200'
  if (/صدوق|مقبول|لا بأس/.test(m)) return 'bg-amber-100 text-amber-700 border-amber-200'
  if (/ضعيف|منكر|متروك|كذاب/.test(m)) return 'bg-red-100 text-red-700 border-red-200'
  return 'bg-gray-100 text-gray-500 border-gray-200'
}

export default async function MashyakhaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string; sort?: string; pos?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const bookId = parseInt(id)
  if (isNaN(bookId)) notFound()

  const pg = Math.max(1, parseInt(sp.page || '1'))
  const sort = sp.sort || 'count' // 'count' | 'name' | 'tabaqa' | 'death'
  const posFilter = sp.pos ? parseInt(sp.pos) : null // filter by chain position
  const limit = 60
  const offset = (pg - 1) * limit

  const bookRes = await pool.query<BookRow>(
    `SELECT id, title, takhrij_author, takhrij_death FROM books WHERE id = $1`,
    [bookId]
  )
  if (!bookRes.rows[0]) notFound()
  const book = bookRes.rows[0]

  // Sort clause
  const orderClause =
    sort === 'name'   ? 'n.name ASC' :
    sort === 'tabaqa' ? 'n.tabaqa_num ASC NULLS LAST, hadith_cnt DESC' :
    sort === 'death'  ? 'n.death_year_num ASC NULLS LAST' :
    'hadith_cnt DESC'

  const posClause = posFilter !== null ? `AND $3 = ANY(ic.narrator_id_array[1:1])` : ''
  // Note: position filter is complex with unnest; we'll do it differently

  const narratorsRes = await pool.query<NarratorRow>(
    `SELECT n.id, n.name, n.martaba_ibn_hajar, n.martaba_zahabi, n.tabaqa, n.tabaqa_num,
            n.is_companion, n.death_year_num,
            COUNT(DISTINCT iha.hadith_id)::int AS hadith_cnt,
            MIN(pos.ord)::int AS min_pos
     FROM isnad_hadiths iha
     JOIN isnad_chains ic ON ic.id = iha.isnad_id
     JOIN hadith_toc ht ON ht.main_id = iha.hadith_id AND ht.book_id = $1
     JOIN LATERAL unnest(ic.narrator_id_array) WITH ORDINALITY AS pos(nar_id, ord) ON true
     JOIN narrators n ON n.id = pos.nar_id
     GROUP BY n.id, n.name, n.martaba_ibn_hajar, n.martaba_zahabi, n.tabaqa, n.tabaqa_num,
              n.is_companion, n.death_year_num
     ORDER BY ${orderClause}
     LIMIT $2 OFFSET $3`,
    [bookId, limit, offset]
  ).catch(() => ({ rows: [] as NarratorRow[] }))

  const countRes = await pool.query<{ cnt: number }>(
    `SELECT COUNT(DISTINCT n.id)::int AS cnt
     FROM isnad_hadiths iha
     JOIN isnad_chains ic ON ic.id = iha.isnad_id
     JOIN hadith_toc ht ON ht.main_id = iha.hadith_id AND ht.book_id = $1
     JOIN LATERAL unnest(ic.narrator_id_array) AS nar_id ON true
     JOIN narrators n ON n.id = nar_id`,
    [bookId]
  ).catch(() => ({ rows: [{ cnt: 0 }] }))

  const narrators = narratorsRes.rows
  const totalNarrators = countRes.rows[0]?.cnt || 0
  const totalPages = Math.ceil(totalNarrators / limit)

  // Breakdown by position
  const posBreakRes = await pool.query<{ pos: number; cnt: number }>(
    `SELECT pos.ord::int AS pos, COUNT(DISTINCT n.id)::int AS cnt
     FROM isnad_hadiths iha
     JOIN isnad_chains ic ON ic.id = iha.isnad_id
     JOIN hadith_toc ht ON ht.main_id = iha.hadith_id AND ht.book_id = $1
     JOIN LATERAL unnest(ic.narrator_id_array) WITH ORDINALITY AS pos(nar_id, ord) ON true
     JOIN narrators n ON n.id = pos.nar_id
     GROUP BY pos.ord
     ORDER BY pos.ord
     LIMIT 10`,
    [bookId]
  ).catch(() => ({ rows: [] }))

  const posCounts = posBreakRes.rows

  function sortLink(s: string, label: string) {
    const active = sort === s
    return (
      <Link
        href={`/books/${bookId}/mashyakha?sort=${s}&page=1`}
        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
          active
            ? 'bg-green-900 text-white border-green-900'
            : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
        }`}
      >
        {label}
      </Link>
    )
  }

  return (
    <div dir="rtl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4 flex-wrap">
        <Link href="/books" className="text-green-700 hover:underline">الكتب</Link>
        <span>←</span>
        <Link href={`/books/${bookId}`} className="text-green-700 hover:underline">{book.title}</Link>
        <span>←</span>
        <span className="text-gray-700">المشيخة</span>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">مشيخة {book.title}</h1>
        <p className="text-sm text-gray-500">
          {book.takhrij_author && <span className="ml-2">{book.takhrij_author}</span>}
          {book.takhrij_death && <span>(ت {book.takhrij_death} هـ)</span>}
        </p>
        <p className="text-sm text-gray-400 mt-1">
          {totalNarrators.toLocaleString('ar-EG')} راوٍ في أسانيد هذا الكتاب
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800">
        المشيخة = قائمة جميع الرواة الواردين في أسانيد الكتاب — من الصحابة إلى رجال الإسناد.
        العدد الظاهر = عدد الأحاديث التي يرد فيها الراوي في السند.
      </div>

      {/* Chain position distribution */}
      {posCounts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4 shadow-sm">
          <div className="text-xs font-medium text-gray-600 mb-2">رواة حسب موضعهم في السند:</div>
          <div className="flex items-center gap-3 flex-wrap">
            {posCounts.map(p => (
              <div key={p.pos} className="text-center">
                <div className="text-xs text-gray-400">المرتبة {p.pos}</div>
                <div className="text-sm font-bold text-green-700">{p.cnt.toLocaleString('ar-EG')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sort controls */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <span className="text-xs text-gray-500">الترتيب:</span>
        {sortLink('count', 'الأكثر وروداً')}
        {sortLink('name', 'الاسم')}
        {sortLink('tabaqa', 'الطبقة')}
        {sortLink('death', 'التسلسل الزمني')}
        <span className="text-xs text-gray-400 mr-auto">
          الصفحة {pg} / {totalPages} — {totalNarrators.toLocaleString('ar-EG')} راوٍ
        </span>
      </div>

      {/* Narrator grid */}
      <div className="grid gap-2">
        {narrators.map((n, idx) => {
          const grade = n.is_companion ? 'صحابي' : n.martaba_ibn_hajar
          return (
            <Link
              key={n.id}
              href={`/narrator/${n.id}`}
              className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3 hover:shadow-sm hover:border-green-200 transition-all group"
            >
              {/* Row number */}
              <span className="text-xs text-gray-300 shrink-0 w-6 text-left">
                {((pg - 1) * limit + idx + 1).toLocaleString('ar-EG')}
              </span>

              {/* Narrator info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900 group-hover:text-green-800 truncate">
                    {n.name}
                  </span>
                  {grade && (
                    <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${martabaColor(n.martaba_ibn_hajar, n.is_companion)}`}>
                      {grade}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  {n.tabaqa && <span className="text-xs text-gray-400">{n.tabaqa}</span>}
                  {n.death_year_num && <span className="text-xs text-gray-400">ت {n.death_year_num}</span>}
                  <span className="text-xs text-gray-400">المرتبة {n.min_pos} في السند</span>
                </div>
              </div>

              {/* Hadith count */}
              <div className="shrink-0 text-left">
                <span className="text-sm font-bold text-green-700">
                  {n.hadith_cnt.toLocaleString('ar-EG')}
                </span>
                <div className="text-xs text-gray-400">حديث</div>
              </div>
            </Link>
          )
        })}
      </div>

      {narrators.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center text-gray-500">
          لا توجد بيانات إسناد لهذا الكتاب
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
          {pg > 1 && (
            <Link
              href={`/books/${bookId}/mashyakha?sort=${sort}&page=${pg - 1}`}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm"
            >
              السابق
            </Link>
          )}
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const p = totalPages <= 5 ? i + 1 : Math.max(1, Math.min(pg - 2, totalPages - 4)) + i
            return (
              <Link
                key={p}
                href={`/books/${bookId}/mashyakha?sort=${sort}&page=${p}`}
                className={`px-4 py-2 rounded-lg border text-sm ${
                  p === pg ? 'bg-green-800 text-white border-green-800' : 'border-gray-200 bg-white text-green-800 hover:border-green-300'
                }`}
              >
                {p.toLocaleString('ar-EG')}
              </Link>
            )
          })}
          {pg < totalPages && (
            <Link
              href={`/books/${bookId}/mashyakha?sort=${sort}&page=${pg + 1}`}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm"
            >
              التالي
            </Link>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="mt-6 flex items-center gap-4 flex-wrap text-sm">
        <Link href={`/books/${bookId}`} className="text-green-700 hover:underline">← صفحة الكتاب</Link>
        <Link href={`/books/${bookId}/analysis`} className="text-green-700 hover:underline">← تحليل الكتاب</Link>
        <Link href={`/books/${bookId}/hadiths`} className="text-green-700 hover:underline">← تصفح الأحاديث</Link>
      </div>
    </div>
  )
}
