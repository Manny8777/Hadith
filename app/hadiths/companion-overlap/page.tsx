import pool from '@/lib/db'
import Link from 'next/link'
import NavigateSelect from '@/app/components/NavigateSelect'

export const dynamic = 'force-dynamic'

interface CompanionPair {
  companion1_id: number
  companion1_name: string
  companion2_id: number
  companion2_name: string
  shared_hadiths: number
  shared_pct_1: number
  shared_pct_2: number
}

interface SharedHadith {
  hadith_id: number
  hadith_text: string
  book_count: number
  judgment_text: string | null
  chapter_name: string | null
}

interface TopCompanion {
  id: number
  name: string
  abb_name: string | null
  hadith_count: number
}

export default async function CompanionOverlapPage({
  searchParams,
}: {
  searchParams: Promise<{ c1?: string; c2?: string; page?: string; minshared?: string }>
}) {
  const sp = await searchParams
  const c1 = parseInt(sp.c1 || '0') || null
  const c2 = parseInt(sp.c2 || '0') || null
  const page = Math.max(1, parseInt(sp.page || '1'))
  const pageSize = 20
  const offset = (page - 1) * pageSize
  const minShared = parseInt(sp.minshared || '5')

  const [companionsRes, pairsRes, sharedHadithsRes] = await Promise.all([
    pool.query<TopCompanion>(
      `SELECT n.id, n.name, n.abb_name,
         COUNT(DISTINCT ih.hadith_id)::int AS hadith_count
       FROM narrators n
       JOIN isnad_chains ic ON ic.narrator_id_array[1] = n.id AND n.is_companion = true
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       GROUP BY n.id, n.name, n.abb_name
       ORDER BY COUNT(DISTINCT ih.hadith_id) DESC
       LIMIT 30`,
      []
    ).catch(() => ({ rows: [] as TopCompanion[] })),

    pool.query<CompanionPair>(
      `WITH companion_hadiths AS (
         SELECT ic.narrator_id_array[1] AS companion_id, ih.hadith_id
         FROM isnad_chains ic
         JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
         JOIN narrators n ON n.id = ic.narrator_id_array[1] AND n.is_companion = true
         JOIN hadith_toc ht ON ht.main_id = ih.hadith_id AND ht.takhrij_id IS NOT NULL
       ),
       pair_counts AS (
         SELECT
           ch1.companion_id AS c1,
           ch2.companion_id AS c2,
           COUNT(DISTINCT ch1.hadith_id) AS shared
         FROM companion_hadiths ch1
         JOIN companion_hadiths ch2 ON ch2.hadith_id = ch1.hadith_id AND ch2.companion_id > ch1.companion_id
         GROUP BY ch1.companion_id, ch2.companion_id
         HAVING COUNT(DISTINCT ch1.hadith_id) >= $1
       )
       SELECT
         n1.id AS companion1_id, n1.name AS companion1_name,
         n2.id AS companion2_id, n2.name AS companion2_name,
         pc.shared AS shared_hadiths,
         ROUND(pc.shared * 100.0 / NULLIF((
           SELECT COUNT(DISTINCT ch.hadith_id) FROM companion_hadiths ch WHERE ch.companion_id = n1.id
         ), 0), 1)::float AS shared_pct_1,
         ROUND(pc.shared * 100.0 / NULLIF((
           SELECT COUNT(DISTINCT ch.hadith_id) FROM companion_hadiths ch WHERE ch.companion_id = n2.id
         ), 0), 1)::float AS shared_pct_2
       FROM pair_counts pc
       JOIN narrators n1 ON n1.id = pc.c1
       JOIN narrators n2 ON n2.id = pc.c2
       ORDER BY pc.shared DESC
       LIMIT 30`,
      [minShared]
    ).catch(() => ({ rows: [] as CompanionPair[] })),

    (c1 && c2) ? pool.query<SharedHadith>(
      `WITH comp1_hadiths AS (
         SELECT DISTINCT ih.hadith_id
         FROM isnad_chains ic
         JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
         WHERE ic.narrator_id_array[1] = $1
       ),
       comp2_hadiths AS (
         SELECT DISTINCT ih.hadith_id
         FROM isnad_chains ic
         JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
         WHERE ic.narrator_id_array[1] = $2
       )
       SELECT
         ht.main_id AS hadith_id,
         LEFT(ht.tarf, 220) AS hadith_text,
         COUNT(DISTINCT ht2.book_id)::int AS book_count,
         (SELECT hj.say_text FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id LIMIT 1) AS judgment_text,
         ht.chapter_text AS chapter_name
       FROM comp1_hadiths c1h
       JOIN comp2_hadiths c2h ON c2h.hadith_id = c1h.hadith_id
       JOIN hadith_toc ht ON ht.main_id = c1h.hadith_id
       LEFT JOIN hadith_toc ht2 ON ht2.takhrij_id = ht.takhrij_id AND ht2.takhrij_id IS NOT NULL
       GROUP BY ht.main_id, ht.tarf, ht.chapter_text
       ORDER BY COUNT(DISTINCT ht2.book_id) DESC
       LIMIT $3 OFFSET $4`,
      [c1, c2, pageSize, offset]
    ).catch(() => ({ rows: [] as SharedHadith[] })) : Promise.resolve({ rows: [] as SharedHadith[] }),
  ])

  const companions = companionsRes.rows
  const pairs = pairsRes.rows
  const sharedHadiths = sharedHadithsRes.rows

  const selectedC1 = c1 ? companions.find(c => c.id === c1) : null
  const selectedC2 = c2 ? companions.find(c => c.id === c2) : null
  const selectedPair = c1 && c2 ? pairs.find(p => (p.companion1_id === c1 && p.companion2_id === c2) || (p.companion1_id === c2 && p.companion2_id === c1)) : null

  const MIN_OPTIONS = [3, 5, 10, 20, 30]

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
        <h1 className="text-2xl font-bold text-green-900 mb-1">الأحاديث المشتركة بين الصحابة</h1>
        <p className="text-sm text-gray-500">
          أحاديث رواها أكثر من صحابي — أساس بحث التواتر والتعدد الصحابي في مسائل الفقه والعقيدة
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">الصحابي الأول:</label>
          <NavigateSelect
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            href={`/hadiths/companion-overlap?c2=${c2 || ''}&minshared=${minShared}`}
            param="c1"
            defaultValue={c1}>
            <option value="">— اختر صحابياً —</option>
            {companions.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.hadith_count})</option>
            ))}
          </NavigateSelect>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">الصحابي الثاني:</label>
          <NavigateSelect
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            href={`/hadiths/companion-overlap?c1=${c1 || ''}&minshared=${minShared}`}
            param="c2"
            defaultValue={c2}>
            <option value="">— اختر صحابياً —</option>
            {companions.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.hadith_count})</option>
            ))}
          </NavigateSelect>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mb-4 items-center">
        <span className="text-xs text-gray-500">الحد الأدنى للأحاديث المشتركة:</span>
        {MIN_OPTIONS.map(m => (
          <a key={m}
            href={`/hadiths/companion-overlap?minshared=${m}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${minShared === m ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
            {m}+
          </a>
        ))}
      </div>

      {selectedPair && (
        <div className="bg-green-50 border border-green-100 rounded-xl p-4 mb-4">
          <h2 className="font-bold text-green-900">
            {selectedC1?.abb_name || selectedC1?.name} & {selectedC2?.abb_name || selectedC2?.name}
          </h2>
          <div className="flex gap-6 mt-2 text-sm">
            <div><span className="font-bold text-green-700">{selectedPair.shared_hadiths.toLocaleString('ar-EG')}</span> <span className="text-gray-500">حديث مشترك</span></div>
            <div><span className="text-gray-500">{selectedPair.shared_pct_1}% من روايات {selectedC1?.abb_name || selectedC1?.name}</span></div>
            <div><span className="text-gray-500">{selectedPair.shared_pct_2}% من روايات {selectedC2?.abb_name || selectedC2?.name}</span></div>
          </div>
        </div>
      )}

      {sharedHadiths.length > 0 && (
        <div className="space-y-3 mb-5">
          <h2 className="font-bold text-green-900 text-sm">الأحاديث المشتركة مرتَّبة بعدد الكتب</h2>
          {sharedHadiths.map(h => (
            <div key={h.hadith_id} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {h.chapter_name && <span className="text-xs text-gray-400">{h.chapter_name}</span>}
                {h.judgment_text && (
                  <span className={`text-xs ${judgmentColor(h.judgment_text)}`}>{h.judgment_text.slice(0, 35)}</span>
                )}
                <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full mr-auto">
                  {h.book_count} كتاب
                </span>
              </div>
              <p className="text-sm text-gray-900 leading-relaxed mb-2">{h.hadith_text}...</p>
              <div className="flex gap-3 text-xs">
                <Link href={`/hadith/${h.hadith_id}`} className="text-green-700 hover:underline">تفاصيل ←</Link>
                <Link href={`/hadith/${h.hadith_id}/research-report`} className="text-blue-600 hover:underline">تقرير ←</Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="bg-amber-50 px-4 py-2 border-b border-amber-100 text-xs text-amber-800 font-medium">
          ثنائيات الصحابة — أكثر الأزواج مشاركةً في الروايات (حد أدنى {minShared} أحاديث مشتركة)
        </div>
        <div className="divide-y divide-gray-50">
          {pairs.map((p, i) => (
            <a key={`${p.companion1_id}-${p.companion2_id}`}
              href={`/hadiths/companion-overlap?c1=${p.companion1_id}&c2=${p.companion2_id}&minshared=${minShared}`}
              className={`px-4 py-3 flex items-center gap-3 hover:bg-gray-50 ${(c1 === p.companion1_id && c2 === p.companion2_id) || (c1 === p.companion2_id && c2 === p.companion1_id) ? 'bg-amber-50' : ''}`}>
              <span className="text-xs text-gray-300 w-5 shrink-0">{(i + 1).toLocaleString('ar-EG')}</span>
              <div className="flex-1 flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-amber-900">
                  {p.companion1_name.split(' ').slice(0, 2).join(' ')}
                </span>
                <span className="text-gray-300 text-xs">&</span>
                <span className="text-sm font-medium text-green-900">
                  {p.companion2_name.split(' ').slice(0, 2).join(' ')}
                </span>
              </div>
              <div className="text-left shrink-0">
                <div className="text-sm font-bold text-green-700">{p.shared_hadiths.toLocaleString('ar-EG')} مشترك</div>
              </div>
            </a>
          ))}
        </div>

        {pairs.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400">لا توجد أحاديث مشتركة بهذا الحد الأدنى — جرب تخفيض العدد</div>
        )}
      </div>

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/companion-count" className="text-green-700 hover:underline">← المتواتر والغريب</Link>
        <Link href="/companions" className="text-green-700 hover:underline">← الصحابة</Link>
        <Link href="/companions/compare" className="text-green-700 hover:underline">← مقارنة الصحابة</Link>
      </div>
    </div>
  )
}
