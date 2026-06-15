import pool from '@/lib/db'
import IntersectionClient from './IntersectionClient'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'تقاطع الكتب — جامع خادم الحرمين' }

interface Book { id: number; title: string; takhrij_author: string | null; hadith_count: number }

export default async function IntersectionPage() {
  const { rows: books } = await pool.query<Book>(
    `SELECT b.id, b.title, b.takhrij_author,
            COUNT(h.main_id)::int AS hadith_count
     FROM books b
     LEFT JOIN hadith_toc h ON h.book_id = b.id AND h.is_leaf = true AND h.is_paragraph = true
     GROUP BY b.id, b.title, b.takhrij_author
     ORDER BY b.tarteeb, b.id`
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
