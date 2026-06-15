import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'رواية الصحابة بعضهم عن بعض — جامع خادم الحرمين' }

interface PairRow {
  from_id: number
  from_name: string
  from_death: string | null
  to_id: number
  to_name: string
  to_death: string | null
  chain_count: number
  hadith_count: number
  sample_text: string | null
}

interface CompanionRow {
  id: number
  name: string
  abb_name: string | null
  received_from_count: number
  transmitted_to_count: number
}

export default async function InterCompanionTransmissionPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const sp = await searchParams
  const fromId = parseInt(sp.from || '0')
  const toId = parseInt(sp.to || '0')

  const [pairsRes, companionsRes, detailRes] = await Promise.all([
    // All companion-to-companion transmission pairs
    pool.query<PairRow>(
      `SELECT
         n1.id AS from_id, n1.name AS from_name, n1.death_year_num AS from_death,
         n2.id AS to_id, n2.name AS to_name, n2.death_year_num AS to_death,
         COUNT(DISTINCT ic.id)::int AS chain_count,
         COUNT(DISTINCT ih.hadith_id)::int AS hadith_count,
         LEFT(MIN(ht.tarf), 120) AS sample_text
       FROM isnad_chains ic
       JOIN narrators n1 ON n1.id = ic.narrator_id_array[1] AND n1.is_companion = true
       JOIN narrators n2 ON n2.id = ic.narrator_id_array[2] AND n2.is_companion = true
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       WHERE array_length(ic.narrator_id_array, 1) >= 2
         ${fromId > 0 ? 'AND n1.id = $1' : ''}
         ${toId > 0 ? (fromId > 0 ? 'AND n2.id = $2' : 'AND n2.id = $1') : ''}
       GROUP BY n1.id, n1.name, n1.death_year_num, n2.id, n2.name, n2.death_year_num
       ORDER BY hadith_count DESC
       LIMIT 50`,
      fromId > 0 && toId > 0 ? [fromId, toId] :
        fromId > 0 ? [fromId] :
        toId > 0 ? [toId] : []
    ).catch(() => ({ rows: [] as PairRow[] })),

    // Top companions who received from other companions
    pool.query<CompanionRow>(
      `SELECT
         n2.id,
         n2.name,
         n2.abb_name,
         COUNT(DISTINCT n1.id)::int AS received_from_count,
         0 AS transmitted_to_count
       FROM isnad_chains ic
       JOIN narrators n1 ON n1.id = ic.narrator_id_array[1] AND n1.is_companion = true
       JOIN narrators n2 ON n2.id = ic.narrator_id_array[2] AND n2.is_companion = true
       WHERE array_length(ic.narrator_id_array, 1) >= 2
       GROUP BY n2.id, n2.name, n2.abb_name
       ORDER BY received_from_count DESC
       LIMIT 20`
    ).catch(() => ({ rows: [] as CompanionRow[] })),

    // Hadiths for a specific pair
    (fromId > 0 && toId > 0) ? pool.query<{ hadith_id: number; hadith_text: string; book_name: string; judgment: string | null }>(
      `SELECT DISTINCT ON (ih.hadith_id)
              ih.hadith_id,
              LEFT(ht.tarf, 300) AS hadith_text,
              b.title AS book_name,
              (SELECT hj.say_text FROM hadith_judgments hj WHERE hj.hadith_id = ih.hadith_id LIMIT 1) AS judgment
       FROM isnad_chains ic
       JOIN narrators n1 ON n1.id = ic.narrator_id_array[1] AND n1.id = $1
       JOIN narrators n2 ON n2.id = ic.narrator_id_array[2] AND n2.id = $2
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       JOIN books b ON b.id = ht.book_id
       WHERE array_length(ic.narrator_id_array, 1) >= 2
       ORDER BY ih.hadith_id, b.takhrij_death
       LIMIT 20`,
      [fromId, toId]
    ).catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] }),
  ])

  const pairs = pairsRes.rows
  const companions = companionsRes.rows
  const detail = detailRes.rows
  const maxHadiths = Math.max(...pairs.map(p => p.hadith_count), 1)

  const fromNarrator = fromId > 0 ? pairs[0] : null
  const toNarrator = toId > 0 ? pairs[0] : null

  function judgmentColor(j: string | null) {
    if (!j) return 'text-gray-400'
    if (/صحيح/.test(j)) return 'text-green-700'
    if (/حسن/.test(j)) return 'text-blue-700'
    if (/ضعيف/.test(j)) return 'text-red-600'
    return 'text-gray-500'
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">رواية الصحابة بعضهم عن بعض</h1>
        <p className="text-sm text-gray-500 mb-2">
          الأسانيد التي فيها صحابي يروي عن صحابي آخر — ظاهرة نادرة تكشف نقل العلم داخل جيل الصحابة
        </p>
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5 text-xs text-amber-700">
          هذه رواية الصحابي عن الصحابي في الأسانيد (أي: صحابيان في موضعَي 1 و2 من السند) — وليست مجرد التقاء الصحابة بعضهم ببعض
        </div>
      </div>

      {/* Filter controls */}
      <div className="flex flex-wrap gap-2 mb-4 text-xs">
        <a href="/companions/inter-transmission"
          className={`px-3 py-1.5 rounded-full border ${!fromId && !toId ? 'bg-green-800 text-white border-green-800' : 'bg-white text-gray-600 border-gray-200'}`}>
          جميع الأزواج
        </a>
        {companions.slice(0, 10).map(c => (
          <a key={c.id}
            href={`/companions/inter-transmission?to=${c.id}`}
            className={`px-3 py-1 rounded-full border ${toId === c.id ? 'bg-amber-600 text-white border-amber-600' : 'bg-amber-50 text-amber-800 border-amber-100 hover:border-amber-300'}`}>
            روى عنه: {c.abb_name || c.name} ({c.received_from_count})
          </a>
        ))}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
          <div className="text-xl font-bold text-amber-800">{pairs.length.toLocaleString('ar-EG')}</div>
          <div className="text-xs text-gray-400">زوج صحابة</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
          <div className="text-xl font-bold text-green-800">
            {pairs.reduce((a, p) => a + p.hadith_count, 0).toLocaleString('ar-EG')}
          </div>
          <div className="text-xs text-gray-400">حديث بين الصحابة</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
          <div className="text-xl font-bold text-blue-700">
            {new Set(pairs.map(p => p.to_id)).size.toLocaleString('ar-EG')}
          </div>
          <div className="text-xs text-gray-400">صحابي تلقَّى عن آخر</div>
        </div>
      </div>

      {/* Pair list */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-4">
        <div className="bg-amber-50 px-4 py-2 border-b border-gray-100 text-xs text-amber-800 font-medium">
          {fromId > 0 || toId > 0
            ? `الأسانيد المفلترة (${pairs.length})`
            : `أكثر الأزواج رواية (أول 50)`}
        </div>
        <div className="divide-y divide-gray-50">
          {pairs.map((p, i) => (
            <div key={`${p.from_id}-${p.to_id}`}
              className="px-4 py-3 hover:bg-amber-50 transition-colors">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-300 w-5 text-center">{(i + 1).toLocaleString('ar-EG')}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Link href={`/narrator/${p.from_id}`}
                      className="text-sm font-semibold text-amber-800 hover:underline">
                      {p.from_name}
                    </Link>
                    {p.from_death && <span className="text-xs text-gray-400">ت {p.from_death}</span>}
                    <span className="text-xs text-gray-300">←</span>
                    <Link href={`/narrator/${p.to_id}`}
                      className="text-sm font-semibold text-amber-700 hover:underline">
                      {p.to_name}
                    </Link>
                    {p.to_death && <span className="text-xs text-gray-400">ت {p.to_death}</span>}
                  </div>
                  {p.sample_text && (
                    <div className="text-xs text-gray-500 truncate">
                      {p.sample_text}...
                    </div>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <div className="w-16 bg-gray-100 rounded-full h-1.5 hidden sm:block">
                    <div className="bg-amber-400 h-1.5 rounded-full"
                      style={{ width: `${(p.hadith_count / maxHadiths) * 100}%` }} />
                  </div>
                  <span className="text-xs text-amber-700 font-medium w-12 text-left">
                    {p.hadith_count} ح
                  </span>
                  <a href={`/companions/inter-transmission?from=${p.from_id}&to=${p.to_id}`}
                    className="text-xs text-gray-400 hover:text-gray-600">←</a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Specific pair detail */}
      {fromId > 0 && toId > 0 && detail.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-bold text-green-900 text-sm">الأحاديث ({detail.length})</h2>
          {detail.map((h: { hadith_id: number; hadith_text: string; book_name: string; judgment: string | null }) => (
            <div key={h.hadith_id}
              className="bg-white rounded-xl border border-gray-100 p-3 hover:border-amber-200 transition-colors">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-gray-400">{h.book_name}</span>
                {h.judgment && (
                  <span className={`text-xs ${judgmentColor(h.judgment)}`}>
                    {h.judgment.slice(0, 40)}
                  </span>
                )}
                <Link href={`/hadith/${h.hadith_id}`}
                  className="text-xs text-green-700 hover:underline mr-auto">←</Link>
              </div>
              <p className="text-sm text-gray-900 leading-relaxed">
                {h.hadith_text}
                {h.hadith_text?.length === 300 && '...'}
              </p>
            </div>
          ))}
        </div>
      )}

      {pairs.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
          لا توجد بيانات تطابق هذا التصفية
        </div>
      )}

      {/* Who received from most companions */}
      {!fromId && !toId && companions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mt-4">
          <h2 className="font-bold text-green-900 text-sm mb-3">أكثر الصحابة أخذاً عن الصحابة</h2>
          <div className="flex flex-wrap gap-2">
            {companions.map(c => (
              <a key={c.id}
                href={`/companions/inter-transmission?to=${c.id}`}
                className="text-xs bg-amber-50 border border-amber-100 text-amber-900 px-3 py-1.5 rounded-full hover:bg-amber-100 transition-colors">
                {c.abb_name || c.name}
                <span className="text-amber-600 mr-1">({c.received_from_count})</span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/companions" className="text-green-700 hover:underline">← الصحابة</Link>
        <Link href="/narrators/tabiin-analysis" className="text-green-700 hover:underline">← تحليل التابعين</Link>
        <Link href="/companions/compare" className="text-green-700 hover:underline">← مقارنة الصحابة</Link>
      </div>
    </div>
  )
}
