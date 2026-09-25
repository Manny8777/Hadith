import Link from 'next/link'
import pool from '@/lib/db'
import CompareSearch from './CompareSearch'

export const dynamic = 'force-dynamic'

interface Narrator {
  id: number
  name: string
  abb_name: string | null
  kunia: string | null
  laqab: string | null
  tabaqa: string | null
  tabaqa_num: number | null
  birth_year: string | null
  death_year: string | null
  death_year_num: number | null
  birth_city: string | null
  death_city: string | null
  martaba_ibn_hajar: string | null
  martaba_zahabi: string | null
  is_companion: boolean
  hadiths_count: number | null
}

interface Criticism { scientist_name: string; texts: string[] }

function gradeColor(grade: string | null) {
  if (!grade) return 'bg-gray-50 text-gray-600 border-gray-200'
  if (/ثقة|ثبت|حجة|عدل|صحابي/.test(grade)) return 'bg-green-50 text-green-800 border-green-300'
  if (/صدوق|مقبول|لا بأس/.test(grade)) return 'bg-amber-50 text-amber-800 border-amber-300'
  if (/ضعيف|منكر|متروك|كذاب/.test(grade)) return 'bg-red-50 text-red-700 border-red-300'
  return 'bg-gray-50 text-gray-600 border-gray-200'
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null
  return (
    <div className="flex gap-2 text-sm py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-gray-400 min-w-20 shrink-0">{label}</span>
      <span className="text-gray-800">{value}</span>
    </div>
  )
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>
}) {
  const sp = await searchParams
  const idA = sp.a ? parseInt(sp.a) : null
  const idB = sp.b ? parseInt(sp.b) : null

  let narratorA: Narrator | null = null
  let narratorB: Narrator | null = null
  let criticismA: Criticism[] = []
  let criticismB: Criticism[] = []
  let relation: { direction: string; is_sheikh: boolean } | null = null

  if (idA && !isNaN(idA)) {
    const [res, critRes] = await Promise.all([
      pool.query<Narrator>(
        `SELECT id, name, abb_name, kunia, laqab, tabaqa, tabaqa_num,
                birth_year, death_year, death_year_num, birth_city, death_city,
                martaba_ibn_hajar, martaba_zahabi, is_companion, hadiths_count
         FROM narrators WHERE id = $1`, [idA]
      ),
      pool.query<{ scientist_name: string; say_text: string; say_sort: number }>(
        `SELECT scientist_name, say_text, say_sort FROM narrator_criticism
         WHERE narrator_id = $1 ORDER BY scientist_noun_id, say_sort LIMIT 50`, [idA]
      ),
    ])
    narratorA = res.rows[0] || null
    const mapA: Record<string, Criticism> = {}
    for (const r of critRes.rows) {
      if (!mapA[r.scientist_name]) mapA[r.scientist_name] = { scientist_name: r.scientist_name, texts: [] }
      if (r.say_text) mapA[r.scientist_name].texts.push(r.say_text)
    }
    criticismA = Object.values(mapA)
  }

  if (idB && !isNaN(idB)) {
    const [res, critRes] = await Promise.all([
      pool.query<Narrator>(
        `SELECT id, name, abb_name, kunia, laqab, tabaqa, tabaqa_num,
                birth_year, death_year, death_year_num, birth_city, death_city,
                martaba_ibn_hajar, martaba_zahabi, is_companion, hadiths_count
         FROM narrators WHERE id = $1`, [idB]
      ),
      pool.query<{ scientist_name: string; say_text: string; say_sort: number }>(
        `SELECT scientist_name, say_text, say_sort FROM narrator_criticism
         WHERE narrator_id = $1 ORDER BY scientist_noun_id, say_sort LIMIT 50`, [idB]
      ),
    ])
    narratorB = res.rows[0] || null
    const mapB: Record<string, Criticism> = {}
    for (const r of critRes.rows) {
      if (!mapB[r.scientist_name]) mapB[r.scientist_name] = { scientist_name: r.scientist_name, texts: [] }
      if (r.say_text) mapB[r.scientist_name].texts.push(r.say_text)
    }
    criticismB = Object.values(mapB)
  }

  // Find shared hadiths (hadiths where both narrators appear in the same isnad chain)
  let sharedHadiths: Array<{ main_id: number; book_id: number; tarf: string | null; book_name: string }> = []
  let sharedTotal = 0
  let sampleChain: Array<{ id: number; name: string; abb_name: string | null; martaba_ibn_hajar: string | null; is_companion: boolean }> = []
  if (idA && idB && narratorA && narratorB) {
    const [sharedRes, sharedCnt, sampleChainRes] = await Promise.all([
      pool.query(
        `SELECT DISTINCT ht.main_id, ht.book_id, ht.tarf, b.title as book_name
         FROM isnad_hadiths iha
         JOIN isnad_chains ic ON iha.isnad_id = ic.id
         JOIN hadith_toc ht ON iha.hadith_id = ht.main_id
         JOIN books b ON b.id = ht.book_id
         WHERE ic.narrator_id_array @> ARRAY[$1::integer, $2::integer]
         ORDER BY ht.book_id, ht.main_id
         LIMIT 10`,
        [idA, idB]
      ),
      pool.query(
        `SELECT COUNT(DISTINCT ht.main_id) as cnt
         FROM isnad_hadiths iha
         JOIN isnad_chains ic ON iha.isnad_id = ic.id
         JOIN hadith_toc ht ON iha.hadith_id = ht.main_id
         WHERE ic.narrator_id_array @> ARRAY[$1::integer, $2::integer]`,
        [idA, idB]
      ),
      // Sample chain containing both narrators
      pool.query<{ narrator_id_array: number[] }>(
        `SELECT narrator_id_array
         FROM isnad_chains
         WHERE narrator_id_array @> ARRAY[$1::integer, $2::integer]
         LIMIT 1`,
        [idA, idB]
      ),
    ])
    sharedHadiths = sharedRes.rows
    sharedTotal = parseInt(sharedCnt.rows[0]?.cnt || '0')

    // Resolve narrator IDs in sample chain to names
    if (sampleChainRes.rows[0]?.narrator_id_array) {
      const chainIds = sampleChainRes.rows[0].narrator_id_array
      const narRes = await pool.query<{ id: number; name: string; abb_name: string | null; martaba_ibn_hajar: string | null; is_companion: boolean }>(
        `SELECT id, name, abb_name, martaba_ibn_hajar, is_companion FROM narrators WHERE id = ANY($1)`,
        [chainIds]
      )
      const narMap: Record<number, typeof narRes.rows[0]> = {}
      narRes.rows.forEach(n => { narMap[n.id] = n })
      sampleChain = chainIds.map(nid => narMap[nid] || { id: nid, name: `[${nid}]`, abb_name: null, martaba_ibn_hajar: null, is_companion: false })
    }
  }

  // Check if they have a direct teacher-student relationship
  if (idA && idB && narratorA && narratorB) {
    const relRes = await pool.query(
      `SELECT is_sheikh FROM narrator_relations
       WHERE (first_id = $1 AND second_id = $2) OR (first_id = $2 AND second_id = $1)
       LIMIT 1`,
      [idA, idB]
    )
    if (relRes.rows.length > 0) {
      const r = relRes.rows[0]
      // is_sheikh=true means second_id is the sheikh (teacher)
      if (r.is_sheikh) {
        // Determine direction
        const isATeacher = await pool.query(
          `SELECT 1 FROM narrator_relations WHERE first_id = $1 AND second_id = $2 AND is_sheikh = true LIMIT 1`,
          [idB, idA]
        )
        if (isATeacher.rows.length > 0) {
          relation = { direction: `${narratorA.abb_name || narratorA.name} يروي عن ${narratorB.abb_name || narratorB.name}`, is_sheikh: true }
        } else {
          relation = { direction: `${narratorB.abb_name || narratorB.name} يروي عن ${narratorA.abb_name || narratorA.name}`, is_sheikh: true }
        }
      }
    }
  }

  const NarratorCard = ({ n, criticism }: { n: Narrator; criticism: Criticism[] }) => (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
      <div>
        <div className="flex items-start gap-2 flex-wrap mb-2">
          {n.is_companion && (
            <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shrink-0">صحابي</span>
          )}
          <Link href={`/narrator/${n.id}`} className="text-lg font-bold text-green-900 hover:underline leading-snug">
            {n.name}
          </Link>
        </div>

        {/* Grade badges */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {n.martaba_ibn_hajar && (
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${gradeColor(n.martaba_ibn_hajar)}`}>
              ابن حجر: {n.martaba_ibn_hajar}
            </span>
          )}
          {n.martaba_zahabi && (
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${gradeColor(n.martaba_zahabi)}`}>
              الذهبي: {n.martaba_zahabi}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="border-t border-gray-100 pt-3 space-y-0">
          <InfoRow label="الكنية" value={n.kunia} />
          <InfoRow label="اللقب" value={n.laqab} />
          <InfoRow label="الطبقة" value={n.tabaqa} />
          <InfoRow label="الوفاة" value={n.death_year} />
          <InfoRow label="بلد الوفاة" value={n.death_city} />
          {n.hadiths_count != null && (
            <div className="flex gap-2 text-sm py-1.5">
              <span className="text-gray-400 min-w-20 shrink-0">الأحاديث</span>
              <span className="text-green-800 font-bold">{n.hadiths_count.toLocaleString('ar-EG')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Criticism */}
      {criticism.length > 0 && (
        <details>
          <summary className="text-sm font-semibold text-red-700 cursor-pointer hover:text-red-600 list-none flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full inline-block"></span>
            جرح وتعديل ({criticism.length} عالم)
          </summary>
          <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
            {criticism.map((c, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-3 text-xs">
                <span className="font-bold text-amber-800 block mb-1">{c.scientist_name}</span>
                {c.texts.map((t, j) => <p key={j} className="text-gray-700 leading-6">{t}</p>)}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )

  return (
    <div dir="rtl" className="min-h-screen bg-amber-50">
      <header className="bg-green-900 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/narrators" className="text-amber-200 hover:text-white text-sm">← الرواة</Link>
          <h1 className="text-lg font-bold text-amber-100">مقارنة الرواة</h1>
          <Link href="/" className="text-amber-200 hover:text-white text-sm">الرئيسية</Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Search selectors */}
        <CompareSearch initialA={sp.a || ''} initialB={sp.b || ''} />

        {/* Relation badge */}
        {relation && (
          <div className="bg-green-900 text-white rounded-xl px-6 py-3 text-center text-sm font-medium">
            {relation.direction}
            <span className="text-amber-300 mr-2">(علاقة رواية مباشرة)</span>
          </div>
        )}

        {/* Comparison columns */}
        {narratorA || narratorB ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              {narratorA ? (
                <NarratorCard n={narratorA} criticism={criticismA} />
              ) : (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center text-gray-400">
                  اختر الراوي الأول
                </div>
              )}
            </div>
            <div>
              {narratorB ? (
                <NarratorCard n={narratorB} criticism={criticismB} />
              ) : (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center text-gray-400">
                  اختر الراوي الثاني
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center text-gray-400 py-16">
            ابحث عن راويين لمقارنتهما
          </div>
        )}

        {/* Shared hadiths */}
        {narratorA && narratorB && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="text-base font-bold text-green-900 mb-4 flex items-center gap-2">
              <span className="w-1 h-5 bg-blue-500 rounded-full inline-block"></span>
              الأحاديث المشتركة في السند
              {sharedTotal > 0 ? (
                <span className="text-sm text-gray-400 font-normal">
                  ({sharedTotal.toLocaleString('ar-EG')} حديث{sharedTotal > 10 ? ' — يُعرض أول ١٠' : ''})
                </span>
              ) : (
                <span className="text-sm text-gray-400 font-normal">(لا يوجد)</span>
              )}
            </h3>
            {sharedTotal > 0 && (
              <>
                <div className="space-y-2">
                  {sharedHadiths.map(h => (
                    <Link
                      key={h.main_id}
                      href={`/hadith/${h.main_id}`}
                      className="block bg-gray-50 rounded-xl border border-gray-100 px-4 py-3 hover:border-green-200 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-xs text-green-700 font-semibold shrink-0 mt-0.5">{h.book_name}</span>
                        <p className="text-sm text-gray-700 leading-relaxed line-clamp-2 flex-1">
                          {(h.tarf || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) || `حديث رقم ${h.main_id}`}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
                {sharedTotal > 0 && narratorA && narratorB && (
                  <div className="mt-4 text-center">
                    <Link
                      href={`/narrators/chain-filter?preset=${idA},${idB}`}
                      className="inline-block text-sm bg-teal-700 text-white px-5 py-2 rounded-lg hover:bg-teal-600 transition-colors"
                    >
                      تتبع الإسناد المشترك ({sharedTotal.toLocaleString('ar-EG')} حديث) ←
                    </Link>
                  </div>
                )}
              </>
            )}
            {sharedTotal === 0 && (
              <p className="text-gray-400 text-sm text-center py-4">
                لا توجد أحاديث يشتركان في سندها في قاعدة البيانات
              </p>
            )}
          </div>
        )}

        {/* Temporal / generational analysis */}
        {narratorA && narratorB && (narratorA.death_year_num || narratorB.death_year_num || narratorA.tabaqa_num || narratorB.tabaqa_num) && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="text-base font-bold text-green-900 mb-4 flex items-center gap-2">
              <span className="w-1 h-5 bg-amber-500 rounded-full inline-block"></span>
              التحليل الزمني والطبقي
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Tabaqa comparison */}
              {(narratorA.tabaqa_num != null || narratorB.tabaqa_num != null) && (
                <div className="bg-amber-50 rounded-xl border border-amber-100 p-4">
                  <p className="text-xs font-semibold text-amber-700 mb-2">الطبقة</p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0"></span>
                      <span className="text-gray-600">{narratorA.abb_name || narratorA.name}:</span>
                      <span className="font-medium">{narratorA.tabaqa || `طبقة ${narratorA.tabaqa_num}`}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0"></span>
                      <span className="text-gray-600">{narratorB.abb_name || narratorB.name}:</span>
                      <span className="font-medium">{narratorB.tabaqa || `طبقة ${narratorB.tabaqa_num}`}</span>
                    </div>
                    {narratorA.tabaqa_num != null && narratorB.tabaqa_num != null && (
                      <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-amber-100">
                        {Math.abs(narratorA.tabaqa_num - narratorB.tabaqa_num) === 0
                          ? 'في نفس الطبقة'
                          : `فارق ${Math.abs(narratorA.tabaqa_num - narratorB.tabaqa_num)} طبقة`}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {/* Death year comparison */}
              {(narratorA.death_year_num || narratorB.death_year_num) && (
                <div className="bg-green-50 rounded-xl border border-green-100 p-4">
                  <p className="text-xs font-semibold text-green-700 mb-2">سنة الوفاة</p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0"></span>
                      <span className="text-gray-600">{narratorA.abb_name || narratorA.name}:</span>
                      <span className="font-medium">{narratorA.death_year || (narratorA.death_year_num ? `${narratorA.death_year_num} هـ` : '—')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0"></span>
                      <span className="text-gray-600">{narratorB.abb_name || narratorB.name}:</span>
                      <span className="font-medium">{narratorB.death_year || (narratorB.death_year_num ? `${narratorB.death_year_num} هـ` : '—')}</span>
                    </div>
                    {narratorA.death_year_num && narratorB.death_year_num && (
                      <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-green-100">
                        فارق زمني: {Math.abs(narratorA.death_year_num - narratorB.death_year_num)} سنة
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sample shared chain */}
        {narratorA && narratorB && sampleChain.length > 0 && (
          <div className="bg-white rounded-2xl border border-teal-100 p-6">
            <h3 className="text-base font-bold text-teal-900 mb-4 flex items-center gap-2">
              <span className="w-1 h-5 bg-teal-500 rounded-full inline-block"></span>
              نموذج مسار الرواية المشترك
              <span className="text-sm text-gray-400 font-normal">سند يجمع الراويين معاً</span>
            </h3>
            <div className="flex flex-wrap items-start gap-1.5 p-4 bg-teal-50 rounded-xl border border-teal-100">
              {sampleChain.map((n, i) => {
                const isA = n.id === idA
                const isB = n.id === idB
                let colorCls = 'bg-white border-gray-200 text-gray-700'
                if (isA) colorCls = 'bg-blue-100 border-blue-400 text-blue-900 font-bold ring-2 ring-blue-300'
                else if (isB) colorCls = 'bg-purple-100 border-purple-400 text-purple-900 font-bold ring-2 ring-purple-300'
                else if (n.martaba_ibn_hajar) {
                  if (/ثقة|ثبت|صحابي/.test(n.martaba_ibn_hajar)) colorCls = 'bg-green-50 border-green-200 text-green-800'
                  else if (/صدوق|مقبول/.test(n.martaba_ibn_hajar)) colorCls = 'bg-amber-50 border-amber-200 text-amber-800'
                  else if (/ضعيف|منكر|متروك/.test(n.martaba_ibn_hajar)) colorCls = 'bg-red-50 border-red-200 text-red-700'
                }
                return (
                  <span key={i} className="flex items-center gap-1">
                    <Link href={`/narrator/${n.id}`}
                      className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all hover:shadow-sm ${colorCls}`}
                      title={n.martaba_ibn_hajar || n.name}>
                      {n.is_companion && <span className="text-amber-500 text-xs ml-0.5">ص</span>}
                      {n.abb_name || n.name}
                    </Link>
                    {i < sampleChain.length - 1 && <span className="text-gray-300 text-sm">←</span>}
                  </span>
                )
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-blue-100 border border-blue-400 inline-block"></span>
                {narratorA?.abb_name || narratorA?.name}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-purple-100 border border-purple-400 inline-block"></span>
                {narratorB?.abb_name || narratorB?.name}
              </span>
              <span className="text-gray-400">
                {sampleChain.length} رواة في السند · ص = صحابي
              </span>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
