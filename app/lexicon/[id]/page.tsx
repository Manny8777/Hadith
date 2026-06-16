export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import LexiconHadithList from '../LexiconHadithList'
import { LEXICON_SCOPE_CTE } from '@/lib/ghareeb'

interface LexiconItem {
  id: number
  lexicon_id: number
  text: string
  parent_id: number | null
  is_leaf: boolean
  results_count: number
  parent_text: string | null
  parent_parent_id: number | null
  grandparent_text: string | null
  grandparent_parent_id: number | null
}

interface ChildItem {
  id: number
  text: string
  is_leaf: boolean
  ref_count: number
}

interface ContentRef {
  ref_id: number
  book_id: number
  book_name: string | null
  section_text: string | null
  part_text: string | null
  tarf: string | null
  part_num: number | null
  page_num: number | null
}

function lexiconRootHref(lexiconId: number): string {
  if (lexiconId === 3) return '/lexicon/places'
  return '/lexicon'
}

function lexiconRootLabel(lexiconId: number): string {
  if (lexiconId === 3) return 'معجم الأماكن والبلدان'
  return 'معجم غريب الحديث'
}

export default async function LexiconItemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const itemId = parseInt(id)
  if (isNaN(itemId)) notFound()

  const [itemRes, childrenRes, hadithCountRes] = await Promise.all([
    pool.query<LexiconItem>(
      `SELECT li.*,
              parent.text         AS parent_text,
              parent.parent_id    AS parent_parent_id,
              gp.text             AS grandparent_text,
              gp.parent_id        AS grandparent_parent_id
       FROM lexicon_items li
       LEFT JOIN lexicon_items parent ON parent.id = li.parent_id
       LEFT JOIN lexicon_items gp     ON gp.id    = parent.parent_id
       WHERE li.id = $1`,
      [itemId]
    ),
    pool.query<ChildItem>(
      `SELECT li.id, li.text, li.is_leaf,
              COUNT(lh.hadith_id)::int AS ref_count
       FROM lexicon_items li
       LEFT JOIN lexicon_hadith lh ON lh.lexicon_item_id = li.id
       WHERE li.parent_id = $1
       GROUP BY li.id, li.text, li.is_leaf
       ORDER BY li.left_value`,
      [itemId]
    ),
    pool.query<{ total: number }>(
      `WITH ${LEXICON_SCOPE_CTE},
       refs AS (
         SELECT lh.hadith_id
         FROM lexicon_hadith lh
         JOIN lexicon_scope ls ON ls.id = lh.lexicon_item_id
         UNION
         SELECT hsl.hadith_id
         FROM lexicon_hadith lh
         JOIN lexicon_scope ls ON ls.id = lh.lexicon_item_id
         JOIN hadith_service_links hsl ON hsl.service_content_id = lh.hadith_id
       )
       SELECT COUNT(DISTINCT h.main_id)::int AS total
       FROM refs
       JOIN hadith_toc h ON h.main_id = refs.hadith_id`,
      [itemId]
    ),
  ])

  if (!itemRes.rows[0]) notFound()
  const item = itemRes.rows[0]

  // lexicon_hadith.hadith_id references hadith_service_content.id (scholarly text passages)
  const contentRes = await pool.query<ContentRef>(
    `SELECT DISTINCT lh.hadith_id AS ref_id, hsc.book_id,
            hsc.book_name, hsc.section_text, hsc.part_text, hsc.tarf,
            hsc.part_num, hsc.page_num
     FROM lexicon_hadith lh
     JOIN hadith_service_content hsc ON hsc.id = lh.hadith_id
     WHERE lh.lexicon_item_id = $1
        OR lh.lexicon_item_id IN (
             SELECT id FROM lexicon_items WHERE parent_id = $1
           )
     ORDER BY hsc.book_id, lh.hadith_id
     LIMIT 50`,
    [itemId]
  )

  const children = childrenRes.rows
  const refs     = contentRes.rows
  const hadithCount = hadithCountRes.rows[0]?.total ?? 0
  const rootHref  = lexiconRootHref(item.lexicon_id)
  const rootLabel = lexiconRootLabel(item.lexicon_id)

  const breadcrumbs: { label: string; href?: string }[] = [
    { label: 'الرئيسية', href: '/' },
    { label: rootLabel, href: rootHref },
  ]

  if (item.grandparent_text && item.grandparent_parent_id !== null && item.parent_text) {
    breadcrumbs.push({ label: item.grandparent_text })
    breadcrumbs.push({ label: item.parent_text, href: `/lexicon/${item.parent_id}` })
  } else if (item.parent_text) {
    breadcrumbs.push({ label: item.parent_text })
  }

  return (
    <div dir="rtl" className="max-w-3xl mx-auto">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-xs text-gray-400 mb-6 flex-wrap">
        {breadcrumbs.map((bc, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-gray-300">›</span>}
            {bc.href ? (
              <Link href={bc.href} className="hover:text-green-700 transition-colors">
                {bc.label}
              </Link>
            ) : (
              <span className="text-gray-500">{bc.label}</span>
            )}
          </span>
        ))}
        <span className="text-gray-300">›</span>
        <span className="text-green-800 font-medium">{item.text}</span>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-green-900 mb-1">{item.text}</h1>
        {(refs.length > 0 || children.length > 0 || hadithCount > 0) && (
          <p className="text-sm text-gray-500">
            {hadithCount > 0 ? `${hadithCount.toLocaleString('ar-EG')} حديث` : ''}
            {hadithCount > 0 && refs.length > 0 ? ' · ' : ''}
            {refs.length > 0 ? `${refs.length} نص علمي` : ''}
            {(hadithCount > 0 || refs.length > 0) && children.length > 0 ? ' · ' : ''}
            {children.length > 0 ? `${children.length} صيغة` : ''}
          </p>
        )}
      </div>

      {/* Word forms */}
      {children.length > 0 && (
        <section className="mb-8">
          <h2 className="text-base font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">
            صيغ الكلمة ({children.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {children.map(child => (
              <div
                key={child.id}
                className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
              >
                <span className="text-green-900 font-semibold text-sm">{child.text}</span>
                {child.ref_count > 0 && (
                  <span className="text-[10px] text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5">
                    {child.ref_count}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Hadiths containing this word */}
      {hadithCount > 0 && (
        <section className="mb-8">
          <h2 className="text-base font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">
            أحاديث ورد فيها هذا اللفظ ({hadithCount.toLocaleString('ar-EG')})
          </h2>
          <LexiconHadithList itemId={itemId} />
        </section>
      )}

      {/* Scholarly texts */}
      {refs.length > 0 ? (
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">
            نصوص كتب غريب الحديث
          </h2>
          <div className="space-y-2">
            {refs.map(r => (
              <Link
                key={r.ref_id}
                href={`/service-content/${r.ref_id}`}
                className="flex items-start gap-3 bg-white border border-gray-100 rounded-lg px-4 py-3 hover:border-green-200 hover:shadow-sm transition-all group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-green-700 mb-0.5">{r.book_name}</p>
                  {r.section_text && (
                    <p className="text-xs text-gray-500 mb-0.5">{r.section_text}</p>
                  )}
                  {(r.part_text || r.tarf) && (
                    <p className="text-sm text-gray-700 leading-relaxed line-clamp-2">
                      {(r.part_text || r.tarf || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
                    </p>
                  )}
                </div>
                {(r.part_num || r.page_num) && (
                  <span className="text-xs text-gray-400 shrink-0 mt-0.5">
                    {r.part_num ? `ج${r.part_num}` : ''}{r.page_num ? ` ص${r.page_num}` : ''}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>
      ) : hadithCount === 0 ? (
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
          لا توجد نصوص مرتبطة بهذا المدخل
        </div>
      ) : null}

      <div className="mt-8 pt-4 border-t border-gray-100">
        <Link href={rootHref} className="text-sm text-green-700 hover:underline">
          ← {rootLabel}
        </Link>
      </div>
    </div>
  )
}
