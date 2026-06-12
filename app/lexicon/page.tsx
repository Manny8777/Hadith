export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import LexiconSearch from './LexiconSearch'

interface LexiconItem {
  id: number
  text: string
  results_count: number
}

async function getTopItems(): Promise<LexiconItem[]> {
  const { rows } = await pool.query(
    `SELECT id, text, results_count
     FROM lexicon_items
     WHERE is_leaf = true
     ORDER BY results_count DESC
     LIMIT 50`
  )
  return rows
}

export default async function LexiconPage() {
  const topItems = await getTopItems()

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-green-900 mb-2">
          غريب الحديث
        </h1>
        <p className="text-gray-600">معجم ألفاظ الحديث النبوي الشريف — شرح الكلمات الغريبة والأماكن والأعلام</p>
      </div>

      <LexiconSearch />

      <div className="mt-10">
        <h2 className="text-lg font-bold text-green-800 mb-4">الأكثر ورودًا في الأحاديث</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {topItems.map(item => (
            <Link
              key={item.id}
              href={`/lexicon/${item.id}`}
              className="bg-white rounded-lg border border-amber-100 px-4 py-3 hover:shadow-md hover:border-green-300 transition-all flex items-center justify-between gap-2"
            >
              <span className="text-green-900 font-semibold text-sm leading-relaxed">{item.text}</span>
              {item.results_count > 0 && (
                <span className="text-xs text-amber-600 bg-amber-50 rounded-full px-2 py-0.5 shrink-0">
                  {item.results_count}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
