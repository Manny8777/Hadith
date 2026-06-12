export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import TakhrijSection from '@/app/components/TakhrijSection'
import ServicesBadges from '@/app/components/ServicesBadges'
import HadithExport from '@/app/components/HadithExport'

function stripTags(html: string): string {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

interface NarratorInChain {
  id: number
  name: string
  abb_name: string | null
  martaba_ibn_hajar: string | null
  martaba_zahabi: string | null
  is_companion: boolean
}

function chainDepthLabel(count: number): string {
  const labels: Record<number, string> = {
    3: 'ثلاثي',
    4: 'رباعي',
    5: 'خماسي',
    6: 'سداسي',
    7: 'سباعي',
    8: 'ثماني',
    9: 'تساعي',
    10: 'عشاري',
  }
  return labels[count] || ''
}

function gradeColor(grade: string | null) {
  if (!grade) return null
  if (/ثقة|ثبت|حجة|عدل|صحابي/.test(grade)) return 'bg-green-100 text-green-700 border-green-200'
  if (/صدوق|مقبول|لا بأس/.test(grade)) return 'bg-amber-100 text-amber-700 border-amber-200'
  if (/ضعيف|منكر|متروك|كذاب/.test(grade)) return 'bg-red-100 text-red-700 border-red-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

export default async function HadithPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const mainId = parseInt(id)

  const [hadithRes, judgmentsRes, isnadRes, takhrijBooksRes] = await Promise.all([
    pool.query(
      `SELECT h.*, b.title as book_title, b.takhrij_author, b.takhrij_death
       FROM hadith_toc h
       JOIN books b ON h.book_id = b.id
       WHERE h.main_id = $1`,
      [mainId]
    ),
    pool.query(
      `SELECT j.say_text, n.name as scientist_name, n.abb_name
       FROM hadith_judgments j
       LEFT JOIN narrators n ON j.scientist_id = n.id
       WHERE j.hadith_id = $1
       LIMIT 10`,
      [mainId]
    ),
    pool.query(
      `SELECT ic.narrator_ids
       FROM isnad_hadiths ih
       JOIN isnad_chains ic ON ih.isnad_id = ic.id
       WHERE ih.hadith_id = $1
       LIMIT 5`,
      [mainId]
    ),
    // Takhrij books for export
    pool.query(
      `SELECT DISTINCT b.title
       FROM takhrij t
       JOIN books b ON b.id = t.book_id
       WHERE t.group_id = (SELECT group_id FROM takhrij WHERE hadith_id = $1 LIMIT 1)
         AND t.hadith_id != $1
       ORDER BY b.title
       LIMIT 20`,
      [mainId]
    ).catch(() => ({ rows: [] })),
  ])

  if (!hadithRes.rows[0]) notFound()
  const h = hadithRes.rows[0]

  // Build chains: resolve narrator IDs to full narrator info for each chain
  type Chain = { narrators: NarratorInChain[]; hasWeak: boolean; allStrong: boolean }
  const chains: Chain[] = []

  if (isnadRes.rows.length > 0) {
    // Collect all unique narrator IDs across all chains
    const allIds = new Set<number>()
    const chainIdArrays: number[][] = []
    for (const row of isnadRes.rows) {
      const ids = (row.narrator_ids as string).trim().split(/\s+/).filter(Boolean).map(Number)
      chainIdArrays.push(ids)
      ids.forEach(id => allIds.add(id))
    }

    // Fetch all narrator info in one query
    if (allIds.size > 0) {
      const narRes = await pool.query<NarratorInChain>(
        `SELECT id, name, abb_name, martaba_ibn_hajar, martaba_zahabi, is_companion
         FROM narrators WHERE id = ANY($1)`,
        [Array.from(allIds)]
      )
      const narMap: Record<number, NarratorInChain> = {}
      narRes.rows.forEach(n => { narMap[n.id] = n })

      // Deduplicate chains (same chain may appear multiple times)
      const seenChains = new Set<string>()
      for (const ids of chainIdArrays) {
        const key = ids.join('-')
        if (seenChains.has(key)) continue
        seenChains.add(key)
        const narrators = ids.map(nid => narMap[nid] || { id: nid, name: `[${nid}]`, abb_name: null, martaba_ibn_hajar: null, martaba_zahabi: null, is_companion: false })
        const hasWeak = narrators.some(n => n.martaba_ibn_hajar && /ضعيف|منكر|متروك|كذاب/.test(n.martaba_ibn_hajar))
        const allStrong = narrators.length > 0 && narrators.every(n => !n.martaba_ibn_hajar || /ثقة|ثبت|حجة|عدل|صحابي|صدوق|مقبول/.test(n.martaba_ibn_hajar))
        chains.push({ narrators, hasWeak, allStrong })
      }
    }
  }

  const primaryChain = chains[0]
  const hasWeakLink = primaryChain?.hasWeak ?? false
  const allStrong = primaryChain?.allStrong ?? false
  const takhrijBooks = (takhrijBooksRes as { rows: Array<{ title: string }> }).rows.map(r => r.title)

  // Find narrators shared across ALL chains (common pivot points in multi-chain hadiths)
  let commonNarrators: NarratorInChain[] = []
  if (chains.length > 1) {
    const idSets = chains.map(c => new Set(c.narrators.map(n => n.id)))
    const sharedIds = Array.from(idSets[0]).filter(id => idSets.every(s => s.has(id)))
    if (sharedIds.length > 0) {
      const narMap: Record<number, NarratorInChain> = {}
      chains[0].narrators.forEach(n => { narMap[n.id] = n })
      commonNarrators = sharedIds.map(id => narMap[id]).filter(Boolean)
    }
  }

  return (
    <div>
      <Link href={`/books/${h.book_id}`} className="text-green-700 hover:underline text-sm">
        ← {h.book_title}
      </Link>

      {/* Context */}
      <div className="mt-4 mb-2 text-sm text-gray-500">
        {h.section_text?.trim() && <span>{h.section_text.trim()} — </span>}
        {h.chapter_text?.trim() && <span>{h.chapter_text.trim()}</span>}
      </div>

      {/* Page/Part reference */}
      {(h.part_num > 0 || h.page_num > 0) && (
        <div className="text-sm text-gray-400 mb-4">
          جزء {h.part_num} — صفحة {h.page_num}
          {h.tarqeem_harf?.trim() && ` — رقم الحديث: ${h.tarqeem_harf.trim()}`}
          {h.tarqeem_matboa1?.trim() && ` — رقم الطبعة: ${h.tarqeem_matboa1.trim()}`}
        </div>
      )}

      {/* Feature-flag badges + export */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <ServicesBadges hadithId={mainId} />
        <HadithExport
          hadith={{
            main_id: mainId,
            book_title: h.book_title,
            takhrij_author: h.takhrij_author,
            takhrij_death: h.takhrij_death,
            section_text: h.section_text,
            chapter_text: h.chapter_text,
            part_num: h.part_num,
            page_num: h.page_num,
            tarqeem_harf: h.tarqeem_harf,
            tarqeem_matboa1: h.tarqeem_matboa1,
            tarf: h.tarf,
          }}
          chain={primaryChain?.narrators || []}
          takhrijBooks={takhrijBooks}
        />
      </div>

      {/* Hadith content */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6 text-lg leading-loose">
        {stripTags(h.content)}
      </div>

      {/* Narrator chain(s) */}
      {chains.length > 0 && (
        <div className="mb-6 space-y-3">
          {chains.map((chain, ci) => (
            <div key={ci} className={`rounded-xl border p-5 ${chain.hasWeak ? 'bg-red-50 border-red-100' : chain.allStrong ? 'bg-green-50 border-green-100' : 'bg-amber-50 border-amber-100'}`}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-green-800 text-base flex items-center gap-2">
                  {chains.length > 1 ? `السند ${ci === 0 ? 'الأول' : ci === 1 ? 'الثاني' : ci === 2 ? 'الثالث' : ci + 1}` : 'السند'}
                  {chainDepthLabel(chain.narrators.length) && (
                    <span className="text-xs font-normal text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                      {chainDepthLabel(chain.narrators.length)} ({chain.narrators.length} رواة)
                    </span>
                  )}
                </h2>
                <div className="flex gap-2">
                  {chain.hasWeak && (
                    <span className="text-xs font-semibold text-red-600 bg-red-100 px-3 py-1 rounded-full border border-red-200">
                      يوجد راوٍ ضعيف
                    </span>
                  )}
                  {chain.allStrong && !chain.hasWeak && (
                    <span className="text-xs font-semibold text-green-700 bg-green-100 px-3 py-1 rounded-full border border-green-200">
                      رجال السند ثقات
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 items-start">
                {chain.narrators.map((nar, i) => {
                  const color = gradeColor(nar.martaba_ibn_hajar || nar.martaba_zahabi)
                  return (
                    <span key={i} className="flex items-center gap-1.5">
                      <Link href={`/narrator/${nar.id}`} className="flex flex-col items-center gap-0.5 group">
                        <span className={`px-3 py-1.5 rounded-lg text-sm border transition-all group-hover:shadow-sm ${color || 'bg-white border-amber-200 hover:border-green-400'}`}>
                          {nar.is_companion && <span className="text-amber-500 text-xs ml-1">ص</span>}
                          {nar.abb_name || nar.name}
                        </span>
                        {nar.martaba_ibn_hajar && (
                          <span className="text-xs text-gray-500">{nar.martaba_ibn_hajar}</span>
                        )}
                      </Link>
                      {i < chain.narrators.length - 1 && <span className="text-gray-300 text-lg mt-0.5">←</span>}
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Common narrators across chains */}
      {commonNarrators.length > 0 && (
        <div className="mb-6 bg-blue-50 border border-blue-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-blue-700 mb-2">النقطة المشتركة في جميع الأسانيد</p>
          <div className="flex flex-wrap gap-2">
            {commonNarrators.map(n => (
              <Link key={n.id} href={`/narrator/${n.id}`}
                className={`text-sm px-3 py-1 rounded-lg border ${gradeColor(n.martaba_ibn_hajar || n.martaba_zahabi) || 'bg-white border-blue-200'} hover:shadow-sm transition-all`}>
                {n.abb_name || n.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Judgments */}
      {judgmentsRes.rows.length > 0 && (
        <div className="bg-green-50 rounded-xl border border-green-100 p-5 mb-6">
          <h2 className="font-bold text-green-800 mb-3 text-lg">أقوال العلماء والتخريج</h2>
          <div className="grid gap-3">
            {judgmentsRes.rows.map((j, i) => (
              <div key={i} className="bg-white rounded-lg p-4 border border-green-100">
                {j.scientist_name && (
                  <p className="font-bold text-green-700 text-sm mb-1">
                    {j.abb_name || j.scientist_name}
                  </p>
                )}
                <p className="text-gray-800 text-sm leading-relaxed">{j.say_text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Takhrij — cross-references in other books */}
      <TakhrijSection hadithId={mainId} />

      {/* Navigation */}
      <div className="flex justify-between mt-8 text-sm">
        {h.prev_paragraph_id > 0 && (
          <Link href={`/hadith/${h.prev_paragraph_id}`} className="text-green-700 hover:underline">
            → السابق
          </Link>
        )}
        {h.next_paragraph_id > 0 && (
          <Link href={`/hadith/${h.next_paragraph_id}`} className="text-green-700 hover:underline">
            ← التالي
          </Link>
        )}
      </div>
    </div>
  )
}
