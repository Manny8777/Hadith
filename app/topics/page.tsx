export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import TopicSearch from './TopicSearch'

interface Category {
  id: number
  title: string
  parent_id: number
  is_leaf: boolean
  left_value: number
  right_value: number
  item_count: string
  hadith_count: string
}

// Fixed icon set — enough to cover all 13+ top-level categories without repeating
const ICONS = [
  '📖', '🕌', '🌙', '🤲', '📜', '⚖️', '🌿', '📿',
  '🌟', '🏛️', '🌐', '💎', '🔬', '🕋',
]

export default async function TopicsPage() {
  const { rows: categories } = await pool.query<Category>(`
    SELECT
      sc.id,
      sc.title,
      sc.parent_id,
      sc.is_leaf,
      sc.left_value,
      sc.right_value,
      COUNT(DISTINCT child.id) AS item_count,
      COUNT(DISTINCT hs.id)    AS hadith_count
    FROM subject_categories sc
    LEFT JOIN subject_items child
      ON child.left_value  > sc.left_value
     AND child.right_value < sc.right_value
     AND child.is_leaf = true
    LEFT JOIN hadith_subjects hs ON hs.subject_id = child.id
    WHERE sc.parent_id = 1
    GROUP BY sc.id
    ORDER BY sc.left_value
  `)

  // Aggregate totals for header summary
  const totalLeafTopics = categories.reduce((s, c) => s + parseInt(c.item_count), 0)
  const totalHadiths    = categories.reduce((s, c) => s + parseInt(c.hadith_count), 0)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-green-900 mb-2">الفهارس الموضوعية</h1>
        <p className="text-gray-500 text-sm mb-1">
          تصفح الأحاديث النبوية مرتبةً حسب الموضوع
        </p>
        {categories.length > 0 && (
          <p className="text-xs text-gray-400 mb-3">
            {categories.length.toLocaleString('ar-SA')} قسم رئيسي ·{' '}
            {totalLeafTopics.toLocaleString('ar-SA')} موضوع ·{' '}
            {totalHadiths.toLocaleString('ar-SA')} حديث
          </p>
        )}
        <div className="flex gap-3 mb-4 flex-wrap">
          <TopicSearch />
          <Link
            href="/topics/stats"
            className="text-sm bg-amber-50 text-amber-800 border border-amber-200 rounded-xl px-4 py-2 hover:bg-amber-100 transition-colors shrink-0"
          >
            إحصاءات الموضوعات →
          </Link>
          <Link
            href="/topics/companions"
            className="text-sm bg-purple-50 text-purple-800 border border-purple-200 rounded-xl px-4 py-2 hover:bg-purple-100 transition-colors shrink-0"
          >
            الصحابة × الموضوعات →
          </Link>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center text-gray-500">
          <p className="text-lg mb-2">لا توجد فهارس موضوعية بعد</p>
          <p className="text-sm">يرجى تشغيل سكريبت البذر أولاً</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat, idx) => {
            const itemCount   = parseInt(cat.item_count)
            const hadithCount = parseInt(cat.hadith_count)
            return (
              <Link
                key={cat.id}
                href={`/topics/${cat.id}`}
                className="group block bg-white rounded-xl border border-gray-100 p-6 hover:shadow-md hover:border-green-200 transition-all"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl mt-0.5 shrink-0" aria-hidden="true">
                    {ICONS[idx % ICONS.length]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold text-green-900 group-hover:text-green-700 leading-snug">
                      {cat.title}
                    </h2>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      {itemCount > 0 && (
                        <span>{itemCount.toLocaleString('ar-SA')} موضوع</span>
                      )}
                      {hadithCount > 0 && (
                        <span>{hadithCount.toLocaleString('ar-SA')} حديث</span>
                      )}
                    </div>
                  </div>
                  <span className="text-gray-300 group-hover:text-green-400 text-lg transition-colors shrink-0">
                    ←
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
