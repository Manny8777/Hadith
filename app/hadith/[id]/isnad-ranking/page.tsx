import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface ChainRow {
  chain_id: number
  chain_length: number
  narrator_ids: number[]
  narrator_names: string[]
  narrator_grades: (string | null)[]
  is_companions: boolean[]
  death_years: (number | null)[]
}

// Score each narrator grade numerically for ranking purposes
function gradeScore(g: string | null, isCompanion: boolean): number {
  if (isCompanion) return 15
  if (!g) return -5
  if (/ثقة ثبت|ثقة حجة|متفق على توثيقه/.test(g)) return 12
  if (/ثقة/.test(g)) return 10
  if (/صدوق يخطئ|صدوق له أوهام/.test(g)) return 2
  if (/صدوق/.test(g)) return 5
  if (/مقبول|لا بأس به/.test(g)) return 4
  if (/ضعيف جداً|شديد الضعف|متروك|وضّاع|كذاب|موضوع/.test(g)) return -20
  if (/ضعيف/.test(g)) return -10
  if (/منكر/.test(g)) return -12
  if (/مجهول/.test(g)) return -8
  return 0
}

function gradeLabel(g: string | null, isCompanion: boolean): string {
  if (isCompanion) return 'صحابي'
  if (!g) return 'غير مقيَّم'
  return g
}

function gradeBadge(g: string | null, isCompanion: boolean): string {
  if (isCompanion) return 'bg-amber-100 text-amber-800'
  if (!g) return 'bg-gray-100 text-gray-500'
  if (/ثقة/.test(g)) return 'bg-green-100 text-green-700'
  if (/صدوق|مقبول|لا بأس/.test(g)) return 'bg-blue-100 text-blue-700'
  if (/ضعيف|منكر|متروك|كذاب|مجهول/.test(g)) return 'bg-red-100 text-red-700'
  return 'bg-gray-100 text-gray-600'
}

function chainStrength(scores: number[], length: number): number {
  const narratorSum = scores.reduce((a, b) => a + b, 0)
  const lengthPenalty = Math.max(0, (length - 4)) * 2
  return Math.round(narratorSum - lengthPenalty)
}

function strengthLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'صحيح', color: 'bg-green-100 text-green-800 border-green-200' }
  if (score >= 55) return { label: 'حسن', color: 'bg-blue-100 text-blue-800 border-blue-200' }
  if (score >= 30) return { label: 'مقبول', color: 'bg-amber-100 text-amber-800 border-amber-200' }
  if (score >= 0)  return { label: 'ضعيف', color: 'bg-orange-100 text-orange-800 border-orange-200' }
  return { label: 'شديد الضعف', color: 'bg-red-100 text-red-800 border-red-200' }
}

export default async function IsnadRankingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const hadithId = parseInt(id)
  if (isNaN(hadithId)) notFound()

  const hadithRes = await pool.query(
    `SELECT ht.main_id,
            regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g') AS tarf,
            b.title AS book_title, b.takhrij_author
     FROM hadith_toc ht
     JOIN books b ON b.id = ht.book_id
     WHERE ht.main_id = $1 AND ht.is_leaf = true
     LIMIT 1`,
    [hadithId]
  )
  const hadith = hadithRes.rows[0]
  if (!hadith) notFound()

  // Get all chains with their full narrator details
  const chainsRes = await pool.query<ChainRow>(
    `SELECT ic.id AS chain_id,
            array_length(ic.narrator_id_array, 1) AS chain_length,
            ic.narrator_id_array AS narrator_ids,
            ARRAY(
              SELECT n.name FROM unnest(ic.narrator_id_array) AS nar_id
              JOIN narrators n ON n.id = nar_id
            ) AS narrator_names,
            ARRAY(
              SELECT n.martaba_ibn_hajar FROM unnest(ic.narrator_id_array) AS nar_id
              JOIN narrators n ON n.id = nar_id
            ) AS narrator_grades,
            ARRAY(
              SELECT n.is_companion FROM unnest(ic.narrator_id_array) AS nar_id
              JOIN narrators n ON n.id = nar_id
            ) AS is_companions,
            ARRAY(
              SELECT n.death_year_num FROM unnest(ic.narrator_id_array) AS nar_id
              JOIN narrators n ON n.id = nar_id
            ) AS death_years
     FROM isnad_hadiths ih
     JOIN isnad_chains ic ON ic.id = ih.isnad_id
     WHERE ih.hadith_id = $1
     ORDER BY array_length(ic.narrator_id_array, 1) ASC
     LIMIT 30`,
    [hadithId]
  ).catch(() => ({ rows: [] as ChainRow[] }))

  const chains = chainsRes.rows

  if (chains.length === 0) {
    return (
      <div dir="rtl">
        <Link href={`/hadith/${hadithId}`} className="text-sm text-gray-500 hover:text-green-700">← الحديث</Link>
        <h1 className="text-xl font-bold text-green-900 mt-3 mb-3">ترتيب الأسانيد</h1>
        <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">لا توجد أسانيد لهذا الحديث</div>
      </div>
    )
  }

  // Compute scores for each chain
  const rankedChains = chains.map(chain => {
    const scores = (chain.narrator_ids || []).map((_, i) =>
      gradeScore(
        chain.narrator_grades?.[i] ?? null,
        chain.is_companions?.[i] ?? false
      )
    )
    const totalScore = chainStrength(scores, chain.chain_length)
    const worstNarrator = Math.min(...scores)
    const hasDaif = scores.some(s => s < 0)
    const hasUnknown = scores.some((s, i) => !chain.narrator_grades?.[i] && !chain.is_companions?.[i])
    return { ...chain, scores, totalScore, worstNarrator, hasDaif, hasUnknown }
  }).sort((a, b) => b.totalScore - a.totalScore)

  const bestChain = rankedChains[0]
  const bestStrength = strengthLabel(bestChain?.totalScore || 0)

  return (
    <div dir="rtl">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4 flex-wrap">
        <Link href={`/hadith/${hadithId}`} className="hover:text-green-700">← الحديث {hadithId}</Link>
        <span>›</span>
        <span className="text-gray-700">ترتيب الأسانيد</span>
      </div>

      <h1 className="text-xl font-bold text-green-900 mb-1">ترتيب الأسانيد قوةً وضعفاً</h1>
      <p className="text-sm text-gray-500 line-clamp-2 mb-4">
        {(hadith.tarf as string || '').slice(0, 120)} — {hadith.book_title}
      </p>

      <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4 text-xs text-amber-800">
        <span className="font-semibold">منهجية التقييم: </span>
        يُحسب ترتيب الإسناد من مجموع درجات رواته استناداً إلى طبقات ابن حجر — ثقة (+10)، صدوق (+5)، لا بأس به (+4)،
        ضعيف (-10)، متروك/كذاب (-20)، غير مقيَّم (-5) — مع خصم تدريجي لزيادة عدد الحلقات.
        هذا التقييم مؤشر مساعد لا يُغني عن الدراسة التفصيلية.
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <div className="bg-green-800 text-white rounded-xl p-3 text-center">
          <div className="text-xl font-bold">{chains.length}</div>
          <div className="text-xs opacity-80">إسناد مُرتَّب</div>
        </div>
        <div className={`${bestStrength.color} border rounded-xl p-3 text-center`}>
          <div className="text-xl font-bold">{bestStrength.label}</div>
          <div className="text-xs opacity-70">أفضل إسناد (نظرياً)</div>
        </div>
        <div className="bg-gray-100 text-gray-700 rounded-xl p-3 text-center">
          <div className="text-xl font-bold">{rankedChains.filter(c => !c.hasDaif).length}</div>
          <div className="text-xs opacity-70">إسناد خالٍ من المجروحين</div>
        </div>
      </div>

      <div className="space-y-4">
        {rankedChains.map((chain, rank) => {
          const { label, color } = strengthLabel(chain.totalScore)
          return (
            <div key={chain.chain_id}
              className={`rounded-xl border p-4 ${
                rank === 0 ? 'border-green-300 bg-green-50' :
                chain.hasDaif ? 'border-red-100 bg-red-50' :
                'border-gray-100 bg-white hover:border-gray-200'
              }`}>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 font-mono">#{rank + 1}</span>
                  {rank === 0 && (
                    <span className="text-xs bg-green-700 text-white px-2 py-0.5 rounded-full font-bold">
                      أقوى إسناد
                    </span>
                  )}
                  <span className={`text-xs border px-2 py-0.5 rounded-full font-medium ${color}`}>
                    {label}
                  </span>
                  {chain.hasUnknown && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                      فيه مجهول الحال
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-500">
                    {chain.chain_length} رواة
                  </span>
                  <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">
                    نقاط: {chain.totalScore}
                  </span>
                  <Link href={`/narrator/${chain.narrator_ids?.[0]}`}
                    className="text-xs text-indigo-600 hover:underline">
                    الإسناد ←
                  </Link>
                </div>
              </div>

              {/* Narrator chain with scores */}
              <div className="flex items-center gap-1 flex-wrap">
                {(chain.narrator_ids || []).map((narId, i) => {
                  const score = chain.scores[i]
                  const badge = gradeBadge(chain.narrator_grades?.[i] ?? null, chain.is_companions?.[i] ?? false)
                  const isWorst = score === chain.worstNarrator && score < 0 && (chain.narrator_ids || []).length > 1
                  return (
                    <div key={narId} className="flex items-center gap-1">
                      <Link href={`/narrator/${narId}`}
                        className={`text-xs px-2 py-1 rounded-lg border transition-colors hover:shadow-sm ${badge} ${
                          isWorst ? 'ring-2 ring-red-400' : ''
                        }`}
                        title={gradeLabel(chain.narrator_grades?.[i] ?? null, chain.is_companions?.[i] ?? false)}>
                        {chain.narrator_names?.[i]?.split('،')[0]?.trim()?.split(' ').slice(0, 2).join(' ') || '—'}
                        <span className="opacity-60 text-xs mr-1">({score > 0 ? '+' : ''}{score})</span>
                      </Link>
                      {i < (chain.narrator_ids?.length || 0) - 1 && (
                        <span className="text-gray-300 text-xs">←</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href={`/hadith/${hadithId}`} className="text-green-700 hover:underline">← الحديث</Link>
        <Link href={`/hadith/${hadithId}/all-narrators`} className="text-green-700 hover:underline">← كل الرواة</Link>
        <Link href={`/hadith/${hadithId}/pivot`} className="text-green-700 hover:underline">← مدار الحديث</Link>
        <Link href={`/hadith/${hadithId}/chain-analysis`} className="text-green-700 hover:underline">← تحليل الإسناد</Link>
      </div>
    </div>
  )
}
