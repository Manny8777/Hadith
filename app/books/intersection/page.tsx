import pool from '@/lib/db'
import IntersectionClient from './IntersectionClient'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'تقاطع الكتب — جامع خادم الحرمين' }

interface Book { id: number; title: string; takhrij_author: string | null; hadith_count: number }

export default async function IntersectionPage() {
  // Only books that have takhrij links can share hadiths with another book, and the search below
  // works on those links — so list exactly those books, counting the hadiths each has in takhrij.
  const { rows: books } = await pool.query<Book>(
    `SELECT b.id, b.title, b.takhrij_author, t.hadith_count
     FROM (
       SELECT book_id, COUNT(DISTINCT hadith_id)::int AS hadith_count
       FROM takhrij
       WHERE book_id IS NOT NULL
       GROUP BY book_id
     ) t
     JOIN books b ON b.id = t.book_id
     ORDER BY b.strong ASC NULLS LAST, b.tarteeb, b.id`
  )

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">تقاطع الكتب</h1>
        <p className="text-sm text-gray-500">
          استكشف الأحاديث المشتركة بين كتابَين عبر روابط التخريج، أو انفردات كتاب عن آخر
        </p>
      </div>
      <IntersectionClient books={books} />
    </div>
  )
}
