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
}

export default async function BooksPage() {
  const { rows: books } = await pool.query<Book>(
    `SELECT id, title, takhrij_author, takhrij_death, fame, strong
     FROM books ORDER BY tarteeb, id`
  )

  return (
    <div>
      <h1 className="text-3xl font-bold text-green-900 mb-6">الكتب</h1>
      <p className="text-gray-500 mb-6">{books.length} كتاب</p>
      <div className="grid gap-3">
        {books.map(book => (
          <Link
            key={book.id}
            href={`/books/${book.id}`}
            className="block bg-white rounded-lg border border-gray-100 px-6 py-4 hover:shadow-md hover:border-green-200 transition-all"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-green-900">{book.title}</h2>
                {book.takhrij_author && (
                  <p className="text-sm text-gray-600 mt-1">
                    {book.takhrij_author}
                    {book.takhrij_death ? ` (ت ${book.takhrij_death} هـ)` : ''}
                  </p>
                )}
              </div>
              <span className="text-gray-400 text-xl">←</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
