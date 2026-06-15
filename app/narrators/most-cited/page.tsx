import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface MostCitedNarrator {
  id: number
  name: string
  abb_name: string | null
  city: string | null
  death_year_num: number | null
  grade: string | null
  is_companion: boolean
  book_count: number
  hadith_count: number
  chain_count: number
  scholar_count: number
}

interface BookAppearance {
  book_name: string
  hadith_count: number
  chain_count: number
  position_avg: number
}

export default async function MostCitedPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; role?: string; sort?: string; page?: string }>
}) {
  const sp = await searchParams
  const selectedId = parseInt(sp.id || '0') || null
  const role = sp.role || 'all'
  const sortBy = sp.sort || 'books'
  const page = Math.max(1, parseInt(sp.page || '1'))
  const pageSize = 30
  const offset = (page - 1) * pageSize

  const roleFilter = role === 'companion' ? 'AND n.is_companion = true'
    : role === 'tabi' ? 'AND n.is_companion = false AND n.death_year_num BETWEEN 40 AND 180'
    : role === 'follower' ? 'AND n.is_companion = false AND n.death_year_num > 180'
    : ''

  const orderSql = sortBy === 'hadiths' ? 'hadith_count DESC'
    : sortBy === 'chains' ? 'chain_count DESC'
    : sortBy === 'scholars' ? 'scholar_count DESC'
    : 'book_count DESC'

  const [narratorsRes, booksRes] = await Promise.all([
    pool.query<MostCitedNarrator>(
      `SELECT
         n.id, n.name, n.abb_name, n.city, n.death_year_num, n.grade, n.is_companion,
         COUNT(DISTINCT ht.book_id)::int AS book_count,
         COUNT(DISTINCT ih.hadith_id)::int AS hadith_count,
         COUNT(DISTINCT ic.id)::int AS chain_count,
         COUNT(DISTINCT nc.scientist_name)::int AS scholar_count
       FROM narrators n
       JOIN LATERAL unnest(
         (SELECT array_agg(DISTINCT un.nid) FROM isnad_chains ic2 JOIN LATERAL unnest(ic2.narrator_id_array) AS un(nid) ON true WHERE un.nid = n.id)
       ) AS ref(nid) ON true
       JOIN isnad_chains ic ON n.id = ANY(ic.narrator_id_array)
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       LEFT JOIN narrator_criticism nc ON nc.narrator_id = n.id
       WHERE true ${roleFilter}
       GROUP BY n.id, n.name, n.abb_name, n.city, n.death_year_num, n.grade, n.is_companion
       HAVING COUNT(DISTINCT ht.book_id) >= 2
       ORDER BY ${orderSql}, hadith_count DESC
       LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    ).catch(() => {
      // Simpler fallback without lateral
      return pool.query<MostCitedNarrator>(
        `SELECT
           n.id, n.name, n.abb_name, n.city, n.death_year_num, n.grade, n.is_companion,
           COUNT(DISTINCT ht.book_id)::int AS book_count,
           COUNT(DISTINCT ih.hadith_id)::int AS hadith_count,
           COUNT(DISTINCT ic.id)::int AS chain_count,
           0::int AS scholar_count
         FROM narrators n
         JOIN isnad_chains ic ON n.id = ANY(ic.narrator_id_array)
         JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
         JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
         WHERE true ${roleFilter}
         GROUP BY n.id, n.name, n.abb_name, n.city, n.death_year_num, n.grade, n.is_companion
         HAVING COUNT(DISTINCT ht.book_id) >= 2
         ORDER BY ${orderSql}, hadith_count DESC
         LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      ).catch(() => ({ rows: [] as MostCitedNarrator[] }))
    }),

    selectedId ? pool.query<BookAppearance>(
      `SELECT
         b.title AS book_name,
         COUNT(DISTINCT ih.hadith_id)::int AS hadith_count,
         COUNT(DISTINCT ic.id)::int AS chain_count,
         ROUND(AVG(pos.ord), 1)::float AS position_avg
       FROM isnad_chains ic
       CROSS JOIN LATERAL (
         SELECT t.ord FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord) WHERE t.nid = $1 LIMIT 1
       ) pos
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       JOIN books b ON b.id = ht.book_id
       GROUP BY b.title
       ORDER BY hadith_count DESC`,
      [selectedId]
    ).catch(() => ({ rows: [] as BookAppearance[] })) : Promise.resolve({ rows: [] as BookAppearance[] }),
  ])

  const narrators = narratorsRes.rows
  const books = booksRes.rows
  const selected = selectedId ? narrators.find(n => n.id === selectedId) : null

  const maxBooks = Math.max(...narrators.map(n => n.book_count), 1)

  const ROLE_OPTIONS = [
    { key: 'all', label: 'الكل' },
    { key: 'companion', label: 'الصحابة' },
    { key: 'tabi', label: 'التابعون' },
    { key: 'follower', label: 'أتباع التابعين' },
  ]
  const SORT_OPTIONS = [
    { key: 'books', label: 'أكثر كتباً' },
    { key: 'hadiths', label: 'أكثر أحاديثاً' },
    { key: 'chains', label: 'أكثر أسانيداً' },
    { key: 'scholars', label: 'أكثر نقداً' },
  ]

  function gradeColor(grade: string | null) {
    if (!grade) return 'text-gray-400'
    if (/ثقة/.test(grade)) return 'text-green-700 bg-green-50'
    if (/صدوق/.test(grade)) return 'text-blue-600 bg-blue-50'
    if (/ضعيف/.test(grade)) return 'text-red-500 bg-red-50'
    if (/مجهول/.test(grade)) return 'text-gray-500 bg-gray-50'
    return 'text-gray-600 bg-gray-50'
  }

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الرواة الأكثر انتشاراً عبر الكتب</h1>
        <p className="text-sm text-gray-500">
          ليس مجرد أكثرهم رواياتٍ — بل أكثرهم انتشاراً في كتب الحديث المختلفة، وهو مقياس حقيقي لمكانة الراوي في الدورة الحديثية
        </p>
      </div>

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        {ROLE_OPTIONS.map(r => (
          <a key={r.key}
            href={`/narrators/most-cited?role=${r.key}&sort=${sortBy}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${role === r.key ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
            {r.label}
          </a>
        ))}
        <span className="text-gray-200">|</span>
        {SORT_OPTIONS.map(s => (
          <a key={s.key}
            href={`/narrators/most-cited?role=${role}&sort=${s.key}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${sortBy === s.key ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-200'}`}>
            {s.label}
          </a>
        ))}
      </div>

      <div className="grid sm:grid-cols-5 gap-4">
        <div className="sm:col-span-3">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-indigo-50 px-4 py-2 border-b border-indigo-100 text-xs text-indigo-800 font-medium">
              الرواة — مرتَّبون {SORT_OPTIONS.find(s => s.key === sortBy)?.label || 'بعدد الكتب'}
            </div>
            <div className="divide-y divide-gray-50 max-h-[72vh] overflow-y-auto">
              {narrators.map((n, i) => {
                const isSelected = selectedId === n.id
                const barW = Math.round((n.book_count / maxBooks) * 100)
                const rankNum = offset + i + 1
                return (
                  <a key={n.id}
                    href={`/narrators/most-cited?id=${n.id}&role=${role}&sort=${sortBy}`}
                    className={`px-4 py-3 flex items-start gap-3 hover:bg-indigo-50 transition-colors ${isSelected ? 'bg-indigo-50' : ''}`}>
                    <span className="text-xs text-gray-300 w-6 shrink-0 mt-0.5 text-left">{rankNum.toLocaleString('ar-EG')}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-sm font-medium ${isSelected ? 'text-indigo-900' : 'text-gray-800'}`}>
                          {n.abb_name || n.name.split(' ').slice(0, 3).join(' ')}
                        </span>
                        {n.is_companion && (
                          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">صحابي</span>
                        )}
                        {n.grade && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${gradeColor(n.grade)}`}>
                            {n.grade.split(' ').slice(0, 2).join(' ')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-24">
                          <div className="bg-indigo-400 h-1.5 rounded-full" style={{ width: `${barW}%` }} />
                        </div>
                        <span className="text-xs font-medium text-indigo-700">{n.book_count} كتاب</span>
                        <span className="text-xs text-gray-500">{n.hadith_count} حديث</span>
                        <span className="text-xs text-gray-400">{n.chain_count} سند</span>
                      </div>
                    </div>
                    {n.death_year_num && (
                      <span className="text-xs text-gray-400 shrink-0">ت{n.death_year_num.toLocaleString('ar-EG')}هـ</span>
                    )}
                  </a>
                )
              })}
              {narrators.length === 0 && (
                <div className="p-8 text-center text-sm text-gray-400">لا توجد بيانات</div>
              )}
            </div>
          </div>
          {(narrators.length === pageSize || page > 1) && (
            <div className="flex gap-2 mt-3 justify-center">
              {page > 1 && (
                <a href={`/narrators/most-cited?role=${role}&sort=${sortBy}&page=${page - 1}`}
                  className="text-xs bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:border-indigo-300">← السابق</a>
              )}
              <span className="text-xs text-gray-400 self-center">{rankNum(offset, pageSize, page)}</span>
              {narrators.length === pageSize && (
                <a href={`/narrators/most-cited?role=${role}&sort=${sortBy}&page=${page + 1}`}
                  className="text-xs bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:border-indigo-300">التالي →</a>
              )}
            </div>
          )}
        </div>

        <div className="sm:col-span-2">
          {selected && books.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden sticky top-20">
              <div className="bg-indigo-50 px-4 py-3 border-b border-indigo-100">
                <h2 className="font-bold text-indigo-900 text-sm">
                  {selected.abb_name || selected.name}
                </h2>
                <div className="flex gap-2 flex-wrap text-xs text-indigo-700 mt-1">
                  <span>{selected.book_count} كتاب</span>
                  <span>{selected.hadith_count} حديث</span>
                  <span>{selected.chain_count} سند</span>
                  {selected.city && <span>{selected.city.split(',')[0]}</span>}
                </div>
                <Link href={`/narrator/${selected.id}`} className="text-xs text-green-700 hover:underline mt-1 block">
                  ← الترجمة الكاملة
                </Link>
              </div>
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-medium flex justify-between">
                <span>الكتاب</span>
                <span>أحاديث · أسانيد · موضعه</span>
              </div>
              <div className="divide-y divide-gray-50 max-h-[55vh] overflow-y-auto">
                {books.map((bk, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                    <span className="text-sm text-gray-800 flex-1 min-w-0 truncate">{bk.book_name}</span>
                    <div className="flex items-center gap-2 text-xs shrink-0 mr-2">
                      <span className="text-indigo-600 font-medium">{bk.hadith_count}</span>
                      <span className="text-gray-400">{bk.chain_count}</span>
                      <span className="text-amber-600 bg-amber-50 px-1.5 rounded-full">
                        م{Math.round(bk.position_avg)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-indigo-50 rounded-xl border border-indigo-100 p-6 text-center">
              <div className="text-3xl mb-2 opacity-60">📚</div>
              <div className="font-semibold text-indigo-900 text-sm mb-2">الانتشار الكتابي</div>
              <p className="text-xs text-indigo-700 leading-relaxed">
                اختر راوياً لترى في كم كتابٍ رُويت أحاديثه، وفي أي موضع من السند يظهر — الموضع المبكر يعني قرباً من المصدر
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators/tabiin-ranking" className="text-green-700 hover:underline">← ترتيب التابعين</Link>
        <Link href="/narrators/grade-distribution" className="text-green-700 hover:underline">← توزيع الدرجات</Link>
        <Link href="/narrators/teacher-student-pairs" className="text-green-700 hover:underline">← شبكة الشيوخ والتلاميذ</Link>
      </div>
    </div>
  )
}

function rankNum(offset: number, pageSize: number, page: number) {
  const from = offset + 1
  const to = offset + pageSize
  return `${from.toLocaleString('ar-EG')} – ${to.toLocaleString('ar-EG')}`
}
