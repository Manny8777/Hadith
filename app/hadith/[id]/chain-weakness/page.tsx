import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface NarratorInChain {
  nar_id: number
  nar_name: string
  abb_name: string | null
  grade: string | null
  is_companion: boolean
  death_year: string | null
  city: string | null
  position: number
}

interface ChainRow {
  chain_id: number
  chain_length: number
  narrators: NarratorInChain[]
  book_name: string
  chapter_name: string | null
  judgment_text: string | null
}

function gradeStrength(grade: string | null, isCompanion: boolean): {
  level: 'gold' | 'thiqa' | 'saduq' | 'weak' | 'unknown'
  label: string
  color: string
  bgColor: string
  score: number
} {
  if (isCompanion) return { level: 'gold', label: 'صحابي', color: 'text-amber-900', bgColor: 'bg-amber-100 border-amber-300', score: 5 }
  if (!grade) return { level: 'unknown', label: 'غير مُقيَّم', color: 'text-gray-500', bgColor: 'bg-gray-100 border-gray-300', score: 1 }

  if (/ثقة ثبت|ثقة حافظ|إمام|حافظ/.test(grade)) return { level: 'gold', label: grade.slice(0, 20), color: 'text-green-900', bgColor: 'bg-green-100 border-green-300', score: 5 }
  if (/^ثقة/.test(grade)) return { level: 'thiqa', label: grade.slice(0, 20), color: 'text-green-700', bgColor: 'bg-green-50 border-green-200', score: 4 }
  if (/صدوق|لا بأس|شيخ|مقبول|محله الصدق/.test(grade)) return { level: 'saduq', label: grade.slice(0, 20), color: 'text-blue-700', bgColor: 'bg-blue-50 border-blue-200', score: 3 }
  if (/ضعيف الضبط|سيء الحفظ|يُعتبر|لين/.test(grade)) return { level: 'weak', label: grade.slice(0, 20), color: 'text-orange-700', bgColor: 'bg-orange-50 border-orange-200', score: 2 }
  if (/ضعيف|متروك|منكر|كذاب|موضوع|واهٍ|مجهول|ليس بثقة/.test(grade)) return { level: 'weak', label: grade.slice(0, 20), color: 'text-red-700', bgColor: 'bg-red-50 border-red-200', score: 1 }

  return { level: 'unknown', label: grade.slice(0, 20), color: 'text-gray-500', bgColor: 'bg-gray-100 border-gray-300', score: 2 }
}

export default async function ChainWeaknessPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const hadithId = parseInt(id)

  const [hadithRes, chainsRes] = await Promise.all([
    pool.query<{ text: string; book_name: string; chapter_name: string | null }>(
      `SELECT LEFT(ht.tarf, 400) AS text, b.title AS book_name, ht.chapter_text AS chapter_name
       FROM hadith_toc ht
       JOIN books b ON b.id = ht.book_id
       WHERE ht.main_id = $1`,
      [hadithId]
    ).catch(() => ({ rows: [] })),

    pool.query<{
      chain_id: number
      book_name: string
      chapter_name: string | null
      judgment_text: string | null
      chain_length: number
      nar_ids: number[]
      nar_names: string[]
      abb_names: (string | null)[]
      grades: (string | null)[]
      companions: boolean[]
      death_years: (string | null)[]
      cities: (string | null)[]
    }>(
      `SELECT
         ic.id AS chain_id,
         b.title AS book_name,
         ht.chapter_text AS chapter_name,
         (SELECT hj.say_text FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id LIMIT 1) AS judgment_text,
         array_length(ic.narrator_id_array, 1) AS chain_length,
         ARRAY(
           SELECT n.id FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
           JOIN narrators n ON n.id = nid ORDER BY ord
         ) AS nar_ids,
         ARRAY(
           SELECT n.name FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
           JOIN narrators n ON n.id = nid ORDER BY ord
         ) AS nar_names,
         ARRAY(
           SELECT n.abb_name FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
           JOIN narrators n ON n.id = nid ORDER BY ord
         ) AS abb_names,
         ARRAY(
           SELECT n.martaba_ibn_hajar FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
           JOIN narrators n ON n.id = nid ORDER BY ord
         ) AS grades,
         ARRAY(
           SELECT n.is_companion FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
           JOIN narrators n ON n.id = nid ORDER BY ord
         ) AS companions,
         ARRAY(
           SELECT n.death_year_num FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
           JOIN narrators n ON n.id = nid ORDER BY ord
         ) AS death_years,
         ARRAY(
           SELECT n.tabaqa FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
           JOIN narrators n ON n.id = nid ORDER BY ord
         ) AS cities
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id AND ih.hadith_id = $1
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       JOIN books b ON b.id = ht.book_id
       ORDER BY array_length(ic.narrator_id_array, 1) ASC
       LIMIT 20`,
      [hadithId]
    ).catch(() => ({ rows: [] })),
  ])

  const hadith = hadithRes.rows[0]
  const rawChains = chainsRes.rows

  // Transform chains
  const chains: ChainRow[] = rawChains.map(row => ({
    chain_id: row.chain_id,
    chain_length: row.chain_length,
    book_name: row.book_name,
    chapter_name: row.chapter_name,
    judgment_text: row.judgment_text,
    narrators: (row.nar_ids || []).map((id: number, i: number) => ({
      nar_id: id,
      nar_name: row.nar_names[i] || '',
      abb_name: row.abb_names[i] || null,
      grade: row.grades[i] || null,
      is_companion: row.companions[i] || false,
      death_year: row.death_years[i] || null,
      city: row.cities[i] || null,
      position: i + 1,
    })),
  }))

  // Compute chain strength scores
  function chainScore(narrators: NarratorInChain[]) {
    if (narrators.length === 0) return 0
    const scores = narrators.map(n => gradeStrength(n.grade, n.is_companion).score)
    return Math.min(...scores)
  }

  function chainStrengthLabel(score: number) {
    if (score >= 4) return { label: 'قوي — جميع الرواة موثَّقون', color: 'text-green-700 bg-green-50 border-green-200' }
    if (score === 3) return { label: 'وسط — فيه صدوق', color: 'text-blue-700 bg-blue-50 border-blue-200' }
    if (score === 2) return { label: 'فيه ضعف — ضعيف أو مجهول', color: 'text-orange-700 bg-orange-50 border-orange-200' }
    return { label: 'ضعيف — فيه ضعيف أو متروك', color: 'text-red-700 bg-red-50 border-red-200' }
  }

  return (
    <div dir="rtl">
      <div className="mb-4">
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
          <Link href={`/hadith/${hadithId}`} className="hover:text-green-700">الحديث</Link>
          <span>←</span>
          <span>تحليل الحلقات الضعيفة</span>
        </div>
        <h1 className="text-xl font-bold text-green-900 mb-1">تحليل الحلقات الضعيفة في الأسانيد</h1>
        {hadith && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-gray-900 leading-relaxed mb-2">
            {hadith.text}{hadith.text?.length === 400 && '...'}
          </div>
        )}
        <p className="text-xs text-gray-400">
          {hadith?.book_name}
          {hadith?.chapter_name && ` — ${hadith.chapter_name}`}
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-4 text-xs">
        <span className="px-2 py-1 rounded border bg-amber-100 border-amber-300 text-amber-900">صحابي</span>
        <span className="px-2 py-1 rounded border bg-green-100 border-green-300 text-green-900">ثقة ثبت</span>
        <span className="px-2 py-1 rounded border bg-green-50 border-green-200 text-green-700">ثقة</span>
        <span className="px-2 py-1 rounded border bg-blue-50 border-blue-200 text-blue-700">صدوق</span>
        <span className="px-2 py-1 rounded border bg-orange-50 border-orange-200 text-orange-700">لين</span>
        <span className="px-2 py-1 rounded border bg-red-50 border-red-200 text-red-700">ضعيف</span>
        <span className="px-2 py-1 rounded border bg-gray-100 border-gray-300 text-gray-500">غير مُقيَّم</span>
      </div>

      {/* Chain analyses */}
      <div className="space-y-4">
        {chains.map((chain, ci) => {
          const score = chainScore(chain.narrators)
          const strength = chainStrengthLabel(score)
          const weakNarrators = chain.narrators.filter(n =>
            !n.is_companion && gradeStrength(n.grade, n.is_companion).score <= 2
          )

          return (
            <div key={chain.chain_id}
              className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-3 flex-wrap">
                <span className="text-xs font-medium text-gray-700">
                  سند {(ci + 1).toLocaleString('ar-EG')} — {chain.book_name}
                </span>
                {chain.chapter_name && <span className="text-xs text-gray-400">{chain.chapter_name}</span>}
                <span className={`text-xs px-2 py-0.5 rounded-full border ${strength.color}`}>
                  {strength.label}
                </span>
                {chain.judgment_text && (
                  <span className="text-xs text-gray-400 mr-auto">{chain.judgment_text.slice(0, 50)}</span>
                )}
              </div>

              {/* Chain visualization */}
              <div className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-1">
                  {chain.narrators.map((n, ni) => {
                    const gs = gradeStrength(n.grade, n.is_companion)
                    return (
                      <div key={n.nar_id} className="flex items-center gap-1">
                        <Link href={`/narrator/${n.nar_id}`}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border ${gs.bgColor} ${gs.color} hover:opacity-80 transition-opacity cursor-pointer`}
                          title={`${n.nar_name}${n.death_year ? ` (ت ${n.death_year})` : ''}${n.grade ? ` — ${n.grade}` : ''}`}>
                          <div className="font-medium">{n.abb_name || n.nar_name.split(' ').slice(0, 2).join(' ')}</div>
                          {n.grade && (
                            <div className="text-xs opacity-60 truncate max-w-24">{gs.label}</div>
                          )}
                          {!n.grade && !n.is_companion && (
                            <div className="text-xs opacity-50">؟</div>
                          )}
                        </Link>
                        {ni < chain.narrators.length - 1 && (
                          <span className="text-gray-300 text-xs">←</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Weak narrators summary */}
              {weakNarrators.length > 0 && (
                <div className="px-4 pb-3">
                  <div className="bg-red-50 border border-red-100 rounded-lg p-2.5 text-xs">
                    <span className="font-medium text-red-800">الحلقات الضعيفة: </span>
                    {weakNarrators.map((n, i) => (
                      <span key={n.nar_id}>
                        <Link href={`/narrator/${n.nar_id}`} className="text-red-700 hover:underline">
                          {n.abb_name || n.nar_name}
                        </Link>
                        {n.grade && <span className="text-red-500"> ({n.grade.slice(0, 30)})</span>}
                        {i < weakNarrators.length - 1 && <span className="text-red-300"> · </span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {chains.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
          لا توجد أسانيد لهذا الحديث في قاعدة البيانات
        </div>
      )}

      {/* Overall summary */}
      {chains.length > 0 && (
        <div className="mt-4 bg-white rounded-xl border border-gray-100 p-4">
          <h2 className="font-bold text-green-900 text-sm mb-3">ملخص نقدي</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-green-50 rounded-lg p-2">
              <div className="font-bold text-green-800">
                {chains.filter(c => chainScore(c.narrators) >= 4).length}
              </div>
              <div className="text-xs text-gray-400">أسانيد قوية</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-2">
              <div className="font-bold text-blue-800">
                {chains.filter(c => chainScore(c.narrators) === 3).length}
              </div>
              <div className="text-xs text-gray-400">أسانيد وسط</div>
            </div>
            <div className="bg-orange-50 rounded-lg p-2">
              <div className="font-bold text-orange-800">
                {chains.filter(c => chainScore(c.narrators) === 2).length}
              </div>
              <div className="text-xs text-gray-400">فيها ضعف</div>
            </div>
            <div className="bg-red-50 rounded-lg p-2">
              <div className="font-bold text-red-800">
                {chains.filter(c => chainScore(c.narrators) <= 1).length}
              </div>
              <div className="text-xs text-gray-400">أسانيد ضعيفة</div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-4 text-sm flex-wrap">
        <Link href={`/hadith/${hadithId}`} className="text-green-700 hover:underline">← تفاصيل الحديث</Link>
        <Link href={`/hadith/${hadithId}/research-report`} className="text-blue-600 hover:underline">← التقرير البحثي</Link>
        <Link href={`/hadith/${hadithId}/isnad-ranking`} className="text-indigo-600 hover:underline">← ترتيب الأسانيد</Link>
      </div>
    </div>
  )
}
