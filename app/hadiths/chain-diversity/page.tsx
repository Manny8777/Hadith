import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface PositionStats {
  position: number
  unique_narrators: number
  top_narrator_id: number | null
  top_narrator_name: string | null
  top_narrator_count: number | null
  thiqa_count: number
  daif_count: number
  companion_count: number
}

interface SearchResult {
  hadith_id: number
  text_preview: string
  book_name: string
  chain_count: number
}

export default async function ChainDiversityPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; q?: string }>
}) {
  const sp = await searchParams
  const hadithId = parseInt(sp.id || '0') || null
  const q = sp.q || ''

  const [positionsRes, searchRes] = await Promise.all([
    hadithId ? pool.query<PositionStats>(
      `SELECT
         t.ord AS position,
         COUNT(DISTINCT t.nid)::int AS unique_narrators,
         (SELECT ic2.narrator_id_array[t.ord] FROM isnad_chains ic2
          JOIN isnad_hadiths ih2 ON ih2.isnad_id = ic2.id AND ih2.hadith_id = $1
          GROUP BY ic2.narrator_id_array[t.ord] ORDER BY COUNT(*) DESC LIMIT 1) AS top_narrator_id,
         (SELECT n2.name FROM narrators n2 WHERE n2.id = (
           SELECT ic2.narrator_id_array[t.ord] FROM isnad_chains ic2
           JOIN isnad_hadiths ih2 ON ih2.isnad_id = ic2.id AND ih2.hadith_id = $1
           GROUP BY ic2.narrator_id_array[t.ord] ORDER BY COUNT(*) DESC LIMIT 1
         ) LIMIT 1) AS top_narrator_name,
         (SELECT COUNT(*) FROM isnad_chains ic2
          JOIN isnad_hadiths ih2 ON ih2.isnad_id = ic2.id AND ih2.hadith_id = $1
          GROUP BY ic2.narrator_id_array[t.ord] ORDER BY COUNT(*) DESC LIMIT 1) AS top_narrator_count,
         COUNT(DISTINCT t.nid) FILTER (WHERE (SELECT n.martaba_ibn_hajar FROM narrators n WHERE n.id = t.nid) ~* 'ثقة')::int AS thiqa_count,
         COUNT(DISTINCT t.nid) FILTER (WHERE (SELECT n.martaba_ibn_hajar FROM narrators n WHERE n.id = t.nid) ~* 'ضعيف')::int AS daif_count,
         COUNT(DISTINCT t.nid) FILTER (WHERE (SELECT n.is_companion FROM narrators n WHERE n.id = t.nid) = true)::int AS companion_count
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id AND ih.hadith_id = $1
       CROSS JOIN LATERAL unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
       GROUP BY t.ord
       ORDER BY t.ord
       LIMIT 8`,
      [hadithId]
    ).catch(() => ({ rows: [] as PositionStats[] })) : Promise.resolve({ rows: [] as PositionStats[] }),

    q ? pool.query<SearchResult>(
      `SELECT
         ht.main_id AS hadith_id,
         LEFT(ht.tarf, 180) AS text_preview,
         b.title AS book_name,
         (SELECT COUNT(DISTINCT ic.id)::int FROM isnad_chains ic
          JOIN isnad_hadiths ih ON ih.isnad_id = ic.id WHERE ih.hadith_id = ht.main_id) AS chain_count
       FROM hadith_toc ht
       JOIN books b ON b.id = ht.book_id
       WHERE ht.tarf ~* $1
       ORDER BY ht.main_id
       LIMIT 10`,
      [q]
    ).catch(() => ({ rows: [] as SearchResult[] })) : Promise.resolve({ rows: [] as SearchResult[] }),
  ])

  const positions = positionsRes.rows
  const searchResults = searchRes.rows

  const maxNarrators = Math.max(...positions.map(p => p.unique_narrators), 1)

  function positionLabel(pos: number, companions: number) {
    if (companions > 0) return `الصحابي (م${pos})`
    if (pos <= 3) return `التابعي (م${pos})`
    return `م${pos}`
  }

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">تنوع الأسانيد في الحديث — كثرة الرواة بكل موضع</h1>
        <p className="text-sm text-gray-500">
          لكل حديث: كم راوياً مختلفاً نقله في كل موضع من مواضع السند؟ — يكشف مدى التواتر والشهرة في كل حلقة من حلقات الرواية
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-3 mb-4">
        <form method="get" action="/hadiths/chain-diversity" className="flex gap-2">
          <input type="text" name="q" defaultValue={q}
            placeholder="ابحث عن الحديث بكلمة من نصه..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400" dir="rtl" />
          <button type="submit" className="bg-green-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-800">بحث</button>
          {(q || hadithId) && (
            <a href="/hadiths/chain-diversity" className="text-sm border border-gray-200 px-3 py-2 rounded-lg text-gray-400">✕</a>
          )}
        </form>
      </div>

      {q && searchResults.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 mb-4 overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-100 text-xs text-gray-600 font-medium">
            نتائج البحث — اختر حديثاً لتحليل أسانيده
          </div>
          <div className="divide-y divide-gray-50">
            {searchResults.map(r => (
              <a key={r.hadith_id}
                href={`/hadiths/chain-diversity?id=${r.hadith_id}`}
                className={`flex items-start gap-3 px-4 py-3 hover:bg-green-50 transition-colors ${hadithId === r.hadith_id ? 'bg-green-50' : ''}`}>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs text-gray-500">{r.book_name}</span>
                    <span className="text-xs text-gray-300">{r.chain_count} سند</span>
                  </div>
                  <p className="text-sm text-gray-800 line-clamp-2">{r.text_preview}...</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {hadithId && positions.length > 0 ? (
        <>
          <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="font-bold text-green-900 text-sm">تحليل مواضع السند — حديث #{hadithId}</h2>
              <Link href={`/hadith/${hadithId}`} className="text-xs text-green-700 hover:underline mr-auto">
                صفحة الحديث ←
              </Link>
            </div>

            <div className="space-y-3">
              {positions.map(p => {
                const barW = Math.round((p.unique_narrators / maxNarrators) * 100)
                const diversity = p.unique_narrators === 1 ? 'فرد' : p.unique_narrators <= 3 ? 'قليل' : p.unique_narrators <= 10 ? 'متعدد' : 'كثير'
                const diversityColor = p.unique_narrators === 1 ? 'text-red-600 bg-red-50 border-red-200' : p.unique_narrators <= 3 ? 'text-amber-600 bg-amber-50 border-amber-200' : p.unique_narrators <= 10 ? 'text-blue-600 bg-blue-50 border-blue-200' : 'text-green-700 bg-green-50 border-green-200'
                return (
                  <div key={p.position} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-24 shrink-0">
                      {positionLabel(p.position, p.companion_count)}
                    </span>
                    <div className="flex-1 bg-gray-100 rounded-full h-5 relative">
                      <div className="bg-indigo-400 h-5 rounded-full transition-all flex items-center pr-2"
                        style={{ width: `${barW}%` }}>
                        {barW > 20 && (
                          <span className="text-white text-xs font-medium">{p.unique_narrators}</span>
                        )}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${diversityColor}`}>
                      {diversity}
                    </span>
                    <div className="text-xs text-gray-400 shrink-0 w-24 hidden sm:block truncate">
                      {p.top_narrator_name ? p.top_narrator_name.split(' ').slice(0, 2).join(' ') : ''}
                      {p.top_narrator_count ? ` (${p.top_narrator_count})` : ''}
                    </div>
                    <div className="flex gap-1 text-xs shrink-0">
                      {p.companion_count > 0 && <span className="text-amber-600">{p.companion_count}ص</span>}
                      {p.thiqa_count > 0 && <span className="text-green-600">{p.thiqa_count}ث</span>}
                      {p.daif_count > 0 && <span className="text-red-500">{p.daif_count}ض</span>}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
              <div className="flex gap-4 flex-wrap">
                <span className="text-red-600">■ فرد: راوٍ واحد فقط في هذا الموضع</span>
                <span className="text-amber-600">■ قليل: 2-3 رواة</span>
                <span className="text-blue-600">■ متعدد: 4-10 رواة</span>
                <span className="text-green-700">■ كثير: أكثر من 10 رواة</span>
              </div>
              <p>المواضع التي فيها راوٍ واحد (فرد) هي نقاط ضعف هيكلية في الإسناد — إذا ثبت ضعف ذلك الراوي ضعَّف الحديثَ جميعَ أسانيده</p>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap text-sm">
            <Link href={`/hadith/${hadithId}`} className="bg-green-700 text-white px-4 py-2 rounded-lg hover:bg-green-800">
              تفاصيل الحديث ←
            </Link>
            <Link href={`/hadith/${hadithId}/research-report`} className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:border-green-300">
              التقرير البحثي ←
            </Link>
            <Link href={`/hadith/${hadithId}/weak-links`} className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:border-red-300">
              الحلقات الضعيفة ←
            </Link>
          </div>
        </>
      ) : hadithId ? (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
          لا توجد أسانيد لهذا الحديث في قاعدة البيانات
        </div>
      ) : (
        <div className="bg-blue-50 rounded-xl border border-blue-100 p-8 text-center">
          <div className="text-3xl mb-3">🌳</div>
          <div className="font-semibold text-blue-900 text-sm mb-2">تحليل شجرة الإسناد</div>
          <p className="text-xs text-blue-700 leading-relaxed max-w-sm mx-auto">
            ابحث عن أي حديث واستعرض توزيع رواته في كل موضع من مواضع السند — من الصحابي إلى المصنِّف — لتحديد نقاط القوة والضعف الهيكلي في إسناده
          </p>
        </div>
      )}

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/narrator-bottleneck" className="text-green-700 hover:underline">← الرواة الفردية</Link>
        <Link href="/hadiths/takhrij-spread" className="text-green-700 hover:underline">← انتشار التخريج</Link>
        <Link href="/search" className="text-green-700 hover:underline">← البحث</Link>
      </div>
    </div>
  )
}
