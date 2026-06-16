export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'

interface Book {
  id: number
  title: string
  takhrij_author: string
  takhrij_death: number
  strong: number
  hadith_count: number
}

function classifyBook(title: string): { label: string; color: string } {
  if (/صحيح|المستدرك|الأحاديث المختارة/.test(title))
    return { label: 'الصحاح', color: 'text-green-700' }
  if (/مسند|مسانيد|المطالب/.test(title))
    return { label: 'المسانيد', color: 'text-blue-700' }
  if (/مصنف/.test(title))
    return { label: 'المصنفات', color: 'text-purple-700' }
  if (/معجم/.test(title))
    return { label: 'المعاجم', color: 'text-amber-700' }
  if (/شمائل/.test(title))
    return { label: 'الشمائل', color: 'text-rose-600' }
  if (/مراسيل/.test(title))
    return { label: 'المراسيل', color: 'text-orange-600' }
  if (/موطأ|سنن|جامع|منتقى/.test(title))
    return { label: 'السنن', color: 'text-teal-700' }
  return { label: 'أخرى', color: 'text-gray-500' }
}

export default async function BooksPage() {
  const { rows: books } = await pool.query<Book>(
    `SELECT id, title, takhrij_author, takhrij_death, strong, hadith_count
     FROM (
       SELECT b.id, b.title, b.takhrij_author, b.takhrij_death, b.strong,
              COUNT(h.main_id)::int AS hadith_count,
              ROW_NUMBER() OVER (PARTITION BY b.title ORDER BY COUNT(h.main_id) DESC, b.id) AS rn
       FROM books b
       LEFT JOIN hadith_toc h ON h.book_id = b.id AND h.is_leaf = true
       WHERE b.strong > 0
       GROUP BY b.id, b.title, b.takhrij_author, b.takhrij_death, b.strong
     ) t
     WHERE rn = 1
     ORDER BY strong, id`
  )

  const totalHadiths = books.reduce((s, b) => s + (b.hadith_count || 0), 0)

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-green-900 font-display">كتب المتون الحديثية</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/books/service-books" className="text-xs bg-purple-100 text-purple-800 border border-purple-200 px-3 py-1.5 rounded-full hover:bg-purple-200 transition-colors font-medium">الكتب الخدمية</Link>
          <Link href="/books/stats" className="text-xs bg-green-100 text-green-800 border border-green-200 px-3 py-1.5 rounded-full hover:bg-green-200 transition-colors font-medium">إحصاءات الدرجات</Link>
          <Link href="/books/timeline" className="text-xs bg-amber-100 text-amber-800 border border-amber-200 px-3 py-1.5 rounded-full hover:bg-amber-200 transition-colors font-medium">تاريخية التدوين</Link>
          <Link href="/books/compare" className="text-xs bg-cyan-100 text-cyan-800 border border-cyan-200 px-3 py-1.5 rounded-full hover:bg-cyan-200 transition-colors font-medium">مقارنة الكتب</Link>
        </div>
      </div>

      <div className="ui-card overflow-x-auto">
        <table className="w-full text-[15px] min-w-[640px]" dir="rtl">
          <thead>
            <tr className="bg-green-50 border-b border-green-100 text-green-900 text-xs">
              <th className="px-3 py-2.5 text-center font-semibold w-12">م ({books.length})</th>
              <th className="px-4 py-2.5 text-right font-semibold">الكتاب</th>
              <th className="px-3 py-2.5 text-center font-semibold">التصنيف</th>
              <th className="px-3 py-2.5 text-center font-semibold">المصنف</th>
              <th className="px-3 py-2.5 text-center font-semibold">الوفاة</th>
              <th className="px-3 py-2.5 text-center font-semibold">الأحاديث</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {books.map((book, i) => {
              const cls = classifyBook(book.title)
              return (
                <tr key={book.id} className="hover:bg-green-50 transition-colors group">
                  <td className="px-3 py-2 text-center text-gray-400 text-xs">{(i + 1).toLocaleString('ar-EG')}</td>
                  <td className="px-4 py-2">
                    <Link href={`/books/${book.id}`} className="font-medium text-green-900 group-hover:text-green-700 hover:underline">
                      {book.title}
                    </Link>
                  </td>
                  <td className={`px-3 py-2 text-center text-xs font-medium ${cls.color}`}>{cls.label}</td>
                  <td className="px-3 py-2 text-center text-gray-600">{book.takhrij_author || '—'}</td>
                  <td className="px-3 py-2 text-center text-gray-500">{book.takhrij_death || '—'}</td>
                  <td className="px-3 py-2 text-center text-gray-600 font-medium">
                    {book.hadith_count > 0 ? book.hadith_count.toLocaleString('ar-EG') : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
              <td colSpan={5} className="px-4 py-2 text-right font-medium">المجموع</td>
              <td className="px-3 py-2 text-center font-bold text-green-800">{totalHadiths.toLocaleString('ar-EG')}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
