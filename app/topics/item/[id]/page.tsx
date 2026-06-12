export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

interface SubjectItem {
  id: number
  title: string
  parent_id: number
  is_leaf: boolean
}

interface HadithRow {
  main_id: number
  book_id: number
  book_name: string
  tarf: string | null
  part_num: number
  page_num: number
  section_text: string | null
  chapter_text: string | null
}

interface ChildItem {
  id: number
  title: string
  is_leaf: boolean
  left_value: number
  hadith_count: string
}

function stripTags(html: string): string {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export default async function TopicItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const { id }   = await params
  const { page: pageParam } = await searchParams
  const itemId = parseInt(id)
  const page   = Math.max(1, parseInt(pageParam || '1'))
  const limit  = 20
  const offset = (page - 1) * limit

  if (isNaN(itemId)) notFound()

  const itemRes = await pool.query<SubjectItem>(
    `SELECT id, title, parent_id, is_leaf FROM subject_items WHERE id = $1`,
    [itemId]
  )
  if (!itemRes.rows[0]) notFound()
  const item = itemRes.rows[0]

  // Get parent for breadcrumb
  const parentRes = await pool.query(
    `SELECT id, title FROM subject_categories WHERE id = $1`,
    [item.parent_id]
  )
  const parent = parentRes.rows[0] || null

  // Check if has children
  const { rows: children } = await pool.query<ChildItem>(
    `SELECT si.id, si.title, si.is_leaf, si.left_value,
            COUNT(DISTINCT hs.id) AS hadith_count
     FROM subject_items si
     LEFT JOIN hadith_subjects hs ON hs.subject_id = si.id
     WHERE si.parent_id = $1
     GROUP BY si.id
     ORDER BY si.left_value
     LIMIT $2 OFFSET $3`,
    [itemId, limit, offset]
  )

  const hasChildren = children.length > 0

  // Get hadiths if this is a leaf or has no children
  let hadiths: HadithRow[] = []
  let total = 0
  let pages = 0

  if (hasChildren) {
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM subject_items WHERE parent_id = $1`,
      [itemId]
    )
    total = parseInt(countRows[0].count)
    pages = Math.ceil(total / limit)
  } else {
    const { rows } = await pool.query<HadithRow>(
      `SELECT h.main_id, h.book_id, h.book_name, h.tarf, h.part_num, h.page_num,
              h.section_text, h.chapter_text
       FROM hadith_subjects hs
       JOIN hadith_toc h ON h.main_id = hs.paragraph_main_id
       WHERE hs.subject_id = $1
       ORDER BY h.book_id, h.main_id
       LIMIT $2 OFFSET $3`,
      [itemId, limit, offset]
    )
    hadiths = rows

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM hadith_subjects WHERE subject_id = $1`,
      [itemId]
    )
    total = parseInt(countRows[0].count)
    pages = Math.ceil(total / limit)
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6 flex-wrap">
        <Link href="/topics" className="text-green-700 hover:underline">
          الفهارس الموضوعية
        </Link>
        {parent && (
          <>
            <span>←</span>
            <Link href={`/topics/${parent.id}`} className="text-green-700 hover:underline">
              {parent.title}
            </Link>
          </>
        )}
        <span>←</span>
        <span className="text-gray-700">{item.title}</span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">{item.title}</h1>
        <p className="text-gray-500 text-sm">
          {hasChildren
            ? `${total.toLocaleString('ar-SA')} موضوع فرعي`
            : `${total.toLocaleString('ar-SA')} حديث`}
        </p>
      </div>

      {/* Sub-items (non-leaf node) */}
      {hasChildren && (
        <div className="grid gap-2">
          {children.map(child => {
            const hadithCount = parseInt(child.hadith_count)
            return (
              <Link
                key={child.id}
                href={`/topics/item/${child.id}`}
                className="group flex items-center justify-between bg-white rounded-lg border border-gray-100 px-5 py-3 hover:shadow-sm hover:border-green-200 transition-all"
              >
                <span className="text-green-900 group-hover:text-green-700 font-medium leading-relaxed">
                  {child.title}
                </span>
                <div className="flex items-center gap-3 shrink-0 mr-4">
                  {hadithCount > 0 && (
                    <span className="text-xs text-gray-400 bg-gray-50 rounded-full px-2 py-0.5">
                      {hadithCount.toLocaleString('ar-SA')} حديث
                    </span>
                  )}
                  {!child.is_leaf && (
                    <span className="text-xs text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
                      فروع
                    </span>
                  )}
                  <span className="text-gray-300 group-hover:text-green-400 transition-colors">←</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* Hadiths (leaf node) */}
      {!hasChildren && (
        <>
          {hadiths.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center text-gray-500">
              لا توجد أحاديث مرتبطة بهذا الموضوع
            </div>
          ) : (
            <div className="grid gap-4">
              {hadiths.map(h => (
                <Link
                  key={h.main_id}
                  href={`/hadith/${h.main_id}`}
                  className="group block bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md hover:border-green-200 transition-all"
                >
                  {/* Book + location */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-green-700 bg-green-50 rounded-full px-3 py-1">
                      {h.book_name}
                    </span>
                    {(h.part_num > 0 || h.page_num > 0) && (
                      <span className="text-xs text-gray-400">
                        جزء {h.part_num} — صفحة {h.page_num}
                      </span>
                    )}
                  </div>

                  {/* Section / Chapter context */}
                  {(h.section_text || h.chapter_text) && (
                    <p className="text-xs text-gray-400 mb-2 leading-relaxed">
                      {[h.section_text, h.chapter_text].filter(Boolean).join(' — ')}
                    </p>
                  )}

                  {/* Tarf (opening words) */}
                  {h.tarf ? (
                    <p className="text-gray-800 leading-loose text-base line-clamp-3">
                      {stripTags(h.tarf)}
                    </p>
                  ) : (
                    <p className="text-gray-400 italic text-sm">
                      (انقر لعرض الحديث)
                    </p>
                  )}

                  <div className="mt-3 flex justify-end">
                    <span className="text-xs text-green-600 group-hover:text-green-700 transition-colors">
                      عرض الحديث كاملاً ←
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          {page > 1 && (
            <Link
              href={`/topics/item/${itemId}?page=${page - 1}`}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-green-700 hover:bg-green-50 transition-colors"
            >
              → السابق
            </Link>
          )}
          <span className="text-sm text-gray-500 px-2">
            {page} / {pages}
          </span>
          {page < pages && (
            <Link
              href={`/topics/item/${itemId}?page=${page + 1}`}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-green-700 hover:bg-green-50 transition-colors"
            >
              ← التالي
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
