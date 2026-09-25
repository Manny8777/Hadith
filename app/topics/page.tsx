export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import TopicSearch from './TopicSearch'
import UiIcon, { type IconName } from '@/app/components/UiIcon'

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

// Fixed icon set — enough to cover all top-level categories without repeating.
const ICONS: IconName[] = [
  'lexicon', 'landmark', 'moon', 'handshake', 'scroll', 'scale', 'herb', 'prayer',
  'spark', 'map', 'globe', 'diamond', 'science', 'kaaba',
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
                className="group block rounded-2xl border border-[#ded8c7] bg-white p-5 shadow-[0_1px_0_rgba(18,59,50,0.04)] transition-all hover:-translate-y-0.5 hover:border-[#b28a43] hover:shadow-[0_10px_30px_rgba(18,59,50,0.08)] dark:border-[#2A313A] dark:bg-[#151A21]"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#b28a43]/30 bg-[#f6f1e4] text-[#123b32] dark:bg-[#1d4a3c] dark:text-[#f3e8c9]">
                    <UiIcon name={ICONS[idx % ICONS.length]} size={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold text-[#123b32] group-hover:text-[#8a6726] leading-snug dark:text-[#ECE6DA] dark:group-hover:text-[#E6C77A]">
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
                  <UiIcon name="arrow" size={18} className="shrink-0 text-[#b6aa92] transition-colors group-hover:text-[#8a6726] dark:text-[#6d746e] dark:group-hover:text-[#e6c77a]" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
