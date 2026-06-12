export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

interface TocRow {
  main_id: number
  id: number
  parent_id: number
  content: string
  is_leaf: boolean
  is_paragraph: boolean
  section_text: string
  chapter_text: string
  part_num: number
  page_num: number
  tarf: string
  left_value: number
  right_value: number
  tarqeem_harf: string
  tarqeem_matboa1: string
}

function stripTags(html: string): string {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const bookId = parseInt(id)

  const [bookRes, tocRes] = await Promise.all([
    pool.query('SELECT * FROM books WHERE id = $1', [bookId]),
    pool.query(
      `SELECT main_id, id, parent_id, is_leaf, is_paragraph, content,
              section_text, chapter_text, part_num, page_num, tarf,
              left_value, right_value, tarqeem_harf, tarqeem_matboa1
       FROM hadith_toc
       WHERE book_id = $1
       ORDER BY left_value
       LIMIT 500`,
      [bookId]
    ),
  ])

  if (!bookRes.rows[0]) notFound()
  const book = bookRes.rows[0]
  const toc: TocRow[] = tocRes.rows

  // Get top-level chapters (direct children of book root)
  const rootNode = toc.find(r => r.parent_id === 0 || r.parent_id === null)
  const rootId = rootNode?.main_id

  const chapters = toc.filter(r =>
    r.parent_id === rootId && !r.is_leaf
  )

  // Get first 50 leaf (hadith) entries for quick view
  const leaves = toc.filter(r => r.is_leaf && r.is_paragraph).slice(0, 50)

  return (
    <div>
      <Link href="/books" className="text-green-700 hover:underline text-sm">← الكتب</Link>

      <h1 className="text-3xl font-bold text-green-900 mt-4 mb-2">{book.title}</h1>
      {book.takhrij_author && (
        <p className="text-gray-600 mb-6">
          {book.takhrij_author}
          {book.takhrij_death ? ` (ت ${book.takhrij_death} هـ)` : ''}
        </p>
      )}

      {chapters.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-green-800 mb-3">فهرس الكتاب</h2>
          <div className="grid gap-2">
            {chapters.map(ch => (
              <div key={ch.main_id} className="bg-white rounded-lg border border-gray-100 px-5 py-3">
                <p className="font-semibold text-gray-800">{stripTags(ch.content) || ch.chapter_text || ch.section_text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {leaves.length > 0 && (
        <div>
          <h2 className="text-xl font-bold text-green-800 mb-3">الأحاديث</h2>
          <div className="grid gap-3">
            {leaves.map(h => (
              <Link
                key={h.main_id}
                href={`/hadith/${h.main_id}`}
                className="block bg-white rounded-lg border border-gray-100 px-5 py-4 hover:shadow-md hover:border-green-200 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <p className="text-gray-800 text-sm leading-relaxed line-clamp-3">
                    {stripTags(h.tarf || h.content).slice(0, 200)}
                  </p>
                  {(h.part_num > 0 || h.page_num > 0) && (
                    <span className="text-xs text-gray-400 whitespace-nowrap mt-1">
                      ج{h.part_num} ص{h.page_num}
                    </span>
                  )}
                </div>
                {h.tarqeem_harf && h.tarqeem_harf.trim() && (
                  <span className="text-xs text-green-700 mt-2 block">رقم: {h.tarqeem_harf.trim()}</span>
                )}
              </Link>
            ))}
          </div>
          {toc.filter(r => r.is_leaf && r.is_paragraph).length > 50 && (
            <p className="text-center text-gray-400 mt-4 text-sm">
              تعرض أول 50 حديث — استخدم البحث لاستعراض المزيد
            </p>
          )}
        </div>
      )}
    </div>
  )
}
