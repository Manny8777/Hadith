export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

interface SubjectItem {
  id: number
  title: string
  is_leaf: boolean
  left_value: number
  right_value: number
  hadith_count: string
}

interface Category {
  id: number
  title: string
  parent_id: number
  is_leaf: boolean
  left_value: number
  right_value: number
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const { id }   = await params
  const { page: pageParam } = await searchParams
  const catId  = parseInt(id)
  const page   = Math.max(1, parseInt(pageParam || '1'))
  const limit  = 50
  const offset = (page - 1) * limit

  if (isNaN(catId)) notFound()

  const catRes = await pool.query<Category>(
    `SELECT id, title, parent_id, is_leaf, left_value, right_value
     FROM subject_categories WHERE id = $1`,
    [catId]
  )
  if (!catRes.rows[0]) notFound()
  const cat = catRes.rows[0]

  const { rows: items } = await pool.query<SubjectItem>(
    `SELECT
       si.id,
       si.title,
       si.is_leaf,
       si.left_value,
       si.right_value,
       COUNT(DISTINCT hs.id) AS hadith_count
     FROM subject_items si
     LEFT JOIN hadith_subjects hs ON hs.subject_id = si.id
     WHERE si.parent_id = $1
     GROUP BY si.id
     ORDER BY si.left_value
     LIMIT $2 OFFSET $3`,
    [catId, limit, offset]
  )

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) FROM subject_items WHERE parent_id = $1`,
    [catId]
  )
  const total = parseInt(countRows[0].count)
  const pages = Math.ceil(total / limit)

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/topics" className="text-green-700 hover:underline">
          الفهارس الموضوعية
        </Link>
        <span>←</span>
        <span className="text-gray-700">{cat.title}</span>
      </div>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-green-900 mb-1">{cat.title}</h1>
          <p className="text-gray-500 text-sm">{total.toLocaleString('ar-SA')} موضوع</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href={`/topics/${catId}/analysis`}
            className="text-xs bg-blue-100 text-blue-800 border border-blue-200 px-3 py-1.5 rounded-full hover:bg-blue-200 transition-colors font-medium"
          >
            التحليل الإسنادي
          </Link>
          <Link
            href={`/search?subject_cat_id=${catId}`}
            className="text-xs bg-green-100 text-green-800 border border-green-200 px-3 py-1.5 rounded-full hover:bg-green-200 transition-colors font-medium"
          >
            البحث في الموضوع
          </Link>
        </div>
      </div>

      {/* Items grid */}
      {items.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center text-gray-500">
          لا توجد موضوعات في هذا القسم
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {items.map(item => {
            const hadithCount = parseInt(item.hadith_count)
            return (
              <Link
                key={item.id}
                href={`/topics/item/${item.id}`}
                className="group flex items-center justify-between bg-white rounded-lg border border-gray-100 px-5 py-3 hover:shadow-sm hover:border-green-200 transition-all"
              >
                <span className="text-green-900 group-hover:text-green-700 font-medium leading-relaxed">
                  {item.title}
                </span>
                <div className="flex items-center gap-3 shrink-0 mr-4">
                  {hadithCount > 0 && (
                    <span className="text-xs text-gray-400 bg-gray-50 rounded-full px-2 py-0.5">
                      {hadithCount.toLocaleString('ar-SA')} حديث
                    </span>
                  )}
                  {!item.is_leaf && (
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

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          {page > 1 && (
            <Link
              href={`/topics/${catId}?page=${page - 1}`}
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
              href={`/topics/${catId}?page=${page + 1}`}
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
