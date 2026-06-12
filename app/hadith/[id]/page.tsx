export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import TakhrijSection from '@/app/components/TakhrijSection'
import ServicesBadges from '@/app/components/ServicesBadges'

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

  const [hadithRes, judgmentsRes, isnadRes] = await Promise.all([
    pool.query(
      `SELECT h.*, b.title as book_title, b.takhrij_author
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
       LIMIT 3`,
      [mainId]
    ),
  ])

  if (!hadithRes.rows[0]) notFound()
  const h = hadithRes.rows[0]

  // Get narrator details including grades
  let orderedIds: number[] = []
  let narrators: NarratorInChain[] = []
  if (isnadRes.rows[0]?.narrator_ids) {
    orderedIds = (isnadRes.rows[0].narrator_ids as string)
      .trim().split(/\s+/).filter(Boolean).map(Number)
    if (orderedIds.length > 0) {
      const narRes = await pool.query<NarratorInChain>(
        `SELECT id, name, abb_name, martaba_ibn_hajar, martaba_zahabi, is_companion
         FROM narrators WHERE id = ANY($1) LIMIT 30`,
        [orderedIds]
      )
      const narMap: Record<number, NarratorInChain> = {}
      narRes.rows.forEach(n => { narMap[n.id] = n })
      narrators = orderedIds.map(nid => narMap[nid] || { id: nid, name: `[${nid}]`, abb_name: null, martaba_ibn_hajar: null, martaba_zahabi: null, is_companion: false })
    }
  }

  // Chain assessment: detect weak links
  const hasWeakLink = narrators.some(n => n.martaba_ibn_hajar && /ضعيف|منكر|متروك|كذاب/.test(n.martaba_ibn_hajar))
  const allStrong = narrators.length > 0 && narrators.every(n => !n.martaba_ibn_hajar || /ثقة|ثبت|حجة|عدل|صحابي|صدوق|مقبول/.test(n.martaba_ibn_hajar))

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

      {/* Feature-flag badges */}
      <ServicesBadges hadithId={mainId} />

      {/* Hadith content */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6 text-lg leading-loose">
        {stripTags(h.content)}
      </div>

      {/* Narrator chain */}
      {narrators.length > 0 && (
        <div className={`rounded-xl border p-5 mb-6 ${hasWeakLink ? 'bg-red-50 border-red-100' : allStrong ? 'bg-green-50 border-green-100' : 'bg-amber-50 border-amber-100'}`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-green-800 text-lg">السند</h2>
            {hasWeakLink && (
              <span className="text-xs font-semibold text-red-600 bg-red-100 px-3 py-1 rounded-full border border-red-200">
                يوجد راوٍ ضعيف
              </span>
            )}
            {allStrong && !hasWeakLink && (
              <span className="text-xs font-semibold text-green-700 bg-green-100 px-3 py-1 rounded-full border border-green-200">
                رجال السند ثقات
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 items-start">
            {narrators.map((nar, i) => {
              const color = gradeColor(nar.martaba_ibn_hajar || nar.martaba_zahabi)
              return (
                <span key={i} className="flex items-center gap-1.5">
                  <Link
                    href={`/narrator/${nar.id}`}
                    className={`flex flex-col items-center gap-0.5 group`}
                  >
                    <span className={`px-3 py-1.5 rounded-lg text-sm border transition-all group-hover:shadow-sm ${color || 'bg-white border-amber-200 hover:border-green-400'}`}>
                      {nar.is_companion && <span className="text-amber-500 text-xs ml-1">ص</span>}
                      {nar.abb_name || nar.name}
                    </span>
                    {nar.martaba_ibn_hajar && (
                      <span className="text-xs text-gray-500">{nar.martaba_ibn_hajar}</span>
                    )}
                  </Link>
                  {i < narrators.length - 1 && (
                    <span className="text-gray-300 text-lg mt-0.5">←</span>
                  )}
                </span>
              )
            })}
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
