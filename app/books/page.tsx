export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'

interface Book {
  id: number
  title: string
  takhrij_author: string
  takhrij_death: number
  fame: number
  strong: number
  hadith_count: number
}

export default async function BooksPage() {
  const { rows: books } = await pool.query<Book>(
    `SELECT b.id, b.title, b.takhrij_author, b.takhrij_death, b.fame, b.strong,
            COUNT(h.main_id)::int as hadith_count
     FROM books b
     LEFT JOIN hadith_toc h ON h.book_id = b.id AND h.is_leaf = true
     GROUP BY b.id, b.title, b.takhrij_author, b.takhrij_death, b.fame, b.strong
     ORDER BY b.tarteeb, b.id`
  )

  const totalHadiths = books.reduce((s, b) => s + (b.hadith_count || 0), 0)

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-green-900">الكتب الحديثية</h1>
        <span className="text-sm text-gray-500">{books.length} كتاب — {totalHadiths.toLocaleString('ar-EG')} حديث</span>
      </div>

      <div className="grid gap-3">
        {books.map(book => {
          let fameBadge = null
          if (book.fame === 1) fameBadge = <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200">صحيح</span>
          else if (book.fame === 2) fameBadge = <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">حسن</span>
          else if (book.fame === 3) fameBadge = <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full border border-red-200">ضعيف</span>

          return (
            <Link
              key={book.id}
              href={`/books/${book.id}`}
              className="block bg-white rounded-xl border border-gray-100 px-6 py-4 hover:shadow-md hover:border-green-200 transition-all group"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="text-base font-bold text-green-900 group-hover:text-green-700">{book.title}</h2>
                    {fameBadge}
                  </div>
                  {book.takhrij_author && (
                    <p className="text-sm text-gray-500">
                      {book.takhrij_author}
                      {book.takhrij_death ? ` (ت ${book.takhrij_death} هـ)` : ''}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-left">
                  {book.hadith_count > 0 && (
                    <span className="text-green-700 font-bold text-sm">
                      {book.hadith_count.toLocaleString('ar-EG')}
                    </span>
                  )}
                  <div className="text-xs text-gray-400">حديث</div>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
