export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

interface TermNode {
  id: number
  text: string
  parent_id: number
  is_leaf: boolean
  node_id: number
}

interface ScientistSay {
  node_id: number
  scientist_id: number | null
  say: string
  service_main_id: number | null
  link_id: number | null
  scientist_name: string | null
  abb_name: string | null
  death_year: string | null
  book_name: string | null
}

interface ContentHit {
  hit_id: number
  book_name: string | null
  section_text: string | null
  part_text: string | null
  tarf: string | null
  part_num: number | null
  page_num: number | null
}

export default async function HadithTermPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const termId = parseInt(id)
  if (isNaN(termId)) notFound()

  const [termRes, parentRes, childrenRes, saysRes, hitsRes] = await Promise.all([
    pool.query<TermNode>(
      `SELECT id, text, parent_id, is_leaf, node_id FROM hadith_expressions_tree WHERE id = $1`,
      [termId]
    ),
    pool.query<TermNode>(
      `SELECT id, text, parent_id, is_leaf, node_id FROM hadith_expressions_tree WHERE id = (SELECT parent_id FROM hadith_expressions_tree WHERE id = $1)`,
      [termId]
    ),
    pool.query<TermNode>(
      `SELECT id, text, parent_id, is_leaf, node_id FROM hadith_expressions_tree WHERE parent_id = $1 ORDER BY left_value`,
      [termId]
    ),
    pool.query<ScientistSay>(
      `SELECT es.node_id, es.scientist_id, es.say, es.service_main_id, es.link_id,
              n.name AS scientist_name, n.abb_name, n.death_year,
              hsc.book_name
       FROM hadith_expressions_says es
       LEFT JOIN narrators n ON n.id = es.scientist_id
       LEFT JOIN hadith_service_content hsc ON hsc.id = es.service_main_id
       WHERE es.node_id = (SELECT node_id FROM hadith_expressions_tree WHERE id = $1)
       ORDER BY n.death_year_num ASC NULLS LAST`,
      [termId]
    ),
    pool.query<ContentHit>(
      `SELECT eh.hit_id, hsc.book_name, hsc.section_text, hsc.part_text, hsc.tarf,
              hsc.part_num, hsc.page_num
       FROM hadith_expressions_hits eh
       JOIN hadith_service_content hsc ON hsc.id = eh.hit_id
       WHERE eh.node_id = (SELECT node_id FROM hadith_expressions_tree WHERE id = $1)
       ORDER BY hsc.book_id, hsc.left_value
       LIMIT 30`,
      [termId]
    ),
  ])

  if (!termRes.rows[0]) notFound()
  const term = termRes.rows[0]
  const parent = parentRes.rows[0] ?? null
  const children = childrenRes.rows
  const says = saysRes.rows
  const hits = hitsRes.rows

  return (
    <div dir="rtl" className="max-w-3xl mx-auto">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-xs text-gray-400 mb-6 flex-wrap">
        <Link href="/" className="hover:text-green-700">الرئيسية</Link>
        <span className="text-gray-300">›</span>
        <Link href="/hadith-terms" className="hover:text-green-700">تطبيقات المصطلح</Link>
        {parent && parent.parent_id !== 0 && (
          <>
            <span className="text-gray-300">›</span>
            <Link href={`/hadith-terms/${parent.id}`} className="hover:text-green-700 text-gray-500">
              {parent.text}
            </Link>
          </>
        )}
        <span className="text-gray-300">›</span>
        <span className="text-green-800 font-medium">{term.text}</span>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-green-900 mb-2">{term.text}</h1>
        <div className="flex gap-3 text-xs text-gray-400">
          {says.length > 0 && <span>{says.length} قول للعلماء</span>}
          {hits.length > 0 && <span>{hits.length} نص من المصادر</span>}
          {children.length > 0 && <span>{children.length} مصطلح فرعي</span>}
        </div>
      </div>

      {/* Sub-terms */}
      {children.length > 0 && (
        <section className="mb-8">
          <h2 className="text-base font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">
            المصطلحات الفرعية
          </h2>
          <div className="flex flex-wrap gap-2">
            {children.map(child => (
              <Link
                key={child.id}
                href={`/hadith-terms/${child.id}`}
                className="px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 hover:bg-green-100 hover:border-green-300 transition-colors"
              >
                {child.text}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Scholar quotes */}
      {says.length > 0 && (
        <section className="mb-8">
          <h2 className="text-base font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">
            أقوال العلماء في المصطلح
          </h2>
          <div className="space-y-4">
            {says.map((s, i) => (
              <div key={i} className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                <p className="text-sm text-gray-800 leading-relaxed font-arabic mb-3">
                  {s.say}
                </p>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-xs text-gray-500">
                    {s.scientist_name || s.abb_name ? (
                      <span className="font-medium text-green-800">
                        {s.abb_name || s.scientist_name}
                        {s.death_year && ` (ت ${s.death_year})`}
                      </span>
                    ) : null}
                    {s.book_name && (
                      <span className="mr-2 text-gray-400">— {s.book_name}</span>
                    )}
                  </div>
                  {s.service_main_id && (
                    <Link
                      href={`/service-content/${s.service_main_id}`}
                      className="text-xs text-green-600 hover:text-green-800 hover:underline"
                    >
                      عرض المصدر ←
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Content hits */}
      {hits.length > 0 && (
        <section className="mb-8">
          <h2 className="text-base font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">
            نصوص المصادر
          </h2>
          <div className="space-y-2">
            {hits.map(hit => (
              <Link
                key={hit.hit_id}
                href={`/service-content/${hit.hit_id}`}
                className="flex items-start gap-3 bg-white border border-gray-100 rounded-lg px-4 py-3 hover:border-green-200 hover:shadow-sm transition-all"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-green-700 mb-0.5">{hit.book_name}</p>
                  {hit.section_text && (
                    <p className="text-xs text-gray-500 mb-0.5">{hit.section_text}</p>
                  )}
                  {hit.part_text && (
                    <p className="text-sm text-gray-700 line-clamp-2 leading-relaxed">
                      {hit.part_text}
                    </p>
                  )}
                </div>
                {(hit.part_num || hit.page_num) && (
                  <span className="text-xs text-gray-400 shrink-0 mt-0.5">
                    {hit.part_num ? `ج${hit.part_num}` : ''}{hit.page_num ? ` ص${hit.page_num}` : ''}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {says.length === 0 && hits.length === 0 && children.length === 0 && (
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
          لا يوجد محتوى لهذا المصطلح بعد
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-gray-100">
        <Link href="/hadith-terms" className="text-sm text-green-700 hover:underline">
          ← تطبيقات المصطلح
        </Link>
      </div>
    </div>
  )
}