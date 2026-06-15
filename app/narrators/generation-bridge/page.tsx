import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface BridgeNarrator {
  id: number
  name: string
  abb_name: string | null
  death_year: string | null
  death_year_num: number | null
  grade: string | null
  city: string | null
  early_companions: number
  late_students: number
  bridge_score: number
  hadith_count: number
  book_count: number
}

interface BridgeDetail {
  hadith_id: number
  hadith_text: string
  companion_name: string | null
  companion_death: number | null
  student_name: string | null
  student_death: number | null
  book_name: string
}

export default async function GenerationBridgePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; mincompanion?: string }>
}) {
  const sp = await searchParams
  const selectedId = parseInt(sp.id || '0') || null
  const minCompanions = parseInt(sp.mincompanion || '3')

  const [bridgesRes, detailRes] = await Promise.all([
    pool.query<BridgeNarrator>(
      `SELECT
         n.id,
         n.name,
         n.abb_name,
         n.death_year_num::text AS death_year,
         n.death_year_num,
         n.martaba_ibn_hajar AS grade,
         n.death_city AS city,
         COUNT(DISTINCT ic.narrator_id_array[1]) FILTER (
           WHERE (SELECT n2.death_year_num FROM narrators n2 WHERE n2.id = ic.narrator_id_array[1]) <= 40
         )::int AS early_companions,
         COUNT(DISTINCT ic.narrator_id_array[pos.ord + 1]) FILTER (
           WHERE (SELECT n3.death_year_num FROM narrators n3 WHERE n3.id = ic.narrator_id_array[pos.ord + 1]) >= 100
           AND pos.ord < array_length(ic.narrator_id_array, 1)
         )::int AS late_students,
         COUNT(DISTINCT ih.hadith_id)::int AS hadith_count,
         COUNT(DISTINCT ht.book_id)::int AS book_count,
         (
           COUNT(DISTINCT ic.narrator_id_array[1]) FILTER (
             WHERE (SELECT n2.death_year_num FROM narrators n2 WHERE n2.id = ic.narrator_id_array[1]) <= 40
           ) * 10
           + COUNT(DISTINCT ic.narrator_id_array[pos.ord + 1]) FILTER (
             WHERE (SELECT n3.death_year_num FROM narrators n3 WHERE n3.id = ic.narrator_id_array[pos.ord + 1]) >= 100
             AND pos.ord < array_length(ic.narrator_id_array, 1)
           ) * 5
           + COUNT(DISTINCT ih.hadith_id)
         )::int AS bridge_score
       FROM narrators n
       JOIN isnad_chains ic ON n.id = ANY(ic.narrator_id_array) AND NOT n.is_companion
       CROSS JOIN LATERAL (
         SELECT t.ord FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
         WHERE t.nid = n.id LIMIT 1
       ) pos
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       WHERE n.death_year_num BETWEEN 70 AND 160
         AND n.death_year_num IS NOT NULL
       GROUP BY n.id, n.name, n.abb_name, n.death_year_num, n.martaba_ibn_hajar, n.death_city
       HAVING COUNT(DISTINCT ic.narrator_id_array[1]) FILTER (
         WHERE (SELECT n2.death_year_num FROM narrators n2 WHERE n2.id = ic.narrator_id_array[1]) <= 40
       ) >= $1
       ORDER BY bridge_score DESC
       LIMIT 30`,
      [minCompanions]
    ).catch(() => ({ rows: [] as BridgeNarrator[] })),

    selectedId ? pool.query<BridgeDetail>(
      `SELECT
         ht.main_id AS hadith_id,
         LEFT(ht.tarf, 180) AS hadith_text,
         (SELECT n.name FROM narrators n WHERE n.id = ic.narrator_id_array[1]) AS companion_name,
         (SELECT n.death_year_num FROM narrators n WHERE n.id = ic.narrator_id_array[1]) AS companion_death,
         (SELECT n.name FROM narrators n WHERE n.id = ic.narrator_id_array[pos.ord + 1]
          AND pos.ord < array_length(ic.narrator_id_array, 1)) AS student_name,
         (SELECT n.death_year_num FROM narrators n WHERE n.id = ic.narrator_id_array[pos.ord + 1]
          AND pos.ord < array_length(ic.narrator_id_array, 1)) AS student_death,
         b.title AS book_name
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       JOIN books b ON b.id = ht.book_id
       CROSS JOIN LATERAL (
         SELECT t.ord FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
         WHERE t.nid = $1 LIMIT 1
       ) pos
       WHERE $1 = ANY(ic.narrator_id_array)
       ORDER BY companion_death ASC NULLS LAST
       LIMIT 20`,
      [selectedId]
    ).catch(() => ({ rows: [] as BridgeDetail[] })) : Promise.resolve({ rows: [] as BridgeDetail[] }),
  ])

  const bridges = bridgesRes.rows
  const details = detailRes.rows
  const selected = selectedId ? bridges.find(b => b.id === selectedId) : null
  const maxScore = Math.max(...bridges.map(b => b.bridge_score), 1)

  function gradeColor(g: string | null) {
    if (!g) return 'text-gray-400'
    if (/ثقة/.test(g)) return 'text-green-700'
    if (/صدوق/.test(g)) return 'text-blue-600'
    if (/ضعيف/.test(g)) return 'text-red-500'
    return 'text-gray-500'
  }

  const MIN_OPTIONS = [2, 3, 5, 8, 10]

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">رواة الجسور — حاملو الرواية بين الجيلين</h1>
        <p className="text-sm text-gray-500">
          رواة من الجيل الثاني (التابعين) سمعوا من كبار الصحابة ونقلوا إلى الجيل التالي — هم حلقة الوصل بين عصر النبوة وعصر التدوين
        </p>
      </div>

      <div className="flex gap-2 flex-wrap mb-4 items-center">
        <span className="text-xs text-gray-500">الحد الأدنى من الصحابة المبكرين:</span>
        {MIN_OPTIONS.map(m => (
          <a key={m}
            href={`/narrators/generation-bridge?mincompanion=${m}${selectedId ? `&id=${selectedId}` : ''}`}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${minCompanions === m ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
            {m}+
          </a>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-5">
        <div className="bg-amber-50 px-4 py-2 border-b border-amber-100 text-xs text-amber-800 font-medium">
          رواة وفاتهم بين 70-160هـ — مرتبون بدرجة الجسر (عدد الصحابة المبكرين × التلاميذ المتأخرين × الأحاديث)
        </div>
        <div className="divide-y divide-gray-50">
          {bridges.map((n, i) => (
            <a key={n.id}
              href={`/narrators/generation-bridge?id=${n.id}&mincompanion=${minCompanions}`}
              className={`px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${selectedId === n.id ? 'bg-amber-50' : ''}`}>
              <span className="text-xs text-gray-300 w-5 shrink-0">{(i + 1).toLocaleString('ar-EG')}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-medium text-sm ${selectedId === n.id ? 'text-amber-900' : 'text-green-900'} hover:underline`}>
                    {n.abb_name || n.name}
                  </span>
                  {n.death_year && <span className="text-xs text-gray-400">ت {n.death_year}</span>}
                  {n.grade && <span className={`text-xs ${gradeColor(n.grade)}`}>{n.grade.slice(0, 15)}</span>}
                  {n.city && <span className="text-xs text-gray-400 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded">{n.city.split(',')[0]}</span>}
                </div>
                <div className="flex gap-3 mt-0.5 text-xs text-gray-500">
                  <span className="text-amber-600">{n.early_companions} صحابي مبكر</span>
                  <span className="text-blue-500">{n.late_students} تلميذ متأخر</span>
                  <span>{n.hadith_count.toLocaleString('ar-EG')} حديث</span>
                  <span>{n.book_count} كتاب</span>
                </div>
              </div>
              <div className="w-20 shrink-0">
                <div className="text-xs text-gray-400 mb-0.5 text-left">جسر</div>
                <div className="bg-gray-100 rounded-full h-1.5">
                  <div className="bg-amber-400 h-1.5 rounded-full" style={{ width: `${(n.bridge_score / maxScore) * 100}%` }} />
                </div>
              </div>
            </a>
          ))}

          {bridges.length === 0 && (
            <div className="p-8 text-center text-sm text-gray-400">
              لا توجد رواة بهذه المعايير — جرب تخفيض الحد الأدنى للصحابة
            </div>
          )}
        </div>
      </div>

      {selected && details.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
          <h2 className="font-bold text-green-900 text-sm mb-1">
            نماذج أحاديث {selected.abb_name || selected.name} — الجسر الروائي
          </h2>
          <p className="text-xs text-gray-400 mb-3">
            من روى عنه من الصحابة ← {selected.abb_name || selected.name} ← من روى عنه
          </p>
          <div className="space-y-3">
            {details.map((d, di) => (
              <div key={d.hadith_id} className="border-b border-gray-50 pb-3">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {d.companion_name && (
                    <span className="text-xs bg-amber-50 border border-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                      {d.companion_name.split(' ').slice(0, 2).join(' ')}
                      {d.companion_death && ` ت${d.companion_death.toLocaleString('ar-EG')}`}
                    </span>
                  )}
                  <span className="text-gray-300 text-xs">←</span>
                  <span className="text-xs font-medium text-green-900">{selected.abb_name || selected.name}</span>
                  {d.student_name && (
                    <>
                      <span className="text-gray-300 text-xs">←</span>
                      <span className="text-xs bg-blue-50 border border-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                        {d.student_name.split(' ').slice(0, 2).join(' ')}
                        {d.student_death && ` ت${d.student_death.toLocaleString('ar-EG')}`}
                      </span>
                    </>
                  )}
                  <span className="text-xs text-gray-400 mr-auto">{d.book_name}</span>
                </div>
                <Link href={`/hadith/${d.hadith_id}`}
                  className="text-xs text-gray-700 hover:text-green-700 leading-relaxed">
                  {d.hadith_text}...
                </Link>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Link href={`/narrator/${selected.id}`} className="text-sm text-amber-700 hover:underline">← ترجمة {selected.abb_name || selected.name} الكاملة</Link>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators" className="text-green-700 hover:underline">← الرواة</Link>
        <Link href="/narrators/tabiin-analysis" className="text-green-700 hover:underline">← تحليل التابعين</Link>
        <Link href="/narrators/generations" className="text-green-700 hover:underline">← طبقات الرواة</Link>
        <Link href="/companions/inter-transmission" className="text-green-700 hover:underline">← رواية الصحابة بعضهم</Link>
      </div>
    </div>
  )
}
