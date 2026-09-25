import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface BookGrade {
  book_id: number
  book_name: string
  total_judged: number
  sahih_count: number
  hasan_count: number
  daif_count: number
  mawdu_count: number
  other_count: number
  sahih_pct: number
  daif_pct: number
}

interface GradeDetail {
  judgment_text: string
  count: number
}

export default async function GradeByBookPage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string; sort?: string; minJudged?: string }>
}) {
  const sp = await searchParams
  const selectedBook = parseInt(sp.book || '0') || null
  const sortBy = sp.sort || 'daif'
  const minJudged = parseInt(sp.minJudged || '10')

  const orderSql = sortBy === 'sahih' ? 'sahih_pct DESC'
    : sortBy === 'total' ? 'total_judged DESC'
    : 'daif_pct DESC'

  const [booksRes, detailRes] = await Promise.all([
    pool.query<BookGrade>(
      `SELECT
         b.id AS book_id,
         b.title AS book_name,
         COUNT(DISTINCT hj.hadith_id)::int AS total_judged,
         COUNT(DISTINCT hj.hadith_id) FILTER (WHERE hj.say_text ~* 'صحيح')::int AS sahih_count,
         COUNT(DISTINCT hj.hadith_id) FILTER (WHERE hj.say_text ~* 'حسن' AND hj.say_text !~* 'صحيح')::int AS hasan_count,
         COUNT(DISTINCT hj.hadith_id) FILTER (WHERE hj.say_text ~* 'ضعيف')::int AS daif_count,
         COUNT(DISTINCT hj.hadith_id) FILTER (WHERE hj.say_text ~* 'موضوع|باطل|مكذوب')::int AS mawdu_count,
         COUNT(DISTINCT hj.hadith_id) FILTER (WHERE hj.say_text !~* 'صحيح|حسن|ضعيف|موضوع|باطل|مكذوب')::int AS other_count,
         ROUND(100.0 * COUNT(DISTINCT hj.hadith_id) FILTER (WHERE hj.say_text ~* 'صحيح')
               / NULLIF(COUNT(DISTINCT hj.hadith_id), 0))::int AS sahih_pct,
         ROUND(100.0 * COUNT(DISTINCT hj.hadith_id) FILTER (WHERE hj.say_text ~* 'ضعيف')
               / NULLIF(COUNT(DISTINCT hj.hadith_id), 0))::int AS daif_pct
       FROM books b
       JOIN hadith_toc ht ON ht.book_id = b.id AND ht.is_leaf = true AND ht.is_paragraph = true
       JOIN hadith_judgments hj ON hj.hadith_id = ht.main_id
       GROUP BY b.id, b.title
       HAVING COUNT(DISTINCT hj.hadith_id) >= $1
       ORDER BY ${orderSql}
       LIMIT 60`,
      [minJudged]
    ).catch(() => ({ rows: [] as BookGrade[] })),

    selectedBook ? pool.query<GradeDetail>(
      `SELECT
         hj.say_text AS judgment_text,
         COUNT(DISTINCT hj.hadith_id)::int AS count
       FROM hadith_toc ht
       JOIN hadith_judgments hj ON hj.hadith_id = ht.main_id
       WHERE ht.book_id = $1 AND ht.is_leaf = true AND ht.is_paragraph = true
       GROUP BY hj.say_text
       ORDER BY COUNT(DISTINCT hj.hadith_id) DESC
       LIMIT 30`,
      [selectedBook]
    ).catch(() => ({ rows: [] as GradeDetail[] })) : Promise.resolve({ rows: [] as GradeDetail[] }),
  ])

  const books = booksRes.rows
  const details = detailRes.rows
  const selected = selectedBook ? books.find(b => b.book_id === selectedBook) : null

  const maxTotal = Math.max(...books.map(b => b.total_judged), 1)

  const SORT_OPTIONS = [
    { key: 'daif', label: 'الأعلى ضعفاً' },
    { key: 'sahih', label: 'الأعلى صحةً' },
    { key: 'total', label: 'الأكثر أحكاماً' },
  ]

  const MIN_JUDGED_OPTIONS = [5, 10, 20, 50]

  function judgmentCategory(text: string) {
    if (/صحيح/.test(text)) return 'sahih'
    if (/حسن/.test(text) && !/صحيح/.test(text)) return 'hasan'
    if (/ضعيف/.test(text)) return 'daif'
    if (/موضوع|باطل|مكذوب/.test(text)) return 'mawdu'
    return 'other'
  }

  const catColor: Record<string, string> = {
    sahih: 'bg-green-500',
    hasan: 'bg-blue-400',
    daif: 'bg-red-400',
    mawdu: 'bg-gray-700',
    other: 'bg-gray-300',
  }
  const catLabel: Record<string, string> = {
    sahih: 'صحيح', hasan: 'حسن', daif: 'ضعيف', mawdu: 'موضوع', other: 'أخرى'
  }

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">درجات الأحاديث حسب الكتاب</h1>
        <p className="text-sm text-gray-500">
          نسب الصحيح والحسن والضعيف في كل كتاب — مؤشر إحصائي لدراسة موثوقية كل مصنَّف وتخصصه في نوع الأحاديث
        </p>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {SORT_OPTIONS.map(s => (
          <a key={s.key}
            href={`/hadiths/grade-by-book?sort=${s.key}&minJudged=${minJudged}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${sortBy === s.key ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
            {s.label}
          </a>
        ))}
        <span className="text-gray-200">|</span>
        <span className="text-xs text-gray-500">الحد الأدنى:</span>
        {MIN_JUDGED_OPTIONS.map(m => (
          <a key={m}
            href={`/hadiths/grade-by-book?sort=${sortBy}&minJudged=${m}`}
            className={`text-xs px-2.5 py-1 rounded-full border ${minJudged === m ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-gray-600 border-gray-200'}`}>
            {m}+
          </a>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <div className="sm:col-span-3">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-green-50 px-4 py-2 border-b border-green-100 text-xs text-green-800 font-medium flex items-center justify-between">
              <span>الكتب — {SORT_OPTIONS.find(s => s.key === sortBy)?.label}</span>
              <div className="flex gap-3 text-gray-500">
                <span className="text-green-600">■ صحيح</span>
                <span className="text-blue-500">■ حسن</span>
                <span className="text-red-400">■ ضعيف</span>
              </div>
            </div>
            <div className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
              {books.map(bk => {
                const isSelected = selectedBook === bk.book_id
                const total = bk.total_judged
                const sahihW = Math.round((bk.sahih_count / total) * 100)
                const hasanW = Math.round((bk.hasan_count / total) * 100)
                const daifW = Math.round((bk.daif_count / total) * 100)
                const mawduW = Math.round((bk.mawdu_count / total) * 100)
                const barW = Math.round((total / maxTotal) * 64)
                return (
                  <a key={bk.book_id}
                    href={`/hadiths/grade-by-book?sort=${sortBy}&minJudged=${minJudged}&book=${bk.book_id}`}
                    className={`px-4 py-3 flex flex-col gap-1.5 hover:bg-green-50 transition-colors ${isSelected ? 'bg-green-50' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${isSelected ? 'text-green-900' : 'text-gray-800'} hover:underline`}>
                        {bk.book_name}
                      </span>
                      <span className="text-xs text-gray-400 mr-auto">{total.toLocaleString('ar-EG')} حكم</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="flex rounded-full overflow-hidden h-3" style={{ width: `${barW + 36}px` }}>
                        {sahihW > 0 && <div className="bg-green-500 h-3" style={{ width: `${sahihW}%` }} />}
                        {hasanW > 0 && <div className="bg-blue-400 h-3" style={{ width: `${hasanW}%` }} />}
                        {daifW > 0 && <div className="bg-red-400 h-3" style={{ width: `${daifW}%` }} />}
                        {mawduW > 0 && <div className="bg-gray-700 h-3" style={{ width: `${mawduW}%` }} />}
                      </div>
                      <div className="flex gap-2 text-xs mr-1">
                        {bk.sahih_count > 0 && <span className="text-green-700">{bk.sahih_pct}%ص</span>}
                        {bk.daif_count > 0 && <span className="text-red-500">{bk.daif_pct}%ض</span>}
                      </div>
                    </div>
                  </a>
                )
              })}
            </div>
          </div>
        </div>

        <div className="sm:col-span-2">
          {selected && details.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden sticky top-20">
              <div className="bg-green-50 px-4 py-3 border-b border-green-100">
                <h2 className="font-bold text-green-900 text-sm">{selected.book_name}</h2>
                <div className="flex gap-3 text-xs text-gray-500 mt-1 flex-wrap">
                  <span className="text-green-700">{selected.sahih_count} صحيح ({selected.sahih_pct}%)</span>
                  <span className="text-blue-600">{selected.hasan_count} حسن</span>
                  <span className="text-red-500">{selected.daif_count} ضعيف ({selected.daif_pct}%)</span>
                  {selected.mawdu_count > 0 && <span className="text-gray-700">{selected.mawdu_count} موضوع</span>}
                </div>
              </div>
              <div className="p-3 space-y-2 max-h-[55vh] overflow-y-auto">
                {(['sahih', 'hasan', 'daif', 'mawdu', 'other'] as const).map(cat => {
                  const catItems = details.filter(d => judgmentCategory(d.judgment_text) === cat)
                  if (catItems.length === 0) return null
                  return (
                    <div key={cat}>
                      <div className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-block mb-1.5 ${cat === 'sahih' ? 'bg-green-100 text-green-800' : cat === 'hasan' ? 'bg-blue-100 text-blue-800' : cat === 'daif' ? 'bg-red-100 text-red-800' : cat === 'mawdu' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        {catLabel[cat]}
                      </div>
                      <div className="space-y-1">
                        {catItems.map((d, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                              <div className={`h-1.5 rounded-full ${catColor[cat]}`}
                                style={{ width: `${Math.round((d.count / selected.total_judged) * 100)}%` }} />
                            </div>
                            <span className="text-gray-500 truncate max-w-28">{d.judgment_text.slice(0, 20)}</span>
                            <span className="text-gray-400 shrink-0">{d.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="px-4 py-2 border-t border-gray-50">
                <Link href={`/books/${selected.book_id}`} className="text-xs text-green-700 hover:underline">
                  ← صفحة الكتاب
                </Link>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl p-8 text-center">
              <div className="text-sm text-gray-400">اضغط على كتاب لعرض تفاصيل توزيع الأحكام فيه</div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/grade-evolution" className="text-green-700 hover:underline">← تطور التصحيح عبر القرون</Link>
        <Link href="/hadiths/divergent-judgments" className="text-green-700 hover:underline">← اختلاف العلماء</Link>
        <Link href="/books" className="text-green-700 hover:underline">← الكتب</Link>
      </div>
    </div>
  )
}
