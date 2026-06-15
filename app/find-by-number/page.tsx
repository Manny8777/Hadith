export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import FindByNumberClient from './FindByNumberClient'

interface Book { id: number; title: string; takhrij_author: string | null; takhrij_death: number | null }

export default async function FindByNumberPage() {
  const { rows: books } = await pool.query<Book>(
    `SELECT id, title, takhrij_author, takhrij_death
     FROM books
     ORDER BY tarteeb, id`
  )

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900">البحث برقم الحديث</h1>
        <p className="text-sm text-gray-500 mt-1">
          انتقل مباشرة إلى حديث محدد باختيار الكتاب وإدخال رقمه كما ورد في الطبعة المرجعية
        </p>
      </div>

      <FindByNumberClient books={books} />
    </div>
  )
}
