import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import HadithNumber from '@/app/components/HadithNumber'

export const dynamic = 'force-dynamic'

interface HadithBasic {
  main_id: number
  tarf: string | null
  book_title: string
  takhrij_author: string | null
  tarqeem_harf: string | null
  tarqeem_matboa1: string | null
}

interface ParallelHadith {
  hadith_id: number
  book_id: number
  book_title: string
  takhrij_author: string | null
  takhrij_death: number | null
  tarqeem_harf: string | null
  tarqeem_matboa1: string | null
  grade_hint: string | null
}

interface ChainNarrator {
  hadith_id: number
  chain_id: number
  chain_length: number | null
  isnad_type: number | null
  pos: number
  narrator_id: number
  name: string
  abb_name: string | null
  is_companion: boolean
  martaba_ibn_hajar: string | null
  martaba_zahabi: string | null
  tabaqa: string | null
  death_year: string | null
}

function stripTags(html: string): string {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function narratorBadge(n: { martaba_ibn_hajar: string | null; is_companion: boolean }): string {
  if (n.is_companion) return 'bg-amber-100 text-amber-800 border-amber-300 font-semibold'
  const m = n.martaba_ibn_hajar
  if (!m) return 'bg-gray-100 text-gray-600 border-gray-200'
  if (/ثقة|ثبت|حجة|عدل/.test(m)) return 'bg-green-100 text-green-700 border-green-200'
  if (/صدوق|مقبول|لا بأس/.test(m)) return 'bg-amber-100 text-amber-700 border-amber-200'
  if (/ضعيف|منكر|متروك|كذاب/.test(m)) return 'bg-red-100 text-red-700 border-red-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

function gradeClass(g: string | null): string {
  if (!g) return 'bg-gray-100 text-gray-500 border-gray-200'
  if (g === 'صحيح') return 'bg-green-100 text-green-700 border-green-200'
  if (g === 'حسن') return 'bg-amber-100 text-amber-700 border-amber-200'
  if (g === 'ضعيف') return 'bg-red-100 text-red-700 border-red-200'
  return 'bg-gray-100 text-gray-500 border-gray-200'
}

// isnad_type: 1=مرفوع, 2=موقوف, 3=مقطوع, 4=مرسل
function chainTypeBadge(isnadType: number | null): { label: string; cls: string } | null {
  if (!isnadType) return null
  if (isnadType === 1) return { label: 'مرفوع', cls: 'bg-green-100 text-green-700 border-green-300' }
  if (isnadType === 2) return { label: 'موقوف', cls: 'bg-blue-100 text-blue-700 border-blue-300' }
  if (isnadType === 3) return { label: 'مقطوع', cls: 'bg-orange-100 text-orange-700 border-orange-300' }
  if (isnadType === 4) return { label: 'مرسل', cls: 'bg-purple-100 text-purple-700 border-purple-300' }
  return null
}

export default async function HadithChainsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const hadithId = parseInt(id)
  if (isNaN(hadithId)) notFound()

  // Get the hadith basic info
  const hadithRes = await pool.query<HadithBasic>(
    `SELECT h.main_id, h.tarf, b.title AS book_title, b.takhrij_author, h.tarqeem_harf, h.tarqeem_matboa1
     FROM hadith_toc h
     JOIN books b ON b.id = h.book_id
     WHERE h.main_id = $1`,
    [hadithId]
  )
  if (!hadithRes.rows[0]) notFound()
  const hadith = hadithRes.rows[0]

  // Get group_id for this hadith
  const groupRes = await pool.query<{ group_id: number }>(
    `SELECT group_id FROM takhrij WHERE hadith_id = $1 LIMIT 1`,
    [hadithId]
  )
  const groupId = groupRes.rows[0]?.group_id || null

  let parallels: ParallelHadith[] = []
  let allChainNarrators: ChainNarrator[] = []

  if (groupId) {
    // Get all parallel hadiths in this group
    const parallelsRes = await pool.query<ParallelHadith>(
      `SELECT t.hadith_id, t.book_id, b.title AS book_title, b.takhrij_author, b.takhrij_death,
              h.tarqeem_harf, h.tarqeem_matboa1, jg.grade_hint
       FROM takhrij t
       JOIN books b ON b.id = t.book_id
       JOIN hadith_toc h ON h.main_id = t.hadith_id
       LEFT JOIN LATERAL (
         SELECT CASE
           WHEN say_text ~* 'صحيح' THEN 'صحيح'
           WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح' THEN 'حسن'
           WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
           ELSE NULL END AS grade_hint
         FROM hadith_judgments j2
         WHERE j2.hadith_id = t.hadith_id
           AND (j2.say_text ~* 'صحيح|إسناده حسن|حديث حسن|سنده حسن|ضعيف|منكر|متروك')
         ORDER BY CASE
           WHEN j2.say_text ~* 'صحيح' THEN 1
           WHEN j2.say_text ~* 'حسن' THEN 2
           ELSE 3 END
         LIMIT 1
       ) jg ON true
       WHERE t.group_id = $1
       ORDER BY b.tarteeb, b.id`,
      [groupId]
    ).catch(() => ({ rows: [] as ParallelHadith[] }))
    parallels = parallelsRes.rows

    if (parallels.length > 0) {
      const hadithIds = parallels.map(p => p.hadith_id)
      const limitedIds = hadithIds.slice(0, 8)

      // Include isnad_type from isnad_hadiths for chain type badge
      const chainsRes = await pool.query<ChainNarrator>(
        `SELECT iha.hadith_id, ic.id AS chain_id, ic.chain_length,
                iha.isnad_type,
                pos.ord::int AS pos,
                n.id AS narrator_id, n.name, n.abb_name,
                n.is_companion, n.martaba_ibn_hajar, n.martaba_zahabi,
                n.tabaqa, n.death_year_num AS death_year
         FROM isnad_hadiths iha
         JOIN isnad_chains ic ON ic.id = iha.isnad_id
         JOIN LATERAL unnest(ic.narrator_id_array) WITH ORDINALITY AS pos(nar_id, ord) ON true
         JOIN narrators n ON n.id = pos.nar_id
         WHERE iha.hadith_id = ANY($1::int[])
         ORDER BY iha.hadith_id, ic.id, pos.ord`,
        [limitedIds]
      ).catch(() => ({ rows: [] as ChainNarrator[] }))
      allChainNarrators = chainsRes.rows
    }
  }

  // Group chains by hadith_id, then by chain_id
  type ChainMap = Map<number, Map<number, ChainNarrator[]>>
  const chainsByHadith: ChainMap = new Map()
  for (const row of allChainNarrators) {
    if (!chainsByHadith.has(row.hadith_id)) chainsByHadith.set(row.hadith_id, new Map())
    const byChain = chainsByHadith.get(row.hadith_id)!
    if (!byChain.has(row.chain_id)) byChain.set(row.chain_id, [])
    byChain.get(row.chain_id)!.push(row)
  }

  // Find max chain length across all chains
  const maxLen = Math.max(...allChainNarrators.map(n => n.pos), 1)

  // Find narrator IDs that appear in multiple hadith chains (shared narrators)
  const narratorFrequency = new Map<number, number>()
  for (const row of allChainNarrators) {
    narratorFrequency.set(row.narrator_id, (narratorFrequency.get(row.narrator_id) || 0) + 1)
  }
  const sharedNarratorIds = new Set([...narratorFrequency.entries()].filter(([, cnt]) => cnt >= 2).map(([id]) => id))

  return (
    <div dir="rtl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4 flex-wrap">
        <Link href={`/hadith/${hadithId}`} className="text-green-700 hover:underline">
          ← الحديث
        </Link>
        <span>←</span>
        <span className="text-gray-700">مقارنة الأسانيد</span>
      </div>

      <div className="mb-6">
        <h1 className="text-xl font-bold text-green-900 mb-2">مقارنة الأسانيد</h1>
        {hadith.tarf && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-3">
            <p className="text-gray-700 leading-loose text-sm">{stripTags(hadith.tarf).slice(0, 200)}</p>
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">{hadith.book_title}<HadithNumber harf={hadith.tarqeem_harf} matboa={hadith.tarqeem_matboa1} /></p>
          </div>
        )}
        {parallels.length > 0 && (
          <p className="text-sm text-gray-500">{parallels.length} رواية موازية في قاعدة التخريج</p>
        )}
      </div>

      {!groupId && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center text-amber-800">
          لا توجد بيانات تخريج لهذا الحديث
        </div>
      )}

      {groupId && parallels.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center text-green-800">
          هذا الحديث لا توجد له روايات موازية (فرد)
        </div>
      )}

      {/* Parallel hadiths list with their chains */}
      {parallels.length > 0 && (
        <>
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mb-4 text-xs">
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="inline-block w-3 h-3 rounded-full bg-amber-200 border border-amber-300"></span>
              صحابي
            </span>
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="inline-block w-3 h-3 rounded-full bg-green-200 border border-green-300"></span>
              ثقة
            </span>
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="inline-block w-3 h-3 rounded-full bg-amber-100 border border-amber-200"></span>
              صدوق
            </span>
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="inline-block w-3 h-3 rounded-full bg-red-100 border border-red-200"></span>
              ضعيف
            </span>
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="inline-block w-3 h-3 rounded-full ring-1 ring-purple-400 bg-gray-100"></span>
              راوٍ مشترك
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-6 overflow-hidden">
            <div className="bg-green-900 text-white px-5 py-3 text-sm font-semibold">
              الروايات الموازية ({parallels.length})
            </div>
            <div className="divide-y divide-gray-50">
              {parallels.map(p => {
                const chains = chainsByHadith.get(p.hadith_id)
                const firstChainEntry = chains ? [...chains.entries()][0] : null
                const firstChainId = firstChainEntry ? firstChainEntry[0] : null
                const firstChain = firstChainEntry ? firstChainEntry[1] : null
                // isnad_type is on each ChainNarrator row (same for all rows in a chain)
                const firstChainType = firstChain && firstChain.length > 0 ? firstChain[0].isnad_type : null
                const typeBadge = chainTypeBadge(firstChainType)
                return (
                  <div key={p.hadith_id} className={`px-5 py-4 ${p.hadith_id === hadithId ? 'bg-amber-50' : ''}`}>
                    <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/hadith/${p.hadith_id}`} className="font-semibold text-green-800 hover:underline text-sm">
                          {p.book_title}
                        </Link>
                        {p.takhrij_author && (
                          <span className="text-xs text-gray-400">{p.takhrij_author}{p.takhrij_death ? ` (ت ${p.takhrij_death})` : ''}</span>
                        )}
                        {p.hadith_id === hadithId && (
                          <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">الحديث الأصل</span>
                        )}
                        {/* Chain type badge */}
                        {typeBadge && (
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${typeBadge.cls}`}>
                            {typeBadge.label}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <HadithNumber harf={p.tarqeem_harf} matboa={p.tarqeem_matboa1} />
                        {p.grade_hint && (
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${gradeClass(p.grade_hint)}`}>
                            {p.grade_hint}
                          </span>
                        )}
                        <Link href={`/hadith/${p.hadith_id}`} className="text-xs text-green-600 hover:underline">
                          عرض ←
                        </Link>
                      </div>
                    </div>

                    {/* Show one chain inline */}
                    {firstChain && firstChain.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {firstChain.map((n, idx) => (
                          <span key={idx} className="flex items-center gap-1">
                            <Link
                              href={`/narrator/${n.narrator_id}`}
                              className={`text-xs px-2 py-0.5 rounded-full border transition-colors hover:opacity-80 ${narratorBadge(n)} ${
                                sharedNarratorIds.has(n.narrator_id) ? 'ring-1 ring-purple-400 ring-offset-1' : ''
                              }`}
                              title={`${n.name}${n.is_companion ? ' — صحابي' : n.martaba_ibn_hajar ? ` — ${n.martaba_ibn_hajar}` : ''}`}
                            >
                              {(n.abb_name || n.name).split('،')[0].trim().split(' ').slice(0, 2).join(' ')}
                            </Link>
                            {idx < firstChain.length - 1 && (
                              <span className="text-gray-300 text-xs">←</span>
                            )}
                          </span>
                        ))}
                        {chains && chains.size > 1 && (
                          <span className="text-xs text-gray-400 mr-1">+{chains.size - 1} سند</span>
                        )}
                      </div>
                    )}
                    {!firstChain && (
                      <span className="text-xs text-gray-400">لا تتوفر بيانات الإسناد</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Shared narrators legend */}
          {sharedNarratorIds.size > 0 && (
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 mb-6">
              <h3 className="text-sm font-semibold text-purple-800 mb-2">
                الرواة المشتركون في أكثر من سند
                <span className="text-xs bg-purple-200 text-purple-700 px-2 py-0.5 rounded-full mr-2 font-normal">
                  {sharedNarratorIds.size}
                </span>
              </h3>
              <p className="text-xs text-purple-700 mb-3">
                الرواة المحاطون بإطار بنفسجي يظهرون في أسانيد متعددة — يشيرون إلى نقطة التقاء الروايات
              </p>
              <div className="flex flex-wrap gap-2">
                {[...sharedNarratorIds].slice(0, 20).map(nid => {
                  const narrator = allChainNarrators.find(n => n.narrator_id === nid)
                  if (!narrator) return null
                  return (
                    <Link
                      key={nid}
                      href={`/narrator/${nid}`}
                      className={`text-xs px-2 py-0.5 rounded-full border ring-1 ring-purple-400 ring-offset-1 ${narratorBadge(narrator)}`}
                    >
                      {narrator.name.split('،')[0].trim().split(' ').slice(0, 2).join(' ')}
                      <span className="text-gray-400 mr-1">×{narratorFrequency.get(nid)}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* Grade summary */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6 shadow-sm">
            <h3 className="text-sm font-semibold text-green-900 mb-3">ملخص درجات الروايات</h3>
            <div className="flex gap-4 flex-wrap">
              {['صحيح', 'حسن', 'ضعيف'].map(grade => {
                const cnt = parallels.filter(p => p.grade_hint === grade).length
                if (!cnt) return null
                return (
                  <div key={grade} className={`text-center px-4 py-2 rounded-lg border ${gradeClass(grade)}`}>
                    <div className="text-lg font-bold">{cnt.toLocaleString('ar-EG')}</div>
                    <div className="text-xs">{grade}</div>
                  </div>
                )
              })}
              {parallels.filter(p => !p.grade_hint).length > 0 && (
                <div className="text-center px-4 py-2 rounded-lg border bg-gray-50 border-gray-200">
                  <div className="text-lg font-bold text-gray-500">{parallels.filter(p => !p.grade_hint).length.toLocaleString('ar-EG')}</div>
                  <div className="text-xs text-gray-400">غير محكوم عليه</div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Navigation */}
      <div className="flex items-center gap-4 flex-wrap text-sm">
        <Link href={`/hadith/${hadithId}`} className="text-green-700 hover:underline">
          ← عرض الحديث الكامل
        </Link>
        <Link href={`/matn-compare?id=${hadithId}`} className="text-blue-700 hover:underline">
          ← مقارنة المتون
        </Link>
      </div>
    </div>
  )
}
