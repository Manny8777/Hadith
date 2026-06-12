import pool from '@/lib/db'
import Link from 'next/link'

interface TakhrijRow {
  main_id: number
  book_id: number
  book_name: string | null
  book_title: string | null
  tarf: string | null
  part_num: number
  page_num: number
}

function stripTags(html: string): string {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchTakhrij(hadithId: number): Promise<TakhrijRow[]> {
  // Get the group_id for this hadith
  const groupRes = await pool.query(
    `SELECT group_id FROM takhrij WHERE hadith_id = $1`,
    [hadithId]
  )
  if (!groupRes.rows[0]) return []

  const groupId = groupRes.rows[0].group_id

  // Find all other hadiths in the same group
  const result = await pool.query(
    `SELECT
       t.hadith_id  AS main_id,
       t.book_id,
       h.book_name,
       b.title      AS book_title,
       h.tarf,
       h.part_num,
       h.page_num
     FROM takhrij t
     JOIN hadith_toc h ON h.main_id = t.hadith_id
     JOIN books b ON b.id = t.book_id
     WHERE t.group_id = $1
       AND t.hadith_id != $2
     ORDER BY t.book_id, t.hadith_id
     LIMIT 50`,
    [groupId, hadithId]
  )

  return result.rows as TakhrijRow[]
}

export default async function TakhrijSection({ hadithId }: { hadithId: number }) {
  const rows = await fetchTakhrij(hadithId)

  if (rows.length === 0) return null

  // Group by book for display
  const books = new Map<number, { title: string; name: string | null; hadiths: TakhrijRow[] }>()
  for (const row of rows) {
    if (!books.has(row.book_id)) {
      books.set(row.book_id, {
        title: row.book_title || row.book_name || `كتاب ${row.book_id}`,
        name: row.book_name,
        hadiths: [],
      })
    }
    books.get(row.book_id)!.hadiths.push(row)
  }

  const bookCount = books.size

  return (
    <div className="mt-6 bg-amber-50 rounded-xl border border-amber-200 p-5" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-green-800 text-lg">
          التخريج — الحديث في كتب أخرى
        </h2>
        <span className="bg-green-100 text-green-800 text-sm font-medium px-3 py-1 rounded-full border border-green-200">
          يوجد في {bookCount} {bookCount === 1 ? 'كتاب' : 'كتاب'}
        </span>
      </div>

      <div className="grid gap-3">
        {Array.from(books.entries()).map(([bookId, book]) => (
          <div key={bookId} className="bg-white rounded-lg border border-amber-100 p-4">
            <p className="font-bold text-green-700 text-sm mb-2">{book.title}</p>
            <div className="grid gap-2">
              {book.hadiths.map((row) => (
                <Link
                  key={row.main_id}
                  href={`/hadith/${row.main_id}`}
                  className="block text-sm text-gray-700 hover:text-green-700 hover:bg-amber-50 rounded p-2 -mx-2 transition-colors"
                >
                  <span className="text-gray-400 text-xs ml-2">
                    {row.part_num > 0 && `ج${row.part_num}`}
                    {row.page_num > 0 && ` ص${row.page_num}`}
                  </span>
                  <span className="leading-relaxed">
                    {row.tarf ? stripTags(row.tarf).substring(0, 120) : `حديث رقم ${row.main_id}`}
                    {row.tarf && stripTags(row.tarf).length > 120 ? '…' : ''}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
