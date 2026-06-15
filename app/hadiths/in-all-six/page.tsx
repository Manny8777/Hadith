import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'الأحاديث الجامعة للكتب الستة — جامع خادم الحرمين' }

interface HadithRow {
  hadith_id: number
  book_id: number
  book_name: string
  chapter_name: string | null
  hadith_text: string
  judgment_text: string | null
  scientist_name: string | null
  chain_count: number
  book_count: number
  companion_name: string | null
  books_list: string
}

// Canonical six books (الكتب الستة): adjust IDs if different in this DB
const SIX_BOOKS = [
  { id: 1, name: 'البخاري' },
  { id: 2, name: 'مسلم' },
  { id: 3, name: 'أبو داود' },
  { id: 4, name: 'الترمذي' },
  { id: 5, name: 'النسائي' },
  { id: 6, name: 'ابن ماجه' },
]

const BOOK_SET_OPTIONS = [
  {
    key: 'all6',
    label: 'الكتب الستة',
    description: 'الصحاح والسنن جميعاً',
    bookIds: [1, 2, 3, 4, 5, 6],
    color: 'bg-green-900 text-white',
  },
  {
    key: 'sahihayn',
    label: 'الصحيحان فقط',
    description: 'البخاري ومسلم',
    bookIds: [1, 2],
    color: 'bg-green-700 text-white',
  },
  {
    key: 'sahihayn_plus_dawud',
    label: 'البخاري + مسلم + أبو داود',
    description: 'الأصح ثلاثة',
    bookIds: [1, 2, 3],
    color: 'bg-teal-700 text-white',
  },
  {
    key: 'four_sunan',
    label: 'السنن الأربع',
    description: 'أبو داود والترمذي والنسائي وابن ماجه',
    bookIds: [3, 4, 5, 6],
    color: 'bg-blue-700 text-white',
  },
]

export default async function InAllSixPage({
  searchParams,
}: {
  searchParams: Promise<{ set?: string; sort?: string; page?: string }>
}) {
  const sp = await searchParams
  const setKey = sp.set || 'all6'
  const sort = sp.sort || 'chain_count'
  const page = Math.max(1, parseInt(sp.page || '1'))
  const limit = 20
  const offset = (page - 1) * limit

  const activeSet = BOOK_SET_OPTIONS.find(s => s.key === setKey) || BOOK_SET_OPTIONS[0]
  const bookIds = activeSet.bookIds

  // Counts for each book set
  const setCounts = await Promise.all(
    BOOK_SET_OPTIONS.map(s =>
      pool.query<{ cnt: number }>(
        `SELECT COUNT(DISTINCT t.takhrij_id)::int AS cnt
         FROM (
           SELECT t2.takhrij_id
           FROM hadith_toc t2
           JOIN books b ON b.id = t2.book_id
           WHERE b.id = ANY($1::int[])
             AND t2.takhrij_id IS NOT NULL
           GROUP BY t2.takhrij_id
           HAVING COUNT(DISTINCT b.id) >= $2
         ) t`,
        [s.bookIds, s.bookIds.length]
      ).catch(() => ({ rows: [{ cnt: 0 }] }))
    )
  )

  const bookIdParam = bookIds

  const [rowsRes, countRes] = await Promise.all([
    pool.query<HadithRow>(
      `SELECT DISTINCT ON (tg.takhrij_id)
              ht.main_id AS hadith_id,
              ht.book_id,
              b.title AS book_name,
              ht.chapter_text AS chapter_name,
              LEFT(ht.tarf, 250) AS hadith_text,
              (SELECT hj.say_text FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id LIMIT 1) AS judgment_text,
              (SELECT n_sci.name FROM hadith_judgments hj JOIN narrators n_sci ON n_sci.id = hj.scientist_id WHERE hj.hadith_id = ht.main_id LIMIT 1) AS scientist_name,
              (SELECT COUNT(DISTINCT ic.id)::int
               FROM isnad_chains ic
               JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
               WHERE ih.hadith_id = ht.main_id) AS chain_count,
              tg.book_count,
              tg.books_list,
              (SELECT n.name FROM isnad_chains ic2
               JOIN isnad_hadiths ih2 ON ih2.isnad_id = ic2.id
               JOIN narrators n ON n.id = ic2.narrator_id_array[1] AND n.is_companion = true
               WHERE ih2.hadith_id = ht.main_id
               LIMIT 1) AS companion_name
       FROM (
         SELECT t2.takhrij_id,
           COUNT(DISTINCT b2.id)::int AS book_count,
           STRING_AGG(DISTINCT b2.title, '، ' ORDER BY b2.title) AS books_list,
           MIN(t2.id) AS min_hadith_id
         FROM hadith_toc t2
         JOIN books b2 ON b2.id = t2.book_id
         WHERE b2.id = ANY($1::int[])
           AND t2.takhrij_id IS NOT NULL
         GROUP BY t2.takhrij_id
         HAVING COUNT(DISTINCT b2.id) >= $2
       ) tg
       JOIN hadith_toc ht ON ht.main_id = tg.min_hadith_id
       JOIN books b ON b.id = ht.book_id
       ORDER BY tg.takhrij_id,
         ${sort === 'death' ? 'b.takhrij_death ASC NULLS LAST' : 'chain_count DESC'}
       LIMIT ${limit} OFFSET ${offset}`,
      [bookIdParam, bookIds.length]
    ).then(res => {
      res.rows.sort((a, b) =>
        sort === 'chain_count' ? (b.chain_count - a.chain_count) :
        sort === 'book_count' ? (b.book_count - a.book_count) :
        0
      )
      return res
    }).catch(() => ({ rows: [] as HadithRow[] })),

    pool.query<{ total: number }>(
      `SELECT COUNT(DISTINCT t2.takhrij_id)::int AS total
       FROM hadith_toc t2
       JOIN books b ON b.id = t2.book_id
       WHERE b.id = ANY($1::int[])
         AND t2.takhrij_id IS NOT NULL
       GROUP BY t2.takhrij_id
       HAVING COUNT(DISTINCT b.id) >= $2`,
      [bookIdParam, bookIds.length]
    ).then(res => ({ rows: [{ total: res.rows.length }] }))
    .catch(() => ({ rows: [{ total: 0 }] })),
  ])

  const rows = rowsRes.rows
  const total = countRes.rows[0]?.total || 0
  const totalPages = Math.ceil(total / limit)

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('set', setKey)
    p.set('sort', sort)
    p.set('page', String(page))
    Object.entries(overrides).forEach(([k, v]) => p.set(k, v))
    return `/hadiths/in-all-six?${p.toString()}`
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الأحاديث الجامعة للكتب الستة</h1>
        <p className="text-sm text-gray-500 mb-3">
          أحاديث رواها جميع أصحاب الكتب المختارة في مجموعات التخريج — أعلى مستويات الانتشار والشهرة في التراث الحديثي
        </p>

        <div className="bg-green-50 border border-green-100 rounded-xl p-3 mb-4 text-xs text-green-900">
          <span className="font-semibold">الكتب الستة (السنن الأربع والصحيحان): </span>
          صحيح البخاري · صحيح مسلم · سنن أبي داود · جامع الترمذي · سنن النسائي · سنن ابن ماجه.
          الأحاديث هنا رُويت في جميعها — وهي من أوثق ما في المنظومة الحديثية وأشمله وصولاً.
        </div>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {BOOK_SET_OPTIONS.map((s, i) => (
            <Link key={s.key} href={buildUrl({ set: s.key, page: '1' })}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all font-medium flex items-center gap-1.5 ${
                setKey === s.key
                  ? `${s.color} border-transparent`
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {s.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                setKey === s.key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
              }`}>
                {setCounts[i]?.rows[0]?.cnt?.toLocaleString('ar-EG') || '...'}
              </span>
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">ترتيب:</span>
          {[
            { key: 'chain_count', label: 'عدد الأسانيد' },
            { key: 'book_count', label: 'عدد الكتب' },
          ].map(s => (
            <Link key={s.key} href={buildUrl({ sort: s.key, page: '1' })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                sort === s.key
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {s.label}
            </Link>
          ))}
        </div>

        <div className="text-xs text-gray-400">
          {total.toLocaleString('ar-EG')} مجموعة تخريج — صفحة {page} من {totalPages}
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((r, idx) => (
          <div key={r.hadith_id}
            className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm hover:border-green-200 transition-all">
            <div className="flex items-start gap-3">
              <span className="text-xs text-gray-300 shrink-0 w-6">
                {(offset + idx + 1).toLocaleString('ar-EG')}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-bold">
                    {r.book_count} كتب
                  </span>
                  {r.companion_name && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                      {r.companion_name}
                    </span>
                  )}
                  {r.chain_count > 0 && (
                    <span className="text-xs text-gray-400">{r.chain_count} سند</span>
                  )}
                </div>
                <div className="text-sm text-gray-800 leading-loose mb-2">
                  {r.hadith_text}{r.hadith_text?.length >= 250 ? '...' : ''}
                </div>
                {r.books_list && (
                  <div className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-2.5 py-1.5 mb-2">
                    <span className="font-semibold">في: </span>{r.books_list}
                  </div>
                )}
                {r.judgment_text && (
                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mb-2">
                    <span className="font-semibold">{r.scientist_name}: </span>
                    {r.judgment_text}
                  </div>
                )}
                <div className="flex items-center gap-3 text-xs flex-wrap">
                  <Link href={`/hadith/${r.hadith_id}`}
                    className="text-green-700 hover:underline font-medium">
                    الحديث الكامل ←
                  </Link>
                  <Link href={`/hadith/${r.hadith_id}/across-books`}
                    className="text-gray-400 hover:text-green-700">
                    مقارنة المصادر ←
                  </Link>
                  {r.chapter_name && (
                    <span className="text-gray-400 truncate max-w-[200px]">{r.chapter_name}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">
          <p>لا توجد نتائج</p>
          <p className="text-xs mt-2 text-gray-400">
            قد تكون أرقام الكتب مختلفة في قاعدة البيانات — يُرجى التحقق من تطابق المعرفات
          </p>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
          {page > 1 && (
            <Link href={buildUrl({ page: String(page - 1) })}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-green-400">← السابق</Link>
          )}
          <span className="text-xs text-gray-500">{page} / {totalPages}</span>
          {page < totalPages && (
            <Link href={buildUrl({ page: String(page + 1) })}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-green-400">التالي ←</Link>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/most-attested" className="text-green-700 hover:underline">← الأوسع انتشاراً</Link>
        <Link href="/books/intersection" className="text-green-700 hover:underline">← تقاطع الكتب</Link>
        <Link href="/hadiths/shaykhayn-standard" className="text-green-700 hover:underline">← على شرط الشيخين</Link>
      </div>
    </div>
  )
}
