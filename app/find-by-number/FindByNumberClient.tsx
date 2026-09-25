'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useNumbering } from '@/lib/numberingContext'

interface Book { id: number; title: string; takhrij_author: string | null; takhrij_death: number | null }

export default function FindByNumberClient({ books }: { books: Book[] }) {
  const { pref } = useNumbering()
  const [bookId, setBookId] = useState<string>('')
  const [num, setNum] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<number[] | null>(null)
  const router = useRouter()

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const trimmedNum = num.trim()
    const bid = parseInt(bookId)
    if (!trimmedNum || isNaN(bid)) { setError('اختر كتاباً وأدخل رقم الحديث'); return }

    setLoading(true)
    setError('')
    setResults(null)

    try {
      const res = await fetch(
        `/api/books/${bid}/by-num?num=${encodeURIComponent(trimmedNum)}&pref=${pref}`
      )
      const data = await res.json()
      if (!data.found) {
        setError(`لم يُعثر على الحديث رقم "${trimmedNum}" في هذا الكتاب`)
        return
      }
      if (data.multiple && data.multiple.length > 1) {
        setResults(data.multiple)
      } else {
        router.push(`/hadith/${data.main_id}`)
      }
    } catch {
      setError('حدث خطأ في البحث')
    } finally {
      setLoading(false)
    }
  }

  const selectedBook = books.find(b => b.id === parseInt(bookId))

  return (
    <div>
      <form onSubmit={handleSearch} className="ui-card rounded-2xl p-6 mb-6 font-sans">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">اختر الكتاب</label>
            <select
              value={bookId}
              onChange={e => { setBookId(e.target.value); setError(''); setResults(null) }}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-300 transition-colors"
              dir="rtl"
            >
              <option value="">-- اختر الكتاب --</option>
              {books.map(b => (
                <option key={b.id} value={b.id}>
                  {b.title}
                  {b.takhrij_author ? ` (${b.takhrij_author}${b.takhrij_death ? ` ت${b.takhrij_death}` : ''})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">رقم الحديث</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={num}
                onChange={e => { setNum(e.target.value); setError(''); setResults(null) }}
                placeholder="مثل: 1 أو 1742"
                className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-300 transition-colors"
                dir="ltr"
              />
              <button
                type="submit"
                disabled={loading || !num.trim() || !bookId}
                className="px-4 py-2.5 bg-green-700 text-white text-sm font-medium rounded-xl hover:bg-green-800 transition-colors disabled:opacity-50"
              >
                {loading ? '...' : 'انتقال'}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {selectedBook && !results && (
          <p className="text-xs text-gray-400 mt-3">
            الكتاب المختار: {selectedBook.title}
            {selectedBook.takhrij_author && ` — ${selectedBook.takhrij_author}`}
            {selectedBook.takhrij_death && ` (ت ${selectedBook.takhrij_death} هـ)`}
            {' '}·{' '}
            <Link href={`/books/${selectedBook.id}`} className="text-green-600 hover:underline">
              تصفح الكتاب
            </Link>
          </p>
        )}
      </form>

      {/* Multiple results — rare case where same number matches several entries */}
      {results && results.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-medium text-amber-800 mb-3">
            وُجد أكثر من نتيجة للرقم "{num}" في هذا الكتاب:
          </p>
          <div className="flex flex-wrap gap-2">
            {results.map(id => (
              <Link
                key={id}
                href={`/hadith/${id}`}
                className="text-sm text-green-800 bg-white border border-green-200 px-3 py-1.5 rounded-lg hover:border-green-400 hover:shadow-sm transition-all"
              >
                حديث #{id}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Usage hints */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-blue-900 mb-3">كيفية الاستخدام</h2>
        <ul className="text-sm text-blue-800 space-y-2 leading-relaxed">
          <li>• اختر الكتاب من القائمة — تشمل جميع كتب الموسوعة</li>
          <li>• أدخل رقم الحديث كما ورد في طبعة الكتاب (مثل: 1742 أو 23/أ)</li>
          <li>• ستنتقل مباشرة إلى صفحة الحديث مع كامل بياناته وسنده</li>
          <li>• إذا كان الرقم مشتركاً بين أحاديث متعددة ستظهر الخيارات للاختيار</li>
        </ul>
      </div>
    </div>
  )
}
