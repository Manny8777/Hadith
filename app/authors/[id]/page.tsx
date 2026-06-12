export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

function stripXml(text: string): string {
  return (text || '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/gm, '')
    .trim()
}

export default async function AuthorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authorId = parseInt(id, 10)
  if (isNaN(authorId)) notFound()

  const [authorRes, booksRes] = await Promise.all([
    pool.query(`SELECT * FROM authors WHERE id = $1`, [authorId]),
    pool.query(
      `SELECT b.id, b.title,
              (SELECT COUNT(*) FROM hadith_toc WHERE book_id = b.id AND is_leaf = true AND is_paragraph = true) as hadith_count
       FROM books b WHERE b.author_id = $1 ORDER BY b.id`,
      [authorId]
    ),
  ])

  if (!authorRes.rows[0]) notFound()
  const author = authorRes.rows[0]
  const books = booksRes.rows

  const bioText = author.info ? stripXml(author.info) : ''

  return (
    <div dir="rtl" className="min-h-screen bg-amber-50">
      <header className="bg-green-900 text-white shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-5">
          <Link href="/books" className="text-amber-300 hover:text-amber-100 text-sm block mb-3">← الكتب</Link>
          <h1 className="text-xl font-bold text-amber-100">{author.name}</h1>
          {author.short_name && author.short_name !== author.name && (
            <p className="text-amber-200/70 text-sm mt-1">{author.short_name}</p>
          )}
          {author.death_date > 0 && (
            <p className="text-amber-300 text-sm mt-1">توفي سنة {author.death_date} هـ</p>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Books by this author */}
        {books.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-base font-bold text-green-900 mb-4 flex items-center gap-2">
              <span className="w-1 h-4 bg-green-500 rounded-full inline-block"></span>
              كتبه في قاعدة البيانات
              <span className="text-sm font-normal text-gray-400">({books.length} كتاب)</span>
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {books.map(b => (
                <Link
                  key={b.id}
                  href={`/books/${b.id}`}
                  className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 hover:border-green-200 hover:shadow-sm transition-all group"
                >
                  <div className="font-semibold text-green-900 text-sm group-hover:text-green-700 leading-snug">{b.title}</div>
                  {parseInt(b.hadith_count) > 0 && (
                    <div className="text-xs text-gray-400 mt-1">
                      {parseInt(b.hadith_count).toLocaleString('ar-EG')} حديث
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Author biography */}
        {bioText && (
          <div className="bg-white rounded-2xl border border-amber-100 p-6">
            <h2 className="text-base font-bold text-amber-900 mb-4 flex items-center gap-2">
              <span className="w-1 h-4 bg-amber-500 rounded-full inline-block"></span>
              ترجمة المؤلف
            </h2>
            <div className="text-sm text-gray-800 leading-8 whitespace-pre-line">
              {bioText.slice(0, 5000)}
              {bioText.length > 5000 && (
                <span className="text-gray-400"> ... (النص مختصر)</span>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
