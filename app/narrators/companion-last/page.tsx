import pool from '@/lib/db'
import Link from 'next/link'
import UiIcon from '@/app/components/UiIcon'

export const dynamic = 'force-dynamic'

interface LateCompanion {
  id: number
  name: string
  abb_name: string | null
  city: string | null
  death_year: string | null
  death_year_num: number | null
  hadith_count: number
  unique_books: number
  unique_students: number
}

interface CompanionHadith {
  hadith_id: number
  hadith_text: string
  book_name: string
  judgment_text: string | null
  chain_count: number
}

export default async function CompanionLastPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; minYear?: string; limit?: string }>
}) {
  const sp = await searchParams
  const selectedId = parseInt(sp.id || '0') || null
  const minYear = parseInt(sp.minYear || '60')
  const limit = parseInt(sp.limit || '30')

  const [companionsRes, haditshRes] = await Promise.all([
    pool.query<LateCompanion>(
      `SELECT
         n.id, n.name, n.abb_name, n.death_city AS city, n.death_year_num,
         COUNT(DISTINCT ih.hadith_id)::int AS hadith_count,
         COUNT(DISTINCT ht.book_id)::int AS unique_books,
         COUNT(DISTINCT ic.narrator_id_array[2])::int AS unique_students
       FROM narrators n
       LEFT JOIN isnad_chains ic ON ic.narrator_id_array[1] = n.id
       LEFT JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       LEFT JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       WHERE n.is_companion = true
         AND n.death_year_num >= $1
         AND n.death_year_num IS NOT NULL
       GROUP BY n.id, n.name, n.abb_name, n.death_city, n.death_year_num
       ORDER BY n.death_year_num DESC, COUNT(DISTINCT ih.hadith_id) DESC
       LIMIT $2`,
      [minYear, limit]
    ).catch(() => ({ rows: [] as LateCompanion[] })),

    selectedId ? pool.query<CompanionHadith>(
      `SELECT
         ht.main_id AS hadith_id,
         LEFT(ht.tarf, 200) AS hadith_text,
         b.title AS book_name,
         (SELECT hj.say_text FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id LIMIT 1) AS judgment_text,
         (SELECT COUNT(DISTINCT ic2.id)::int FROM isnad_chains ic2
          JOIN isnad_hadiths ih2 ON ih2.isnad_id = ic2.id WHERE ih2.hadith_id = ht.main_id) AS chain_count
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       JOIN books b ON b.id = ht.book_id
       WHERE ic.narrator_id_array[1] = $1
       ORDER BY ht.book_id, ht.main_id
       LIMIT 15`,
      [selectedId]
    ).catch(() => ({ rows: [] as CompanionHadith[] })) : Promise.resolve({ rows: [] as CompanionHadith[] }),
  ])

  const companions = companionsRes.rows
  const hadiths = haditshRes.rows
  const selected = selectedId ? companions.find(c => c.id === selectedId) : null

  const MIN_YEAR_OPTIONS = [
    { value: 50, label: '50+ هـ' },
    { value: 60, label: '60+ هـ' },
    { value: 70, label: '70+ هـ' },
    { value: 80, label: '80+ هـ' },
    { value: 90, label: '90+ هـ' },
  ]

  const LIMIT_OPTIONS = [20, 30, 50]

  function judgmentColor(j: string | null) {
    if (!j) return 'text-gray-400'
    if (/صحيح/.test(j)) return 'text-green-700'
    if (/حسن/.test(j)) return 'text-blue-600'
    if (/ضعيف/.test(j)) return 'text-red-500'
    return 'text-gray-500'
  }

  const maxHadiths = Math.max(...companions.map(c => c.hadith_count), 1)

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">آخر الصحابة وفاةً — الذين أدركهم التابعون المتأخرون</h1>
        <p className="text-sm text-gray-500">
          الصحابة الذين أطال الله أعمارهم وأدركهم التابعون المتأخرون — من أهم جسور نقل السنة إذ تلقَّى عنهم التابعون في مناطق متفرقة
        </p>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <span className="text-xs text-gray-500">متوفَّى بعد:</span>
        {MIN_YEAR_OPTIONS.map(opt => (
          <a key={opt.value}
            href={`/narrators/companion-last?minYear=${opt.value}&limit=${limit}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${minYear === opt.value ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'}`}>
            {opt.label}
          </a>
        ))}
        <span className="text-gray-200">|</span>
        {LIMIT_OPTIONS.map(l => (
          <a key={l}
            href={`/narrators/companion-last?minYear=${minYear}&limit=${l}`}
            className={`text-xs px-2.5 py-1 rounded-full border ${limit === l ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-gray-600 border-gray-200'}`}>
            {l}
          </a>
        ))}
      </div>

      <div className="grid sm:grid-cols-5 gap-4">
        <div className="sm:col-span-3">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-amber-50 px-4 py-2 border-b border-amber-100 text-xs text-amber-800 font-medium flex justify-between">
              <span>الصحابة المتأخرون الوفاة — مرتَّبون بسنة الوفاة (من الأحدث)</span>
            </div>
            <div className="divide-y divide-gray-50 max-h-[72vh] overflow-y-auto">
              {companions.map((c, i) => {
                const isSelected = selectedId === c.id
                const barW = Math.round((c.hadith_count / maxHadiths) * 100)
                return (
                  <a key={c.id}
                    href={`/narrators/companion-last?id=${c.id}&minYear=${minYear}&limit=${limit}`}
                    className={`px-4 py-3 flex items-start gap-3 hover:bg-amber-50 transition-colors ${isSelected ? 'bg-amber-50' : ''}`}>
                    <span className="text-xs text-gray-300 w-5 shrink-0 mt-0.5">{(i + 1).toLocaleString('ar-EG')}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-sm font-medium ${isSelected ? 'text-amber-900' : 'text-amber-800'} hover:underline`}>
                          {c.abb_name || c.name.split(' ').slice(0, 3).join(' ')}
                        </span>
                        {c.city && <span className="text-xs text-gray-400">{c.city.split(',')[0]}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-24">
                          <div className="bg-amber-400 h-1.5 rounded-full" style={{ width: `${barW}%` }} />
                        </div>
                        <span className="text-xs text-green-700">{c.hadith_count} حديث</span>
                        <span className="text-xs text-blue-600">{c.unique_books} كتاب</span>
                        <span className="text-xs text-gray-400">{c.unique_students} تلميذ</span>
                      </div>
                    </div>
                    <div className="text-xs text-amber-700 shrink-0 font-medium">
                      ت {c.death_year_num?.toLocaleString('ar-EG')} هـ
                    </div>
                  </a>
                )
              })}
              {companions.length === 0 && (
                <div className="p-8 text-center text-sm text-gray-400">لا توجد بيانات</div>
              )}
            </div>
          </div>
        </div>

        <div className="sm:col-span-2">
          {selected && hadiths.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden sticky top-20">
              <div className="bg-amber-50 px-4 py-3 border-b border-amber-100">
                <h2 className="font-bold text-amber-900 text-sm">
                  {selected.abb_name || selected.name}
                </h2>
                <div className="flex gap-2 text-xs text-amber-700 mt-1 flex-wrap">
                  <span>توفي {selected.death_year_num?.toLocaleString('ar-EG')} هـ</span>
                  {selected.city && <span>{selected.city.split(',')[0]}</span>}
                  <span>{selected.hadith_count} حديث</span>
                </div>
                <Link href={`/narrator/${selected.id}`} className="text-xs text-green-700 hover:underline mt-1 block">
                  ← الترجمة الكاملة
                </Link>
              </div>
              <div className="divide-y divide-gray-50 max-h-[55vh] overflow-y-auto">
                {hadiths.map(h => (
                  <div key={h.hadith_id} className="px-3 py-3">
                    <div className="flex items-center gap-2 mb-1 text-xs">
                      <span className="text-gray-500">{h.book_name}</span>
                      {h.judgment_text && (
                        <span className={`${judgmentColor(h.judgment_text)}`}>{h.judgment_text.slice(0, 15)}</span>
                      )}
                      <span className="text-gray-300 mr-auto">{h.chain_count} سند</span>
                    </div>
                    <p className="text-xs text-gray-800 leading-relaxed mb-1">{h.hadith_text}...</p>
                    <Link href={`/hadith/${h.hadith_id}`} className="text-xs text-green-700 hover:underline">←</Link>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 rounded-xl border border-amber-100 p-6 text-center">
              <UiIcon name="moon" size={30} className="text-[#b28a43] mb-2" />
              <div className="font-semibold text-amber-900 text-sm mb-2">آخر الصحابة وفاةً</div>
              <p className="text-xs text-amber-700 leading-relaxed">
                اختر صحابياً لعرض أحاديثه — هؤلاء كانت بقاؤهم نعمةً كبرى إذ أدركهم التابعون في مناطق شتى ونقلوا عنهم مباشرةً
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators/tabiin-ranking" className="text-green-700 hover:underline">← ترتيب التابعين</Link>
        <Link href="/narrators/generation-bridge" className="text-green-700 hover:underline">← جسور الأجيال</Link>
        <Link href="/narrators/sahabi-students" className="text-green-700 hover:underline">← تلاميذ الصحابة</Link>
      </div>
    </div>
  )
}
