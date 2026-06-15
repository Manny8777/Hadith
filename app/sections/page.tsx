export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'

interface Section {
  id: number
  name: string
  parent_id: number | null
  is_leaf: boolean
  left_value: number
  right_value: number
}

interface SectionBook {
  id: number
  book_id: number
  section_id: number
  title: string
  fame: number
  strong: number
}

async function getData() {
  const [sectionsRes, booksRes] = await Promise.all([
    pool.query<Section>('SELECT * FROM sections ORDER BY left_value'),
    pool.query<SectionBook>(
      `SELECT sb.id, sb.book_id, sb.section_id, b.title, b.fame, b.strong
       FROM section_books sb
       JOIN books b ON b.id = sb.book_id
       ORDER BY sb.section_id, b.fame DESC`
    )
  ])

  const booksBySection: Record<number, SectionBook[]> = {}
  for (const b of booksRes.rows) {
    if (!booksBySection[b.section_id]) booksBySection[b.section_id] = []
    booksBySection[b.section_id].push(b)
  }

  return { sections: sectionsRes.rows, booksBySection }
}

export default async function SectionsPage() {
  const { sections, booksBySection } = await getData()

  const roots = sections.filter(s => !s.parent_id || s.parent_id === 0)
  const children = sections.filter(s => s.parent_id && s.parent_id !== 0)
  const childrenByParent: Record<number, Section[]> = {}
  for (const c of children) {
    const p = c.parent_id!
    if (!childrenByParent[p]) childrenByParent[p] = []
    childrenByParent[p].push(c)
  }

  const totalBooks = sections.reduce((sum, s) => sum + (booksBySection[s.id]?.length || 0), 0)

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-green-900 mb-2">تصنيف الكتب</h1>
        <p className="text-gray-600 text-sm">
          الكتب مرتبة حسب الموضوع — {sections.length} قسم · {totalBooks} كتاب
        </p>
      </div>

      <div className="space-y-6">
        {roots.map(root => (
          <div key={root.id} className="bg-white rounded-xl border border-amber-100 overflow-hidden">
            <div className="bg-green-800 text-white px-5 py-3">
              <h2 className="text-lg font-bold">{root.name}</h2>
            </div>

            {/* Direct books in root section */}
            {(booksBySection[root.id]?.length ?? 0) > 0 && (
              <div className="px-5 py-3 border-b border-gray-100">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {booksBySection[root.id].map(b => (
                    <Link
                      key={b.book_id}
                      href={`/books/${b.book_id}`}
                      className="flex items-center gap-2 text-sm text-green-800 hover:text-green-600 hover:bg-green-50 rounded-lg px-3 py-2 transition-colors"
                    >
                      <span className="flex-1 truncate">{b.title}</span>
                      {b.strong > 0 && (
                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full shrink-0">عال</span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Child sections */}
            {(childrenByParent[root.id]?.length ?? 0) > 0 && (
              <div className="divide-y divide-gray-50">
                {childrenByParent[root.id].map(child => (
                  <div key={child.id} className="px-5 py-4">
                    <h3 className="text-sm font-semibold text-green-700 mb-2">{child.name}</h3>
                    {(booksBySection[child.id]?.length ?? 0) > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {booksBySection[child.id].map(b => (
                          <Link
                            key={b.book_id}
                            href={`/books/${b.book_id}`}
                            className="flex items-center gap-2 text-sm text-gray-700 hover:text-green-700 hover:bg-green-50 rounded-lg px-3 py-2 transition-colors"
                          >
                            <span className="flex-1 truncate">{b.title}</span>
                            {b.strong > 0 && (
                              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full shrink-0">عال</span>
                            )}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">لا توجد كتب مباشرة في هذا القسم</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
