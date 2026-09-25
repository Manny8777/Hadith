export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

type BioPart = { type: 'heading' | 'paragraph'; text: string }

function parseAuthorBio(xml: string | null): BioPart[] {
  if (!xml) return []
  const parts: BioPart[] = []
  // Remove outer wrapper
  let content = xml.replace(/<\/?مسألة>/g, '')
  // Split on headings
  const re = /<عنوان_رئيسي>(.*?)<\/عنوان_رئيسي>/g
  let lastIdx = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const before = content.slice(lastIdx, m.index)
    if (before.trim()) {
      const text = before.replace(/<نه\/>/g, '\n').replace(/<[^>]+>/g, '').trim()
      if (text) parts.push({ type: 'paragraph', text })
    }
    parts.push({ type: 'heading', text: m[1].trim() })
    lastIdx = re.lastIndex
  }
  const rest = content.slice(lastIdx)
  if (rest.trim()) {
    const text = rest.replace(/<نه\/>/g, '\n').replace(/<[^>]+>/g, '').trim()
    if (text) parts.push({ type: 'paragraph', text })
  }
  return parts
}

export default async function AuthorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authorId = parseInt(id, 10)
  if (isNaN(authorId)) notFound()

  const [authorRes, booksRes] = await Promise.all([
    pool.query(
      `SELECT id, name, short_name, death_date, info FROM authors WHERE id = $1`,
      [authorId]
    ),
    pool.query(
      `SELECT b.id, b.title,
              (SELECT COUNT(*) FROM hadith_toc WHERE book_id = b.id AND is_leaf = true)::int as hadith_count
       FROM books b WHERE b.author_id = $1 ORDER BY b.id`,
      [authorId]
    ),
  ])

  if (!authorRes.rows[0]) notFound()
  const author = authorRes.rows[0]
  const books = booksRes.rows
  const bioParts = parseAuthorBio(author.info)

  return (
    <div dir="rtl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-5">
        <Link href="/books" className="text-green-700 hover:underline">الكتب</Link>
        <span>←</span>
        <span className="text-gray-700">{author.short_name || author.name.split('،')[0].trim()}</span>
      </div>

      {/* Header */}
      <div className="bg-green-900 text-white rounded-2xl p-6 mb-6">
        <h1 className="text-xl font-bold text-amber-100 leading-snug mb-2">{author.name}</h1>
        <div className="flex items-center gap-3 flex-wrap mt-2">
          {author.short_name && author.short_name !== author.name && (
            <span className="text-amber-200 text-sm">{author.short_name}</span>
          )}
          {author.death_date > 0 && (
            <span className="text-amber-300 text-sm bg-white/10 px-3 py-0.5 rounded-full">
              توفي سنة {author.death_date} هـ
            </span>
          )}
        </div>
      </div>

      {/* Books */}
      {books.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
          <h2 className="font-bold text-green-900 mb-3 flex items-center gap-2">
            كتبه في الموسوعة
            <span className="text-xs text-gray-400 font-normal">({books.length} كتاب)</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {books.map(b => (
              <Link
                key={b.id}
                href={`/books/${b.id}`}
                className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 hover:border-green-300 hover:shadow-sm transition-all group"
              >
                <div className="font-semibold text-green-900 text-sm group-hover:text-green-700 leading-snug">{b.title}</div>
                {b.hadith_count > 0 && (
                  <div className="text-xs text-gray-400 mt-1">
                    {b.hadith_count.toLocaleString('ar-EG')} حديث
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Biography */}
      {bioParts.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-6">
          <h2 className="font-bold text-amber-900 mb-5 text-lg">ترجمة المؤلف</h2>
          <div className="space-y-3">
            {bioParts.map((part, i) => {
              if (part.type === 'heading') {
                return (
                  <h3 key={i} className="font-bold text-green-800 text-base border-r-4 border-green-400 pr-3 mt-6 mb-2">
                    {part.text}
                  </h3>
                )
              }
              return (
                <div key={i} className="text-gray-700 leading-loose text-sm">
                  {part.text.split('\n').map((line, j) =>
                    line.trim() ? <p key={j}>{line.trim()}</p> : null
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
