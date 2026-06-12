export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import TakhrijSection from '@/app/components/TakhrijSection'
import ServicesBadges from '@/app/components/ServicesBadges'

function stripTags(html: string): string {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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

  // Get narrator names from chain (with IDs for links)
  let narrators: { id: number; name: string }[] = []
  if (isnadRes.rows[0]?.narrator_ids) {
    const ids: number[] = (isnadRes.rows[0].narrator_ids as string)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(Number)
    if (ids.length > 0) {
      const narRes = await pool.query(
        `SELECT id, name, abb_name FROM narrators WHERE id = ANY($1) LIMIT 20`,
        [ids]
      )
      const narMap: Record<number, { id: number; name: string }> = {}
      narRes.rows.forEach(n => { narMap[n.id] = { id: n.id, name: n.abb_name || n.name } })
      narrators = ids.map(nid => narMap[nid] || { id: nid, name: `[${nid}]` })
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

      {/* Feature-flag badges */}
      <ServicesBadges hadithId={mainId} />

      {/* Hadith content */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6 text-lg leading-loose">
        {stripTags(h.content)}
      </div>

      {/* Narrator chain */}
      {narrators.length > 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-100 p-5 mb-6">
          <h2 className="font-bold text-green-800 mb-3 text-lg">السند</h2>
          <div className="flex flex-wrap gap-2 items-center">
            {narrators.map((nar, i) => (
              <span key={i} className="flex items-center gap-2">
                <Link
                  href={`/narrator/${nar.id}`}
                  className="bg-white border border-amber-200 rounded-full px-3 py-1 text-sm hover:border-green-400 hover:text-green-800 transition-colors"
                >
                  {nar.name}
                </Link>
                {i < narrators.length - 1 && (
                  <span className="text-gray-400">←</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Judgments */}
      {judgmentsRes.rows.length > 0 && (
        <div className="bg-green-50 rounded-xl border border-green-100 p-5">
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
