export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'

interface CategoryNode {
  id: number
  text: string
  parent_id: number
  is_leaf: boolean
  left_value: number
  right_value: number
  children_count: number
  leaf_count: number
}

export const metadata = {
  title: 'مشكل الحديث — جامع خادم الحرمين',
}

export default async function ControversialPage() {
  // Get top-level categories (parent_id = 1)
  const { rows: topCats } = await pool.query<CategoryNode>(`
    SELECT ct.id, ct.text, ct.parent_id, ct.is_leaf, ct.left_value, ct.right_value,
           ((ct.right_value - ct.left_value - 1) / 2)::int AS children_count,
           (SELECT COUNT(*) FROM hadith_controversial_tree inner_ct
            WHERE inner_ct.left_value > ct.left_value
              AND inner_ct.right_value < ct.right_value
              AND inner_ct.is_leaf = true)::int AS leaf_count
    FROM hadith_controversial_tree ct
    WHERE ct.parent_id = 1
    ORDER BY ct.left_value
  `)

  const totalLeaves = topCats.reduce((s, c) => s + c.leaf_count, 0)

  return (
    <div dir="rtl" className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-green-900 mb-2">مشكل الحديث</h1>
        <p className="text-gray-600 text-sm leading-relaxed">
          الأحاديث التي أشكلت على العلماء وكيفية الجمع بينها — مرتبة موضوعياً
        </p>
        <p className="text-xs text-gray-400 mt-2">
          {totalLeaves} مسألة في {topCats.length} باب
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {topCats.map(cat => (
          <Link
            key={cat.id}
            href={`/controversial/${cat.id}`}
            className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-5 py-4 hover:border-green-200 hover:shadow-sm transition-all group"
          >
            <div>
              <h2 className="font-semibold text-green-900 group-hover:text-green-700 text-base mb-0.5">
                {cat.text}
              </h2>
              <p className="text-xs text-gray-400">
                {cat.leaf_count} مسألة
              </p>
            </div>
            <span className="text-gray-300 text-lg group-hover:text-green-400 transition-colors">←</span>
          </Link>
        ))}
      </div>

      <div className="mt-8 bg-amber-50 border border-amber-100 rounded-xl p-4 text-xs text-amber-900">
        <p className="font-semibold mb-1">ما هو مشكل الحديث؟</p>
        <p className="leading-relaxed">
          علم مشكل الحديث يُعنى بالأحاديث التي يظهر فيها تعارض أو إشكال في الفهم، سواء
          أكان التعارض بينها وبين القرآن الكريم أم بينها وبين أحاديث أخرى أم بينها وبين
          العقل أو اللغة. ومن أبرز المؤلفات فيه: "شرح مشكل الآثار" للطحاوي.
        </p>
      </div>
    </div>
  )
}