import pool from '@/lib/db'
import Link from 'next/link'
import NavigateSelect from '@/app/components/NavigateSelect'

export const dynamic = 'force-dynamic'

interface DivergentHadith {
  hadith_id: number
  hadith_text: string
  book_name: string
  chapter_name: string | null
  sahih_count: number
  daif_count: number
  sahih_scholars: string
  daif_scholars: string
  total_scholars: number
}

interface ConflictDetail {
  scholar_name: string
  judgment_text: string
  judgment_category: string
}

export default async function DivergentJudgmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; minScholar?: string; page?: string; book?: string }>
}) {
  const sp = await searchParams
  const selectedId = parseInt(sp.id || '0') || null
  const minScholar = parseInt(sp.minScholar || '2')
  const page = Math.max(1, parseInt(sp.page || '1'))
  const bookFilter = sp.book || ''
  const pageSize = 20
  const offset = (page - 1) * pageSize

  const [haditshRes, detailRes, booksRes] = await Promise.all([
    pool.query<DivergentHadith>(
      `SELECT
         ht.main_id AS hadith_id,
         LEFT(regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g'), 220) AS hadith_text,
         b.title AS book_name,
         ht.chapter_text AS chapter_name,
         COUNT(*) FILTER (WHERE hj.say_text ~* 'صحيح')::int AS sahih_count,
         COUNT(*) FILTER (WHERE hj.say_text ~* 'ضعيف|موضوع|منكر|باطل|واهٍ|واه')::int AS daif_count,
         STRING_AGG(DISTINCT n.name, '، ')
           FILTER (WHERE hj.say_text ~* 'صحيح') AS sahih_scholars,
         STRING_AGG(DISTINCT n.name, '، ')
           FILTER (WHERE hj.say_text ~* 'ضعيف|موضوع|منكر|باطل|واهٍ|واه') AS daif_scholars,
         COUNT(DISTINCT hj.scientist_id)::int AS total_scholars
       FROM hadith_toc ht
       JOIN books b ON b.id = ht.book_id
       JOIN hadith_judgments hj ON hj.hadith_id = ht.main_id
       JOIN narrators n ON n.id = hj.scientist_id
       WHERE ht.is_leaf = true AND ht.is_paragraph = true
         AND ($1 = '' OR b.title ~* $1)
       GROUP BY ht.main_id, ht.tarf, b.title, ht.chapter_text
       HAVING
         COUNT(*) FILTER (WHERE hj.say_text ~* 'صحيح') >= 1
         AND COUNT(*) FILTER (WHERE hj.say_text ~* 'ضعيف|موضوع|منكر|باطل|واهٍ|واه') >= 1
         AND COUNT(DISTINCT hj.scientist_id) >= $2
       ORDER BY total_scholars DESC, hadith_id
       LIMIT $3 OFFSET $4`,
      [bookFilter || '', minScholar, pageSize, offset]
    ).catch(() => ({ rows: [] as DivergentHadith[] })),

    selectedId ? pool.query<ConflictDetail>(
      `SELECT
         n.name AS scholar_name,
         hj.say_text AS judgment_text,
         CASE
           WHEN hj.say_text ~* 'صحيح' THEN 'sahih'
           WHEN hj.say_text ~* 'حسن' THEN 'hasan'
           WHEN hj.say_text ~* 'ضعيف' THEN 'daif'
           WHEN hj.say_text ~* 'موضوع|باطل|كذب|مكذوب' THEN 'mawdu'
           ELSE 'other'
         END AS judgment_category
       FROM hadith_judgments hj
       JOIN narrators n ON n.id = hj.scientist_id
       WHERE hj.hadith_id = $1
       ORDER BY judgment_category, n.name`,
      [selectedId]
    ).catch(() => ({ rows: [] as ConflictDetail[] })) : Promise.resolve({ rows: [] as ConflictDetail[] }),

    pool.query<{ name: string }>(
      `SELECT DISTINCT b.title AS name FROM books b
       JOIN hadith_toc ht ON ht.book_id = b.id AND ht.is_leaf = true AND ht.is_paragraph = true
       JOIN hadith_judgments hj ON hj.hadith_id = ht.main_id
       ORDER BY b.title LIMIT 80`
    ).catch(() => ({ rows: [] as { name: string }[] })),
  ])

  const hadiths = haditshRes.rows
  const details = detailRes.rows
  const books = booksRes.rows

  const selected = selectedId ? hadiths.find(h => h.hadith_id === selectedId) : null

  const categoryColor: Record<string, string> = {
    sahih: 'bg-green-100 text-green-800 border border-green-200',
    hasan: 'bg-blue-100 text-blue-800 border border-blue-200',
    daif: 'bg-red-100 text-red-800 border border-red-200',
    mawdu: 'bg-gray-800 text-white border border-gray-900',
    other: 'bg-gray-100 text-gray-600 border border-gray-200',
  }

  const categoryLabel: Record<string, string> = {
    sahih: 'صحيح',
    hasan: 'حسن',
    daif: 'ضعيف',
    mawdu: 'موضوع',
    other: 'أخرى',
  }

  const MIN_SCHOLAR_OPTIONS = [2, 3, 4, 5]

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">اختلاف العلماء في الحكم على الأحاديث</h1>
        <p className="text-sm text-gray-500">
          أحاديث صحَّحها بعض العلماء وضعَّفها آخرون — أداة أساسية لبحث الخلاف في نقد الحديث واستيعاب أسباب الاختلاف
        </p>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <span className="text-xs text-gray-500">الحد الأدنى للعلماء:</span>
        {MIN_SCHOLAR_OPTIONS.map(m => (
          <a key={m}
            href={`/hadiths/divergent-judgments?minScholar=${m}&book=${bookFilter}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${minScholar === m ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
            {m}+ علماء
          </a>
        ))}
        <span className="text-gray-200 mx-1">|</span>
        <NavigateSelect
          href={`/hadiths/divergent-judgments?minScholar=${minScholar}`}
          param="book"
          defaultValue={bookFilter}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white">
          <option value="">كل الكتب</option>
          {books.map(bk => (
            <option key={bk.name} value={bk.name}>{bk.name}</option>
          ))}
        </NavigateSelect>
        {bookFilter && (
          <a href={`/hadiths/divergent-judgments?minScholar=${minScholar}`}
            className="text-xs text-red-500 hover:underline">× إزالة الفلتر</a>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <div className="sm:col-span-3 space-y-2">
          {hadiths.map(h => (
            <a key={h.hadith_id}
              href={`/hadiths/divergent-judgments?id=${h.hadith_id}&minScholar=${minScholar}&book=${bookFilter}`}
              className={`block bg-white rounded-xl border px-4 py-3 hover:border-green-200 hover:shadow-sm transition-all ${selectedId === h.hadith_id ? 'border-green-300 shadow-sm' : 'border-gray-100'}`}>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-xs text-gray-500">{h.book_name}</span>
                {h.chapter_name && <span className="text-xs text-gray-400">· {h.chapter_name}</span>}
                <span className="text-xs text-gray-300 mr-auto">{h.total_scholars} عالم</span>
              </div>
              <p className="text-sm text-gray-900 leading-relaxed mb-2 line-clamp-2">{h.hadith_text}...</p>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {h.sahih_count > 0 && (
                  <span className="bg-green-50 text-green-800 border border-green-100 px-2 py-0.5 rounded-full">
                    ✓ صحَّحه {h.sahih_count}
                  </span>
                )}
                {h.daif_count > 0 && (
                  <span className="bg-red-50 text-red-800 border border-red-100 px-2 py-0.5 rounded-full">
                    ✗ ضعَّفه {h.daif_count}
                  </span>
                )}
                {h.sahih_scholars && (
                  <span className="text-green-700 truncate max-w-40">{h.sahih_scholars.split('،')[0]}</span>
                )}
                {h.daif_scholars && (
                  <span className="text-red-600 truncate max-w-40">{h.daif_scholars.split('،')[0]}</span>
                )}
              </div>
            </a>
          ))}

          {hadiths.length === 0 && (
            <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
              لا توجد نتائج بهذه الفلاتر
            </div>
          )}

          {(hadiths.length === pageSize || page > 1) && (
            <div className="flex gap-2 pt-2 justify-center">
              {page > 1 && (
                <a href={`/hadiths/divergent-judgments?minScholar=${minScholar}&book=${bookFilter}&page=${page - 1}`}
                  className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">← السابق</a>
              )}
              <span className="text-sm text-gray-400 self-center">صفحة {page.toLocaleString('ar-EG')}</span>
              {hadiths.length === pageSize && (
                <a href={`/hadiths/divergent-judgments?minScholar=${minScholar}&book=${bookFilter}&page=${page + 1}`}
                  className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">التالي →</a>
              )}
            </div>
          )}
        </div>

        <div className="sm:col-span-2">
          {selected && details.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden sticky top-20">
              <div className="bg-amber-50 px-4 py-3 border-b border-amber-100">
                <div className="text-xs text-amber-700 font-semibold mb-1">الخلاف النقدي</div>
                <p className="text-xs text-amber-900 leading-relaxed line-clamp-3">{selected.hadith_text}...</p>
                <div className="flex gap-2 mt-2">
                  <Link href={`/hadith/${selected.hadith_id}`} className="text-xs text-green-700 hover:underline">تفاصيل الحديث ←</Link>
                  <Link href={`/hadith/${selected.hadith_id}/research-report`} className="text-xs text-blue-600 hover:underline">التقرير البحثي ←</Link>
                </div>
              </div>

              <div className="divide-y divide-gray-50 max-h-[55vh] overflow-y-auto">
                {(['sahih', 'hasan', 'daif', 'mawdu', 'other'] as const).map(cat => {
                  const catItems = details.filter(d => d.judgment_category === cat)
                  if (catItems.length === 0) return null
                  return (
                    <div key={cat} className="px-4 py-3">
                      <div className={`inline-block text-xs px-2 py-0.5 rounded-full mb-2 ${categoryColor[cat]}`}>
                        {categoryLabel[cat]} ({catItems.length})
                      </div>
                      <div className="space-y-2">
                        {catItems.map((d, i) => (
                          <div key={i} className="text-xs">
                            <span className="font-medium text-gray-800">{d.scholar_name}</span>
                            <p className="text-gray-500 mt-0.5 leading-relaxed">{d.judgment_text.slice(0, 120)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 rounded-xl border border-amber-100 p-6">
              <div className="text-center text-sm text-amber-700">
                <div className="text-2xl mb-2">⚖️</div>
                <div className="font-semibold mb-2">اختلاف المحدثين</div>
                <p className="text-xs text-amber-600 leading-relaxed">
                  اختر حديثاً لعرض أقوال جميع العلماء وتصنيفها بين المصحِّحين والمضعِّفين — لدراسة أسباب الخلاف المنهجية
                </p>
              </div>
              <div className="mt-4 space-y-2 text-xs text-amber-700">
                <div className="bg-white rounded-lg px-3 py-2 border border-amber-100">
                  <span className="text-green-700">■ المصحِّح:</span> حسَّن الإسناد أو قبل الراوي الضعيف للشواهد
                </div>
                <div className="bg-white rounded-lg px-3 py-2 border border-amber-100">
                  <span className="text-red-600">■ المضعِّف:</span> رأى ضعف الراوي أو الانقطاع في الإسناد
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/grade-evolution" className="text-green-700 hover:underline">← تطور التصحيح عبر القرون</Link>
        <Link href="/scholars/isnad-criteria" className="text-green-700 hover:underline">← معايير العلماء</Link>
        <Link href="/hadiths/weak-links" className="text-green-700 hover:underline">← الحلقات الضعيفة</Link>
      </div>
    </div>
  )
}
