import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface BookChainAge {
  book_id: number
  book_name: string
  book_death: number | null
  avg_span: number | null
  min_span: number | null
  max_span: number | null
  chain_count: number
  short_chains: number
  long_chains: number
}

interface ChainDetail {
  chain_id: number
  companion_name: string | null
  companion_death: number | null
  collector_death: number | null
  span: number | null
  chain_length: number
  hadith_text: string
}

export default async function ChainAgePage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string }>
}) {
  const sp = await searchParams
  const selectedBook = parseInt(sp.book || '0') || null

  const [booksRes, chainsRes] = await Promise.all([
    pool.query<BookChainAge>(
      `SELECT
         b.id AS book_id,
         b.title AS book_name,
         b.takhrij_death AS book_death,
         ROUND(AVG(b.takhrij_death - comp_death.yr))::int AS avg_span,
         MIN(b.takhrij_death - comp_death.yr)::int AS min_span,
         MAX(b.takhrij_death - comp_death.yr)::int AS max_span,
         COUNT(DISTINCT ic.id)::int AS chain_count,
         COUNT(DISTINCT ic.id) FILTER (WHERE (b.takhrij_death - comp_death.yr) < 150)::int AS short_chains,
         COUNT(DISTINCT ic.id) FILTER (WHERE (b.takhrij_death - comp_death.yr) >= 200)::int AS long_chains
       FROM books b
       JOIN hadith_toc ht ON ht.book_id = b.id
       JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
       JOIN isnad_chains ic ON ic.id = ih.isnad_id
       JOIN LATERAL (
         SELECT n.death_year_num AS yr
         FROM narrators n
         WHERE n.id = ic.narrator_id_array[1] AND n.is_companion = true AND n.death_year_num IS NOT NULL
         LIMIT 1
       ) comp_death ON true
       WHERE b.takhrij_death IS NOT NULL
       GROUP BY b.id, b.title, b.takhrij_death
       HAVING COUNT(DISTINCT ic.id) >= 10 AND AVG(b.takhrij_death - comp_death.yr) IS NOT NULL
       ORDER BY AVG(b.takhrij_death - comp_death.yr) ASC`,
      []
    ).catch(() => ({ rows: [] as BookChainAge[] })),

    selectedBook ? pool.query<ChainDetail>(
      `SELECT
         ic.id AS chain_id,
         (SELECT n.name FROM narrators n WHERE n.id = ic.narrator_id_array[1] AND n.is_companion = true) AS companion_name,
         (SELECT n.death_year_num FROM narrators n WHERE n.id = ic.narrator_id_array[1]) AS companion_death,
         b.takhrij_death AS collector_death,
         (b.takhrij_death - (SELECT n.death_year_num FROM narrators n WHERE n.id = ic.narrator_id_array[1])) AS span,
         array_length(ic.narrator_id_array, 1) AS chain_length,
         LEFT(ht.tarf, 180) AS hadith_text
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       JOIN books b ON b.id = ht.book_id AND b.id = $1
       WHERE ic.narrator_id_array[1] IS NOT NULL
         AND (SELECT n.is_companion FROM narrators n WHERE n.id = ic.narrator_id_array[1]) = true
       ORDER BY (b.takhrij_death - (SELECT n.death_year_num FROM narrators n WHERE n.id = ic.narrator_id_array[1])) ASC NULLS LAST
       LIMIT 30`,
      [selectedBook]
    ).catch(() => ({ rows: [] as ChainDetail[] })) : Promise.resolve({ rows: [] as ChainDetail[] }),
  ])

  const books = booksRes.rows
  const chains = chainsRes.rows
  const selectedBookInfo = selectedBook ? books.find(b => b.book_id === selectedBook) : null

  const minAvg = Math.min(...books.map(b => b.avg_span || 999).filter(n => n < 999))
  const maxAvg = Math.max(...books.map(b => b.avg_span || 0))
  const rangeAvg = maxAvg - minAvg || 1

  function spanColor(span: number | null) {
    if (!span) return 'text-gray-400'
    if (span < 150) return 'text-green-700'
    if (span < 200) return 'text-amber-600'
    if (span < 250) return 'text-orange-600'
    return 'text-red-600'
  }

  function spanLabel(span: number | null) {
    if (!span) return ''
    if (span < 150) return 'قريب'
    if (span < 200) return 'متوسط'
    if (span < 250) return 'بعيد'
    return 'بعيد جداً'
  }

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">عمر الأسانيد — المدة بين الصحابي والمُصنِّف</h1>
        <p className="text-sm text-gray-500">
          متوسط الفارق الزمني بين وفاة الصحابي الراوي ووفاة المصنِّف في كل كتاب — كلما قلَّ الفارق كلما كان الإسناد أقصر وأعلى
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-5">
        <div className="bg-green-50 px-4 py-2 border-b border-gray-100 text-xs text-green-800 font-medium">
          الكتب مرتَّبة بمتوسط عمر الإسناد (الأقل = إسناد أعلى وأقصر)
        </div>
        <div className="divide-y divide-gray-50">
          {books.map(b => {
            const barPct = b.avg_span ? 100 - Math.round(((b.avg_span - minAvg) / rangeAvg) * 80) : 0
            return (
              <div key={b.book_id}
                className={`px-4 py-3 flex items-center gap-3 hover:bg-gray-50 cursor-pointer ${selectedBook === b.book_id ? 'bg-green-50' : ''}`}>
                <a href={`/books/chain-age?book=${b.book_id}`} className="flex items-center gap-3 flex-1">
                  <div className="w-36 shrink-0">
                    <div className={`font-medium text-sm ${selectedBook === b.book_id ? 'text-green-900' : 'text-gray-700'} hover:underline line-clamp-1`}>
                      {b.book_name}
                    </div>
                    {b.book_death && <div className="text-xs text-gray-400">توفي {b.book_death.toLocaleString('ar-EG')} هـ</div>}
                  </div>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 max-w-32 hidden sm:block">
                    <div className={`h-2 rounded-full ${b.avg_span && b.avg_span < 150 ? 'bg-green-500' : b.avg_span && b.avg_span < 200 ? 'bg-amber-400' : 'bg-red-400'}`}
                      style={{ width: `${barPct}%` }} />
                  </div>
                  <span className={`text-sm font-bold shrink-0 ${spanColor(b.avg_span)}`}>
                    {b.avg_span ? `${b.avg_span.toLocaleString('ar-EG')} سنة` : '؟'}
                  </span>
                  <span className={`text-xs shrink-0 ${spanColor(b.avg_span)}`}>{spanLabel(b.avg_span)}</span>
                  <span className="text-xs text-gray-400 shrink-0">{b.chain_count.toLocaleString('ar-EG')} سند</span>
                </a>
              </div>
            )
          })}
        </div>
      </div>

      {selectedBookInfo && (
        <div className="bg-green-50 border border-green-100 rounded-xl p-4 mb-4">
          <h2 className="font-bold text-green-900 mb-1">{selectedBookInfo.book_name}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center mt-2">
            <div>
              <div className="text-2xl font-bold text-green-700">{selectedBookInfo.avg_span?.toLocaleString('ar-EG')}</div>
              <div className="text-xs text-gray-500">متوسط المدة (سنة)</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-700">{selectedBookInfo.min_span?.toLocaleString('ar-EG')}</div>
              <div className="text-xs text-gray-500">أدنى مدة</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-600">{selectedBookInfo.max_span?.toLocaleString('ar-EG')}</div>
              <div className="text-xs text-gray-500">أعلى مدة</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-700">{selectedBookInfo.short_chains?.toLocaleString('ar-EG')}</div>
              <div className="text-xs text-gray-500">أسانيد قصيرة (أقل من 150)</div>
            </div>
          </div>
        </div>
      )}

      {selectedBook && chains.length > 0 && (
        <>
          <h2 className="font-bold text-green-900 text-sm mb-3">الأسانيد مرتَّبة من الأقصر عمراً ({chains.length})</h2>
          <div className="space-y-2">
            {chains.map((ch, ci) => (
              <div key={ch.chain_id} className="bg-white rounded-xl border border-gray-100 px-4 py-3">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-xs text-gray-400">سند {(ci + 1).toLocaleString('ar-EG')}</span>
                  {ch.companion_name && (
                    <span className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                      {ch.companion_name.split(' ').slice(0, 2).join(' ')}
                      {ch.companion_death && ` (ت${ch.companion_death.toLocaleString('ar-EG')})`}
                    </span>
                  )}
                  {ch.span !== null && (
                    <span className={`text-xs font-bold ${spanColor(ch.span)}`}>
                      {ch.span.toLocaleString('ar-EG')} سنة — {spanLabel(ch.span)}
                    </span>
                  )}
                  <span className="text-xs text-gray-400 mr-auto">{ch.chain_length} حلقة</span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">{ch.hadith_text}...</p>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/books" className="text-green-700 hover:underline">← الكتب</Link>
        <Link href="/hadiths/timeline" className="text-green-700 hover:underline">← التسلسل الزمني</Link>
        <Link href="/chains" className="text-green-700 hover:underline">← علو الإسناد</Link>
        <Link href="/hadiths/chain-gaps" className="text-green-700 hover:underline">← كاشف الانقطاع</Link>
      </div>
    </div>
  )
}
