export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

interface TreeNode {
  id: number
  text: string
  parent_id: number
  is_leaf: boolean
  left_value: number
  right_value: number
}

interface ContentLink {
  service_main_id: number
  book_name: string | null
  section_text: string | null
  part_text: string | null
  part_num: number | null
  page_num: number | null
}

export default async function ControversialNodePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const nodeId = parseInt(id)
  if (isNaN(nodeId)) notFound()

  const [nodeRes, parentRes] = await Promise.all([
    pool.query<TreeNode>(
      `SELECT id, text, parent_id, is_leaf, left_value, right_value
       FROM hadith_controversial_tree WHERE id = $1`,
      [nodeId]
    ),
    pool.query<TreeNode>(
      `SELECT id, text, parent_id, is_leaf, left_value, right_value
       FROM hadith_controversial_tree
       WHERE id = (SELECT parent_id FROM hadith_controversial_tree WHERE id = $1)`,
      [nodeId]
    ),
  ])

  if (!nodeRes.rows[0]) notFound()
  const node = nodeRes.rows[0]
  const parent = parentRes.rows[0] ?? null

  // Children nodes with leaf counts
  const childrenRes = await pool.query<TreeNode & { leaf_count: number }>(
    `SELECT c.id, c.text, c.parent_id, c.is_leaf, c.left_value, c.right_value,
            (SELECT COUNT(*) FROM hadith_controversial_tree d
             WHERE d.left_value > c.left_value AND d.right_value < c.right_value
               AND d.is_leaf = true)::int AS leaf_count
     FROM hadith_controversial_tree c
     WHERE c.parent_id = $1
     ORDER BY c.left_value`,
    [nodeId]
  )

  // If leaf: get service_content links
  let contentLinks: ContentLink[] = []
  if (node.is_leaf) {
    const linksRes = await pool.query<ContentLink>(
      `SELECT hcd.service_main_id,
              hsc.book_name, hsc.section_text, hsc.part_text, hsc.part_num, hsc.page_num
       FROM hadith_controversial_descriptions hcd
       LEFT JOIN hadith_service_content hsc ON hsc.id = hcd.service_main_id
       WHERE hcd.node_id = $1`,
      [nodeId]
    )
    contentLinks = linksRes.rows
  }

  const children = childrenRes.rows as (TreeNode & { leaf_count: number })[]

  // Breadcrumb: get ancestor path
  const ancestors: TreeNode[] = []
  let cursor = parent
  while (cursor && cursor.parent_id && cursor.parent_id > 0) {
    ancestors.unshift(cursor)
    const r = await pool.query<TreeNode>(
      `SELECT id, text, parent_id, is_leaf FROM hadith_controversial_tree WHERE id = $1`,
      [cursor.parent_id]
    )
    cursor = r.rows[0] ?? null
  }

  return (
    <div dir="rtl" className="max-w-3xl mx-auto">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-xs text-gray-400 mb-6 flex-wrap">
        <Link href="/" className="hover:text-green-700">الرئيسية</Link>
        <span className="text-gray-300">›</span>
        <Link href="/controversial" className="hover:text-green-700">مشكل الحديث</Link>
        {ancestors.map(anc => (
          <span key={anc.id} className="flex items-center gap-1.5">
            <span className="text-gray-300">›</span>
            <Link href={`/controversial/${anc.id}`} className="hover:text-green-700 text-gray-500">
              {anc.text}
            </Link>
          </span>
        ))}
        <span className="text-gray-300">›</span>
        <span className="text-green-800 font-medium">{node.text}</span>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-green-900 mb-2 leading-relaxed">
          {node.text}
        </h1>
        {!node.is_leaf && children.length > 0 && (
          <p className="text-xs text-gray-400">
            {children.reduce((s, c) => s + (c.leaf_count || (c.is_leaf ? 1 : 0)), 0)} مسألة في {children.length} موضوع
          </p>
        )}
      </div>

      {/* Children list (non-leaf) */}
      {children.length > 0 && (
        <section className="mb-8">
          <div className="space-y-2">
            {children.map(child => {
              const displayCount = child.is_leaf ? 0 : (child.leaf_count || 0)
              return (
                <Link
                  key={child.id}
                  href={`/controversial/${child.id}`}
                  className="flex items-start gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 hover:border-green-200 hover:shadow-sm transition-all group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 leading-relaxed group-hover:text-green-800">
                      {child.text}
                    </p>
                    {!child.is_leaf && displayCount > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">{displayCount} مسألة</p>
                    )}
                  </div>
                  <span className="text-gray-300 text-sm group-hover:text-green-400 mt-0.5 shrink-0">←</span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Content links (leaf node) */}
      {node.is_leaf && contentLinks.length > 0 && (
        <section className="mb-8">
          <h2 className="text-base font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">
            المصادر العلمية
          </h2>
          <div className="space-y-2">
            {contentLinks.map(link => (
              <Link
                key={link.service_main_id}
                href={`/service-content/${link.service_main_id}`}
                className="flex items-start gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 hover:border-green-200 hover:shadow-sm transition-all"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-green-700 mb-0.5">{link.book_name}</p>
                  {link.section_text && (
                    <p className="text-xs text-gray-500 mb-0.5">{link.section_text}</p>
                  )}
                  {link.part_text && (
                    <p className="text-sm text-gray-700 line-clamp-2 leading-relaxed">
                      {link.part_text}
                    </p>
                  )}
                </div>
                {(link.part_num || link.page_num) && (
                  <span className="text-xs text-gray-400 shrink-0 mt-0.5">
                    {link.part_num ? `ج${link.part_num}` : ''}{link.page_num ? ` ص${link.page_num}` : ''}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {node.is_leaf && contentLinks.length === 0 && (
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
          لا توجد مصادر مرتبطة بهذه المسألة
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
        <Link href="/controversial" className="text-sm text-green-700 hover:underline">
          ← مشكل الحديث
        </Link>
        {parent && parent.parent_id !== 1 && (
          <Link href={`/controversial/${parent.id}`} className="text-sm text-gray-400 hover:text-green-700 hover:underline">
            {parent.text} ←
          </Link>
        )}
      </div>
    </div>
  )
}