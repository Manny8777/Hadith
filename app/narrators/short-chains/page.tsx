import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface ChainLengthBucket {
  chain_length: number
  chain_count: number
  hadith_count: number
  book_count: number
  avg_earliest_death: number | null
}

interface ShortChainHadith {
  hadith_id: number
  hadith_text: string
  book_name: string
  chain_id: number
  chain_length: number
  narrator_names: string
  companion_name: string | null
  judgment_text: string | null
}

export default async function ShortChainsPage({
  searchParams,
}: {
  searchParams: Promise<{ len?: string; book?: string; page?: string }>
}) {
  const sp = await searchParams
  const selectedLen = parseInt(sp.len || '0') || null
  const bookFilter = sp.book || ''
  const page = Math.max(1, parseInt(sp.page || '1'))
  const pageSize = 15
  const offset = (page - 1) * pageSize

  const [bucketsRes, haditshRes, booksRes] = await Promise.all([
    pool.query<ChainLengthBucket>(
      `SELECT
         array_length(ic.narrator_id_array, 1) AS chain_length,
         COUNT(DISTINCT ic.id)::int AS chain_count,
         COUNT(DISTINCT ih.hadith_id)::int AS hadith_count,
         COUNT(DISTINCT ht.book_id)::int AS book_count,
         ROUND(AVG(n.death_year_num))::int AS avg_earliest_death
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       LEFT JOIN narrators n ON n.id = ic.narrator_id_array[1] AND n.is_companion = true
       WHERE array_length(ic.narrator_id_array, 1) BETWEEN 1 AND 8
       GROUP BY array_length(ic.narrator_id_array, 1)
       ORDER BY chain_length`,
      []
    ).catch(() => ({ rows: [] as ChainLengthBucket[] })),

    selectedLen !== null ? pool.query<ShortChainHadith>(
      `SELECT
         ih.hadith_id,
         LEFT(ht.tarf, 200) AS hadith_text,
         b.title AS book_name,
         ic.id AS chain_id,
         array_length(ic.narrator_id_array, 1) AS chain_length,
         ARRAY(
           SELECT COALESCE(n.abb_name, SPLIT_PART(n.name, ' ', 1) || ' ' || SPLIT_PART(n.name, ' ', 2))
           FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
           JOIN narrators n ON n.id = t.nid
           ORDER BY t.ord
         )::text AS narrator_names,
         (SELECT n2.name FROM narrators n2 WHERE n2.id = ic.narrator_id_array[1] AND n2.is_companion = true LIMIT 1) AS companion_name,
         (SELECT hj.say_text FROM hadith_judgments hj WHERE hj.hadith_id = ih.hadith_id LIMIT 1) AS judgment_text
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       JOIN books b ON b.id = ht.book_id
       WHERE array_length(ic.narrator_id_array, 1) = $1
         AND ($2 = '' OR b.title ~* $2)
       ORDER BY ih.hadith_id
       LIMIT $3 OFFSET $4`,
      [selectedLen, bookFilter || '', pageSize, offset]
    ).catch(() => ({ rows: [] as ShortChainHadith[] })) : Promise.resolve({ rows: [] as ShortChainHadith[] }),

    pool.query<{ name: string }>(
      `SELECT DISTINCT b.title AS name FROM books b
       JOIN hadith_toc ht ON ht.book_id = b.id
       JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
       JOIN isnad_chains ic ON ic.id = ih.isnad_id
       WHERE array_length(ic.narrator_id_array, 1) <= 4
       ORDER BY b.title LIMIT 50`
    ).catch(() => ({ rows: [] as { name: string }[] })),
  ])

  const buckets = bucketsRes.rows
  const hadiths = haditshRes.rows
  const books = booksRes.rows

  const maxChains = Math.max(...buckets.map(b => b.chain_count), 1)

  const LENGTH_LABELS: Record<number, string> = {
    1: 'أحادي — ص فقط',
    2: 'ثنائي — ص + م',
    3: 'ثلاثي — 3 رواة',
    4: 'رباعي — 4 رواة',
    5: 'خماسي — 5 رواة',
    6: '6 رواة',
    7: '7 رواة',
    8: '8 رواة',
  }

  function judgmentColor(j: string | null) {
    if (!j) return 'text-gray-400'
    if (/صحيح/.test(j)) return 'text-green-700'
    if (/حسن/.test(j)) return 'text-blue-600'
    if (/ضعيف/.test(j)) return 'text-red-500'
    return 'text-gray-500'
  }

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الأسانيد العالية — قِصار السند</h1>
        <p className="text-sm text-gray-500">
          الأسانيد بأقل عدد من الرواة (الثلاثيات والرباعيات) — أعلاها إسناداً وأقلها احتمالاً للخطأ والانقطاع، وكان المحدثون يُشددون في طلبها
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
        <h2 className="font-bold text-green-900 text-sm mb-3">توزيع الأسانيد حسب عدد الرواة</h2>
        <div className="space-y-2">
          {buckets.map(b => {
            const barPct = Math.round((b.chain_count / maxChains) * 100)
            const isSelected = selectedLen === b.chain_length
            return (
              <a key={b.chain_length}
                href={`/narrators/short-chains?len=${b.chain_length}&book=${bookFilter}`}
                className={`flex items-center gap-2 group hover:bg-gray-50 rounded-lg px-2 py-1.5 transition-colors ${isSelected ? 'bg-green-50' : ''}`}>
                <span className={`text-xs shrink-0 w-32 ${isSelected ? 'text-green-700 font-bold' : 'text-gray-500'}`}>
                  {LENGTH_LABELS[b.chain_length] || `${b.chain_length} رواة`}
                </span>
                <div className="flex-1 bg-gray-100 rounded-full h-5 max-w-56">
                  <div className={`h-5 rounded-full flex items-center px-2 ${isSelected ? 'bg-green-500' : 'bg-indigo-300 group-hover:bg-indigo-400'}`}
                    style={{ width: `${Math.max(barPct, 8)}%` }}>
                    {barPct > 15 && <span className="text-white text-xs">{b.chain_count.toLocaleString('ar-EG')}</span>}
                  </div>
                </div>
                {barPct <= 15 && (
                  <span className={`text-xs font-medium shrink-0 ${isSelected ? 'text-green-700' : 'text-gray-600'}`}>
                    {b.chain_count.toLocaleString('ar-EG')}
                  </span>
                )}
                <span className="text-xs text-gray-400 shrink-0">{b.hadith_count.toLocaleString('ar-EG')} حديث</span>
                {b.avg_earliest_death && (
                  <span className="text-xs text-amber-600 shrink-0 hidden sm:block">
                    ↑ت{b.avg_earliest_death}هـ
                  </span>
                )}
              </a>
            )
          })}
        </div>
        {selectedLen !== null && (
          <div className="mt-2">
            <a href="/narrators/short-chains" className="text-xs text-red-500 hover:underline">× مسح الفلتر</a>
          </div>
        )}
      </div>

      {selectedLen !== null && (
        <>
          <div className="flex gap-2 mb-3 flex-wrap items-center">
            <h2 className="font-semibold text-green-900 text-sm">
              {LENGTH_LABELS[selectedLen] || `${selectedLen} رواة`} — الأسانيد
            </h2>
            <select defaultValue={bookFilter}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white mr-auto">
              <option value="">كل الكتب</option>
              {books.map(bk => (
                <option key={bk.name} value={bk.name}>{bk.name}</option>
              ))}
            </select>
            {bookFilter && (
              <a href={`/narrators/short-chains?len=${selectedLen}`} className="text-xs text-red-500 hover:underline">× إزالة فلتر الكتاب</a>
            )}
          </div>

          <div className="space-y-2">
            {hadiths.map(h => {
              const names: string[] = h.narrator_names
                .replace(/^\{/, '').replace(/\}$/, '')
                .split(',')
                .map((s: string) => s.replace(/^"|"$/g, '').trim())
              return (
                <div key={h.chain_id} className="bg-white rounded-xl border border-gray-100 p-4 hover:border-green-200 transition-all">
                  <div className="flex items-center gap-2 mb-2 flex-wrap text-xs">
                    <span className="text-gray-500">{h.book_name}</span>
                    {h.judgment_text && (
                      <span className={judgmentColor(h.judgment_text)}>{h.judgment_text.slice(0, 20)}</span>
                    )}
                    <span className="text-indigo-600 mr-auto">{h.chain_length} رواة</span>
                  </div>
                  <p className="text-sm text-gray-900 leading-relaxed mb-3">{h.hadith_text}...</p>
                  <div className="flex items-center gap-1 flex-wrap mb-2">
                    {names.map((name, i) => (
                      <span key={i}>
                        {i > 0 && <span className="text-gray-300 text-xs">←</span>}
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${i === 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                          {name}
                        </span>
                      </span>
                    ))}
                  </div>
                  <Link href={`/hadith/${h.hadith_id}`} className="text-xs text-green-700 hover:underline">تفاصيل ←</Link>
                </div>
              )
            })}
            {hadiths.length === 0 && (
              <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">لا توجد بيانات</div>
            )}
          </div>

          {(hadiths.length === pageSize || page > 1) && (
            <div className="flex gap-2 mt-4 justify-center">
              {page > 1 && (
                <a href={`/narrators/short-chains?len=${selectedLen}&book=${bookFilter}&page=${page - 1}`}
                  className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">← السابق</a>
              )}
              <span className="text-sm text-gray-400 self-center">صفحة {page.toLocaleString('ar-EG')}</span>
              {hadiths.length === pageSize && (
                <a href={`/narrators/short-chains?len=${selectedLen}&book=${bookFilter}&page=${page + 1}`}
                  className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">التالي →</a>
              )}
            </div>
          )}
        </>
      )}

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/chain-diversity" className="text-green-700 hover:underline">← تنوع الأسانيد</Link>
        <Link href="/books/chain-age" className="text-green-700 hover:underline">← عمر السند</Link>
        <Link href="/hadiths/narrator-bottleneck" className="text-green-700 hover:underline">← الرواة الفردية</Link>
      </div>
    </div>
  )
}
