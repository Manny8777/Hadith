import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'الرواة في مصادر متعددة — جامع خادم الحرمين' }

interface NarratorRow {
  id: number
  name: string
  abb_name: string | null
  martaba_ibn_hajar: string | null
  is_companion: boolean
  death_year: string | null
  tabaqa: string | null
  hadiths_count: number | null
  book_count: number
  book_titles: string | null
}

function gradeClass(g: string | null) {
  if (!g) return 'bg-gray-100 text-gray-500'
  if (/ثقة|ثبت|حجة|صحابي/.test(g)) return 'bg-green-100 text-green-700'
  if (/صدوق|لا بأس|مقبول/.test(g)) return 'bg-amber-100 text-amber-700'
  if (/ضعيف|متروك/.test(g)) return 'bg-red-100 text-red-600'
  return 'bg-gray-100 text-gray-500'
}

function bookCountColor(cnt: number) {
  if (cnt >= 8) return 'bg-purple-700 text-white'
  if (cnt >= 6) return 'bg-green-700 text-white'
  if (cnt >= 4) return 'bg-amber-600 text-white'
  return 'bg-gray-500 text-white'
}

export default async function MultiBookNarratorsPage({
  searchParams,
}: {
  searchParams: Promise<{ min_books?: string; grade?: string; page?: string; companion?: string }>
}) {
  const sp = await searchParams
  const minBooks = Math.max(2, Math.min(15, parseInt(sp.min_books || '6')))
  const grade = sp.grade?.trim() || ''
  const pg = Math.max(1, parseInt(sp.page || '1'))
  const companionOnly = sp.companion === '1'
  const limit = 60
  const offset = (pg - 1) * limit

  // Build parameterized query parts
  const narratorParams: (string | number)[] = [minBooks]
  const gradeClause = grade
    ? `AND n.martaba_ibn_hajar ILIKE $${narratorParams.push(`%${grade}%`)}`
    : ''
  const companionClause = companionOnly ? 'AND n.is_companion = true' : ''

  const countParams: (string | number)[] = [minBooks]
  const countGradeClause = grade
    ? `AND n.martaba_ibn_hajar ILIKE $${countParams.push(`%${grade}%`)}`
    : ''

  const [narratorsRes, totalRes, bookDistRes] = await Promise.all([
    pool.query<NarratorRow>(
      `SELECT n.id, n.name, n.abb_name, n.martaba_ibn_hajar, n.is_companion,
              n.death_year, n.tabaqa, n.hadiths_count,
              book_stats.book_count, book_stats.book_titles
       FROM (
         SELECT nb.narrator_id,
                COUNT(DISTINCT nb.book_id)::int AS book_count,
                STRING_AGG(DISTINCT b.title, ' · ' ORDER BY b.title) AS book_titles
         FROM narrator_books nb
         JOIN books b ON b.id = nb.book_id
         GROUP BY nb.narrator_id
         HAVING COUNT(DISTINCT nb.book_id) >= $1
       ) book_stats
       JOIN narrators n ON n.id = book_stats.narrator_id
       WHERE true ${gradeClause} ${companionClause}
       ORDER BY book_stats.book_count DESC, n.hadiths_count DESC NULLS LAST
       LIMIT ${limit} OFFSET ${offset}`,
      narratorParams
    ).catch(() => ({ rows: [] as NarratorRow[] })),

    pool.query<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt
       FROM (
         SELECT nb.narrator_id
         FROM narrator_books nb
         GROUP BY nb.narrator_id
         HAVING COUNT(DISTINCT nb.book_id) >= $1
       ) sub
       JOIN narrators n ON n.id = sub.narrator_id
       WHERE true ${companionOnly ? 'AND n.is_companion = true' : ''} ${countGradeClause}`,
      countParams
    ).catch(() => ({ rows: [{ cnt: 0 }] })),

    pool.query<{ book_count: number; cnt: number }>(
      `SELECT sub.book_count::int, COUNT(*)::int AS cnt
       FROM (
         SELECT nb.narrator_id, COUNT(DISTINCT nb.book_id) AS book_count
         FROM narrator_books nb
         GROUP BY nb.narrator_id
       ) sub
       WHERE sub.book_count >= 2
       GROUP BY sub.book_count
       ORDER BY sub.book_count DESC
       LIMIT 15`
    ).catch(() => ({ rows: [] as { book_count: number; cnt: number }[] })),
  ])

  const narrators = narratorsRes.rows
  const total = totalRes.rows[0]?.cnt || 0
  const totalPages = Math.ceil(total / limit)
  const bookDist = bookDistRes.rows
  const maxDistCnt = bookDist[0]?.cnt || 1

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('min_books', String(minBooks))
    if (grade) p.set('grade', grade)
    if (companionOnly) p.set('companion', '1')
    p.set('page', '1')
    Object.entries(overrides).forEach(([k, v]) => {
      if (v) p.set(k, v); else p.delete(k)
    })
    return `/narrators/multi-book?${p.toString()}`
  }

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الرواة في مصادر متعددة</h1>
        <p className="text-sm text-gray-500 mb-3">
          الرواة الذين ورد ذكرهم في أكبر عدد من كتب الحديث —
          يعكس مدى انتشار روايتهم وقبول علماء الحديث لأحاديثهم
        </p>

        {/* Distribution bar chart */}
        {bookDist.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 mb-3">
            <p className="text-xs text-gray-400 mb-2">توزيع الرواة بعدد الكتب</p>
            <div className="flex items-end gap-1 h-16">
              {bookDist.map(d => (
                <Link key={d.book_count} href={buildUrl({ min_books: String(d.book_count) })}
                  className="flex flex-col items-center gap-0.5 flex-1 group"
                  title={`${d.book_count} كتب: ${d.cnt} راوٍ`}>
                  <div className={`w-full rounded-t transition-all ${
                    d.book_count === minBooks
                      ? 'bg-green-700'
                      : 'bg-green-200 group-hover:bg-green-400'
                  }`}
                    style={{ height: `${Math.max(4, Math.min(40, (d.cnt / maxDistCnt) * 40))}px` }} />
                  <div className="text-center" style={{ fontSize: '9px' }}>
                    <div className={`font-medium ${d.book_count === minBooks ? 'text-green-700' : 'text-gray-500'}`}>
                      {d.book_count}
                    </div>
                    <div className="text-gray-400">{d.cnt.toLocaleString('ar-EG')}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Min books filter */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">أدنى عدد كتب:</span>
          {[2, 3, 4, 5, 6, 8, 10, 12].map(n => (
            <Link key={n} href={buildUrl({ min_books: String(n) })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                minBooks === n
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {n}+
            </Link>
          ))}
          <span className="text-xs text-gray-400 mr-auto">
            {total.toLocaleString('ar-EG')} راوٍ
          </span>
        </div>

        {/* Grade and companion filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={buildUrl({ grade: '' })}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              !grade ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
            }`}>
            كل الدرجات
          </Link>
          {['ثقة', 'صدوق', 'ضعيف'].map(g => (
            <Link key={g} href={buildUrl({ grade: g })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                grade === g ? 'bg-amber-700 text-white border-amber-700' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'
              }`}>
              {g}
            </Link>
          ))}
          <Link href={buildUrl({ companion: companionOnly ? '' : '1' })}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              companionOnly ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'
            }`}>
            الصحابة فقط
          </Link>
        </div>
      </div>

      {/* Research note */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4 text-xs text-blue-800">
        الراوي الذي يظهر في 6+ كتب أو أكثر هو من "رجال الكتب الستة أو أكثر" — ويُعدّ من أكثر الرواة قبولاً
        في الدراسات الحديثية. يساعد هذا المقياس في تحديد "قطب الرواية" في كل طبقة.
      </div>

      <div className="space-y-2">
        {narrators.map((n, idx) => (
          <Link key={n.id} href={`/narrator/${n.id}`}
            className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3 hover:shadow-sm hover:border-green-200 transition-all group">

            <span className="text-xs text-gray-300 w-6 shrink-0 text-left">
              {(offset + idx + 1).toLocaleString('ar-EG')}
            </span>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {n.is_companion && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full border border-amber-200">صحابي</span>
                )}
                <span className="font-semibold text-sm text-green-900 group-hover:text-green-700">
                  {n.abb_name || n.name}
                </span>
                {n.martaba_ibn_hajar && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${gradeClass(n.martaba_ibn_hajar)}`}>
                    {n.martaba_ibn_hajar.split('،')[0].trim().slice(0, 15)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                {n.death_year && <span className="text-xs text-gray-400">ت {n.death_year}هـ</span>}
                {n.tabaqa && <span className="text-xs text-gray-400">{n.tabaqa}</span>}
              </div>
            </div>

            <div className="shrink-0 flex flex-col items-end gap-1">
              <span className={`text-xs px-2 py-1 rounded-full font-bold ${bookCountColor(n.book_count)}`}>
                {n.book_count} كتاب
              </span>
              {n.hadiths_count ? (
                <span className="text-xs text-gray-400">{n.hadiths_count.toLocaleString('ar-EG')} ح</span>
              ) : null}
            </div>
          </Link>
        ))}
      </div>

      {narrators.length === 0 && (
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-8 text-center text-gray-500">
          لا توجد رواة بهذا الشرط
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
        <Link href="/narrators/sahihayn" className="text-green-700 hover:underline">← رجال الصحيحين</Link>
        <Link href="/narrators" className="text-green-700 hover:underline">← بحث الرواة</Link>
        <Link href="/narrators/network" className="text-green-700 hover:underline">← محورية الرواة</Link>
      </div>
    </div>
  )
}
