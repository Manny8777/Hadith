import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface SingleHadith {
  hadith_id: number
  hadith_text: string
  book_name: string
  chapter_name: string | null
  companion_id: number
  companion_name: string
  chain_count: number
  book_count: number
  judgment_text: string | null
}

interface CompanionCount {
  companion_id: number
  companion_name: string
  abb_name: string | null
  unique_count: number
}

const FIQH_TOPICS = [
  { label: 'جميع الموضوعات', pattern: '' },
  { label: 'الطهارة', pattern: 'طهار|وضوء|غسل|تيمم|نجاس|حيض' },
  { label: 'الصلاة', pattern: 'صلا|أذان|قبلة|إمام|جمعة|سجود|ركوع' },
  { label: 'الزكاة', pattern: 'زكا|صدق|فطر|عشر' },
  { label: 'الصيام', pattern: 'صيام|صوم|رمضان|إفطار|سحور' },
  { label: 'الحج', pattern: 'حج|عمرة|طواف|إحرام|منى|عرفة|كعبة' },
  { label: 'البيوع', pattern: 'بيع|شراء|ربا|قرض|رهن|عقد' },
  { label: 'النكاح', pattern: 'نكاح|زواج|طلاق|مهر|خلع|عدة' },
  { label: 'الحدود', pattern: 'حد|قصاص|دية|جلد|قطع|زنا|سرقة' },
  { label: 'الجهاد', pattern: 'جهاد|غزو|حرب|قتال|شهيد|فيء|غنيمة' },
]

export default async function SingleCompanionPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string; companion?: string; page?: string; minchains?: string }>
}) {
  const sp = await searchParams
  const topicIdx = parseInt(sp.topic || '0')
  const selectedTopic = FIQH_TOPICS[topicIdx] || FIQH_TOPICS[0]
  const selectedCompanion = parseInt(sp.companion || '0') || null
  const page = Math.max(1, parseInt(sp.page || '1'))
  const pageSize = 20
  const offset = (page - 1) * pageSize
  const minChains = parseInt(sp.minchains || '1')

  const topicSql = selectedTopic.pattern ? `AND ht.chapter_text ~* '${selectedTopic.pattern}'` : ''
  const companionSql = selectedCompanion ? `AND companion_id = ${selectedCompanion}` : ''
  const chainsSql = minChains > 1 ? `AND chain_count >= ${minChains}` : ''

  const [companionCountsRes, haditshRes] = await Promise.all([
    pool.query<CompanionCount>(
      `WITH companion_hadiths AS (
         SELECT
           ic.narrator_id_array[1] AS companion_id,
           ih.hadith_id,
           COUNT(DISTINCT ic2.narrator_id_array[1]) FILTER (WHERE n2.is_companion) AS companion_count
         FROM isnad_chains ic
         JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
         JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
         JOIN narrators n ON n.id = ic.narrator_id_array[1] AND n.is_companion = true
         LEFT JOIN isnad_hadiths ih2 ON ih2.hadith_id = ih.hadith_id
         LEFT JOIN isnad_chains ic2 ON ic2.id = ih2.isnad_id
         LEFT JOIN narrators n2 ON n2.id = ic2.narrator_id_array[1]
         ${topicSql.replace('AND ht.', 'WHERE ht.')}
         GROUP BY ic.narrator_id_array[1], ih.hadith_id
       )
       SELECT
         ch.companion_id,
         n.name AS companion_name,
         n.abb_name,
         COUNT(DISTINCT ch.hadith_id)::int AS unique_count
       FROM companion_hadiths ch
       JOIN narrators n ON n.id = ch.companion_id
       WHERE ch.companion_count = 1
       GROUP BY ch.companion_id, n.name, n.abb_name
       ORDER BY COUNT(DISTINCT ch.hadith_id) DESC
       LIMIT 30`,
      []
    ).catch(() => ({ rows: [] as CompanionCount[] })),

    pool.query<SingleHadith>(
      `WITH companion_hadith_counts AS (
         SELECT
           ih.hadith_id,
           COUNT(DISTINCT ic.narrator_id_array[1]) FILTER (WHERE n.is_companion) AS companion_count
         FROM isnad_chains ic
         JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
         JOIN narrators n ON n.id = ic.narrator_id_array[1]
         GROUP BY ih.hadith_id
         HAVING COUNT(DISTINCT ic.narrator_id_array[1]) FILTER (WHERE n.is_companion) = 1
       ),
       hadith_details AS (
         SELECT
           ht.main_id AS hadith_id,
           ht.tarf,
           ht.chapter_text,
           ht.book_id,
           b.title AS book_name,
           (SELECT n.id FROM isnad_chains ic JOIN isnad_hadiths ih ON ih.isnad_id = ic.id AND ih.hadith_id = ht.main_id
            JOIN narrators n ON n.id = ic.narrator_id_array[1] AND n.is_companion = true LIMIT 1) AS companion_id,
           (SELECT n.name FROM isnad_chains ic JOIN isnad_hadiths ih ON ih.isnad_id = ic.id AND ih.hadith_id = ht.main_id
            JOIN narrators n ON n.id = ic.narrator_id_array[1] AND n.is_companion = true LIMIT 1) AS companion_name,
           COUNT(DISTINCT ic2.id)::int AS chain_count,
           COUNT(DISTINCT ht2.book_id)::int AS book_count
         FROM companion_hadith_counts chc
         JOIN hadith_toc ht ON ht.main_id = chc.hadith_id
         JOIN books b ON b.id = ht.book_id
         LEFT JOIN isnad_hadiths ih2 ON ih2.hadith_id = ht.main_id
         LEFT JOIN isnad_chains ic2 ON ic2.id = ih2.isnad_id
         LEFT JOIN hadith_toc ht2 ON ht2.takhrij_id = ht.takhrij_id AND ht2.takhrij_id IS NOT NULL
         ${topicSql}
         GROUP BY ht.main_id, ht.tarf, ht.chapter_text, ht.book_id, b.title
       )
       SELECT
         hd.hadith_id,
         LEFT(hd.tarf, 220) AS hadith_text,
         hd.book_name,
         hd.chapter_text AS chapter_name,
         hd.companion_id,
         hd.companion_name,
         hd.chain_count,
         hd.book_count,
         (SELECT hj.say_text FROM hadith_judgments hj WHERE hj.hadith_id = hd.hadith_id LIMIT 1) AS judgment_text
       FROM hadith_details hd
       WHERE hd.companion_id IS NOT NULL
         ${companionSql}
         ${chainsSql}
       ORDER BY hd.chain_count DESC, hd.hadith_id
       LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    ).catch(() => ({ rows: [] as SingleHadith[] })),
  ])

  const companionCounts = companionCountsRes.rows
  const hadiths = haditshRes.rows

  function judgmentColor(j: string | null) {
    if (!j) return 'text-gray-400'
    if (/صحيح/.test(j)) return 'text-green-700'
    if (/حسن/.test(j)) return 'text-blue-600'
    if (/ضعيف/.test(j)) return 'text-red-500'
    return 'text-gray-500'
  }

  const CHAIN_OPTIONS = [1, 2, 3, 5]

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">أحاديث الآحاد الصحابي</h1>
        <p className="text-sm text-gray-500">
          أحاديث لم يرويها إلا صحابي واحد — جوهر بحث الغريب والفرد في علوم الحديث، مع تصنيف موضوعي فقهي
        </p>
      </div>

      <div className="flex gap-2 flex-wrap mb-3">
        {FIQH_TOPICS.map((t, idx) => (
          <a key={idx}
            href={`/hadiths/single-companion?topic=${idx}${selectedCompanion ? `&companion=${selectedCompanion}` : ''}&minchains=${minChains}`}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${topicIdx === idx ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
            {t.label}
          </a>
        ))}
      </div>

      <div className="flex gap-2 mb-4 items-center">
        <span className="text-xs text-gray-500">حد أدنى للأسانيد:</span>
        {CHAIN_OPTIONS.map(n => (
          <a key={n}
            href={`/hadiths/single-companion?topic=${topicIdx}&minchains=${n}${selectedCompanion ? `&companion=${selectedCompanion}` : ''}`}
            className={`text-xs px-2.5 py-1 rounded-full border ${minChains === n ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-gray-600 border-gray-200'}`}>
            {n}+
          </a>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="sm:col-span-1">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden sticky top-20">
            <div className="bg-amber-50 px-3 py-2 border-b border-amber-100 text-xs text-amber-800 font-medium">
              الصحابة المنفردون
            </div>
            <div className="divide-y divide-gray-50 max-h-[65vh] overflow-y-auto">
              <a href={`/hadiths/single-companion?topic=${topicIdx}&minchains=${minChains}`}
                className={`px-3 py-2 flex items-center gap-2 hover:bg-amber-50 ${!selectedCompanion ? 'bg-amber-50' : ''}`}>
                <span className="text-xs text-gray-500">الكل</span>
              </a>
              {companionCounts.map(c => (
                <a key={c.companion_id}
                  href={`/hadiths/single-companion?topic=${topicIdx}&companion=${c.companion_id}&minchains=${minChains}`}
                  className={`px-3 py-2 flex items-center gap-2 hover:bg-amber-50 ${selectedCompanion === c.companion_id ? 'bg-amber-50' : ''}`}>
                  <div className="flex-1">
                    <div className={`text-xs font-medium truncate ${selectedCompanion === c.companion_id ? 'text-amber-900' : 'text-green-900'}`}>
                      {c.abb_name || c.companion_name.split(' ').slice(0, 2).join(' ')}
                    </div>
                    <div className="text-xs text-amber-600">{c.unique_count} حديث</div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="sm:col-span-3">
          <div className="space-y-3">
            {hadiths.map(h => (
              <div key={h.hadith_id} className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {h.chapter_name && <span className="text-xs text-gray-400">{h.chapter_name}</span>}
                  <span className="text-xs text-gray-500">{h.book_name}</span>
                  {h.judgment_text && (
                    <span className={`text-xs ${judgmentColor(h.judgment_text)}`}>{h.judgment_text.slice(0, 30)}</span>
                  )}
                </div>
                <p className="text-sm text-gray-900 leading-relaxed mb-2">{h.hadith_text}...</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <Link href={`/narrator/${h.companion_id}`}
                    className="text-xs bg-amber-50 border border-amber-100 text-amber-800 px-2 py-0.5 rounded-full hover:bg-amber-100">
                    {h.companion_name.split(' ').slice(0, 2).join(' ')}
                  </Link>
                  <span className="text-xs text-gray-400">{h.chain_count} سند · {h.book_count} كتاب</span>
                  <div className="flex gap-2 mr-auto text-xs">
                    <Link href={`/hadith/${h.hadith_id}`} className="text-green-700 hover:underline">تفاصيل ←</Link>
                    <Link href={`/hadith/${h.hadith_id}/research-report`} className="text-blue-600 hover:underline">تقرير ←</Link>
                  </div>
                </div>
              </div>
            ))}

            {hadiths.length === 0 && (
              <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
                لا توجد أحاديث آحاد لهذه المعايير
              </div>
            )}
          </div>

          {(hadiths.length === pageSize || page > 1) && (
            <div className="flex gap-2 mt-4 justify-center">
              {page > 1 && (
                <a href={`/hadiths/single-companion?topic=${topicIdx}&minchains=${minChains}${selectedCompanion ? `&companion=${selectedCompanion}` : ''}&page=${page - 1}`}
                  className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">
                  ← السابق
                </a>
              )}
              <span className="text-sm text-gray-400 self-center">صفحة {page.toLocaleString('ar-EG')}</span>
              {hadiths.length === pageSize && (
                <a href={`/hadiths/single-companion?topic=${topicIdx}&minchains=${minChains}${selectedCompanion ? `&companion=${selectedCompanion}` : ''}&page=${page + 1}`}
                  className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">
                  التالي →
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/companion-count" className="text-green-700 hover:underline">← المتواتر والغريب</Link>
        <Link href="/unique-hadiths" className="text-green-700 hover:underline">← الأحاديث الفردة</Link>
        <Link href="/companions" className="text-green-700 hover:underline">← الصحابة</Link>
      </div>
    </div>
  )
}
