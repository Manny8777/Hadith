import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface ChainNarrator {
  id: number
  name: string
  abb_name: string | null
  death_year_num: number | null
  martaba_ibn_hajar: string | null
  tabaqa: string | null
  is_companion: boolean
  ord: number
}

interface ChainOption {
  chain_id: number
  length: number
}

function gradeColor(g: string | null) {
  if (!g) return 'border-gray-300 bg-gray-50 text-gray-600'
  if (g.includes('ثق') || g.includes('حافظ')) return 'border-green-400 bg-green-50 text-green-800'
  if (g.includes('صدوق') || g.includes('لا بأس') || g.includes('حسن')) return 'border-amber-400 bg-amber-50 text-amber-800'
  if (g.includes('ضعيف') || g.includes('متروك') || g.includes('منكر')) return 'border-red-400 bg-red-50 text-red-700'
  if (g.includes('مجهول')) return 'border-gray-400 bg-gray-50 text-gray-600'
  return 'border-blue-300 bg-blue-50 text-blue-700'
}

function dotColor(g: string | null, isComp: boolean) {
  if (isComp) return 'bg-amber-500'
  if (!g) return 'bg-gray-300'
  if (g.includes('ثق') || g.includes('حافظ')) return 'bg-green-500'
  if (g.includes('صدوق') || g.includes('لا بأس') || g.includes('حسن')) return 'bg-amber-500'
  if (g.includes('ضعيف') || g.includes('متروك') || g.includes('منكر')) return 'bg-red-500'
  return 'bg-gray-400'
}

export default async function ChainAnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ chain?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const hadithId = parseInt(id)
  if (isNaN(hadithId)) notFound()

  const selectedChain = sp.chain ? parseInt(sp.chain) : null

  // Get list of all chains for this hadith
  const chainsListRes = await pool.query<{ chain_id: number; chain_length: number }>(
    `SELECT ic.id AS chain_id, array_length(ic.narrator_id_array, 1) AS chain_length
     FROM isnad_hadiths ih
     JOIN isnad_chains ic ON ic.id = ih.isnad_id
     WHERE ih.hadith_id = $1
     ORDER BY array_length(ic.narrator_id_array, 1) ASC
     LIMIT 30`,
    [hadithId]
  ).catch(() => ({ rows: [] as { chain_id: number; chain_length: number }[] }))

  const allChains = chainsListRes.rows
  if (allChains.length === 0) notFound()

  const chainId = selectedChain || allChains[0].chain_id

  // Get hadith info
  const [hadithRes, chainRes] = await Promise.all([
    pool.query(
      `SELECT ht.main_id, regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g') AS tarf,
              b.title AS book_title, b.takhrij_author
       FROM hadith_toc ht
       JOIN books b ON b.id = ht.book_id
       WHERE ht.main_id = $1`,
      [hadithId]
    ),

    pool.query<ChainNarrator>(
      `SELECT n.id, n.name, n.abb_name, n.death_year_num,
              n.martaba_ibn_hajar, n.tabaqa, n.is_companion, pos.ord::int AS ord
       FROM isnad_chains ic
       JOIN LATERAL unnest(ic.narrator_id_array) WITH ORDINALITY AS pos(nar_id, ord) ON true
       JOIN narrators n ON n.id = pos.nar_id
       WHERE ic.id = $1
       ORDER BY pos.ord`,
      [chainId]
    ).catch(() => ({ rows: [] as ChainNarrator[] })),
  ])

  const hadith = hadithRes.rows[0]
  if (!hadith) notFound()

  const narrators = chainRes.rows

  // Compute temporal gaps
  interface GapInfo { gap: number | null; suspicious: boolean }
  const gaps: GapInfo[] = narrators.map((n, i) => {
    if (i === 0) return { gap: null, suspicious: false }
    const prev = narrators[i - 1]
    if (!n.death_year_num || !prev.death_year_num) return { gap: null, suspicious: false }
    const gap = n.death_year_num - prev.death_year_num
    return { gap, suspicious: gap > 80 }
  })

  // Timeline min/max years
  const years = narrators.map(n => n.death_year_num).filter(Boolean) as number[]
  const minYear = years.length > 0 ? Math.min(...years) : 0
  const maxYear = years.length > 0 ? Math.max(...years) : 0
  const yearRange = maxYear - minYear || 1

  return (
    <div dir="rtl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4 flex-wrap">
        <Link href="/books" className="hover:text-green-700">الكتب</Link>
        <span>›</span>
        <Link href={`/hadith/${hadithId}`} className="hover:text-green-700">الحديث {hadithId}</Link>
        <span>›</span>
        <span className="text-gray-700">تحليل الإسناد</span>
      </div>

      <div className="mb-4">
        <h1 className="text-lg font-bold text-green-900 mb-1">تحليل زمني للإسناد</h1>
        <p className="text-sm text-gray-600 line-clamp-2">{hadith.tarf?.slice(0, 150)}</p>
        <p className="text-xs text-gray-400 mt-1">{hadith.book_title} — {hadith.takhrij_author}</p>
      </div>

      {/* Chain selector */}
      {allChains.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-100 p-3 mb-4">
          <p className="text-xs text-gray-500 mb-2">
            {allChains.length} إسناد لهذا الحديث — اختر إسناداً للتحليل:
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {allChains.map((c, i) => (
              <Link key={c.chain_id}
                href={`/hadith/${hadithId}/chain-analysis?chain=${c.chain_id}`}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  c.chain_id === chainId
                    ? 'bg-green-800 text-white border-green-800'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
                }`}>
                إسناد {(i + 1).toLocaleString('ar-EG')} ({c.chain_length} رواة)
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Narrators vertical chain */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-5">
        <h2 className="text-sm font-bold text-green-900 mb-4 flex items-center gap-2">
          <span>سلسلة الإسناد</span>
          <span className="text-xs font-normal text-gray-400">({narrators.length} راوٍ)</span>
          {minYear > 0 && maxYear > 0 && (
            <span className="text-xs font-normal text-gray-400">
              {minYear}هـ — {maxYear}هـ
            </span>
          )}
        </h2>

        <div className="relative">
          {/* Vertical line */}
          <div className="absolute right-5 top-6 bottom-6 w-0.5 bg-gray-200" />

          <div className="space-y-0">
            {narrators.map((n, i) => {
              const gapInfo = gaps[i]
              return (
                <div key={`${n.id}-${i}`}>
                  {/* Gap indicator */}
                  {gapInfo.gap !== null && (
                    <div className={`flex items-center gap-2 pr-14 py-1 ${gapInfo.suspicious ? 'text-red-600' : 'text-gray-400'}`}>
                      <div className={`text-xs ${gapInfo.suspicious ? 'font-semibold' : ''}`}>
                        {gapInfo.gap > 0
                          ? `↕ ${gapInfo.gap} سنة`
                          : gapInfo.gap < 0
                          ? `↕ تداخل زمني (${Math.abs(gapInfo.gap)} سنة)`
                          : '↕ نفس العصر'}
                      </div>
                      {gapInfo.suspicious && (
                        <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">
                          فجوة كبيرة — احتمال انقطاع
                        </span>
                      )}
                    </div>
                  )}

                  {/* Narrator card */}
                  <div className="flex items-start gap-3 relative">
                    {/* Dot on timeline */}
                    <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center shrink-0 relative z-10 ${
                      n.is_companion
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-gray-200 bg-white'
                    }`}>
                      <div className={`w-3 h-3 rounded-full ${dotColor(n.martaba_ibn_hajar, n.is_companion)}`} />
                    </div>

                    <div className={`flex-1 border rounded-xl p-3 mb-3 transition-all hover:shadow-sm ${gradeColor(n.martaba_ibn_hajar)}`}>
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex-1">
                          <Link href={`/narrator/${n.id}`}
                            className="font-semibold hover:underline text-sm">
                            {n.name}
                          </Link>
                          {n.abb_name && n.abb_name !== n.name && (
                            <span className="text-xs text-gray-500 mr-2">({n.abb_name})</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-wrap shrink-0">
                          {n.is_companion && (
                            <span className="text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-medium">صحابي</span>
                          )}
                          {n.martaba_ibn_hajar && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/70 border border-current opacity-80">
                              {n.martaba_ibn_hajar}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap text-xs opacity-70">
                        {n.tabaqa && <span>{n.tabaqa}</span>}
                        {n.death_year_num && <span>ت {n.death_year_num}هـ</span>}
                        {n.death_year_num && years.length > 1 && (
                          <span className="text-gray-400">
                            ({Math.round(((n.death_year_num - minYear) / yearRange) * 100)}% من النطاق الزمني)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Visual timeline */}
      {years.length >= 3 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 mb-5">
          <h2 className="text-sm font-bold text-green-900 mb-4">المخطط الزمني للإسناد</h2>
          <div className="relative h-16 bg-gray-50 rounded-lg overflow-hidden mb-2">
            {/* Timeline bar */}
            <div className="absolute inset-x-4 top-1/2 h-0.5 bg-gray-300 -translate-y-1/2" />
            {narrators.filter(n => n.death_year_num).map((n, i) => {
              const pct = ((n.death_year_num! - minYear) / yearRange) * 100
              return (
                <div
                  key={`tl-${n.id}-${i}`}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                  style={{ left: `calc(${pct}% * 0.9 + 5%)` }}
                  title={`${n.abb_name || n.name} — ت ${n.death_year_num}هـ`}>
                  <div className={`w-3 h-3 rounded-full border-2 border-white shadow-sm ${dotColor(n.martaba_ibn_hajar, n.is_companion)}`} />
                </div>
              )
            })}
          </div>
          <div className="flex justify-between text-xs text-gray-400 px-4">
            <span>{minYear}هـ</span>
            <span className="text-center text-gray-600 font-medium">
              المدة: {maxYear - minYear} سنة هجرية
            </span>
            <span>{maxYear}هـ</span>
          </div>

          {/* Gap summary */}
          {gaps.filter(g => g.suspicious).length > 0 && (
            <div className="mt-3 bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-800">
              <span className="font-semibold">تنبيه: </span>
              {gaps.filter(g => g.suspicious).length === 1
                ? 'فجوة زمنية واحدة كبيرة (أكثر من 80 سنة) قد تشير إلى انقطاع في الإسناد.'
                : `${gaps.filter(g => g.suspicious).length} فجوات زمنية كبيرة — قد تشير إلى انقطاعات متعددة في الإسناد.`}
            </div>
          )}
        </div>
      )}

      {/* Color legend */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 text-xs">
        <p className="font-semibold text-gray-700 mb-2">مفتاح الألوان:</p>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="text-gray-600">صحابي</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-gray-600">ثقة</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-amber-400" />
            <span className="text-gray-600">صدوق / لا بأس</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-gray-600">ضعيف / متروك</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-gray-300" />
            <span className="text-gray-600">غير محدد</span>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href={`/hadith/${hadithId}`} className="text-green-700 hover:underline">← الحديث</Link>
        <Link href={`/hadith/${hadithId}/transmission-history`} className="text-green-700 hover:underline">← تاريخ الانتشار</Link>
        <Link href="/hadiths/chain-gaps" className="text-green-700 hover:underline">← كاشف الانقطاع</Link>
      </div>
    </div>
  )
}
