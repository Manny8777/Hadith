'use client'
import { useState } from 'react'
import Link from 'next/link'
import HadithNumber from '@/app/components/HadithNumber'

interface Book { id: number; title: string; takhrij_author: string | null; hadith_count: number }
interface HadithRow {
  main_id: number; book_id: number; tarf: string | null
  tarqeem_harf: string | null; tarqeem_matboa1: string | null
  grade_hint: string | null
}
interface Result {
  hadiths: HadithRow[]
  total: number
  bookATitle: string
  bookBTitle: string
  mode: 'intersection' | 'unique_a'
}

function stripTags(html: string) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export default function IntersectionClient({ books }: { books: Book[] }) {
  const [bookA, setBookA] = useState('')
  const [bookB, setBookB] = useState('')
  const [mode, setMode] = useState<'intersection' | 'unique_a'>('intersection')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const idA = parseInt(bookA)
    const idB = parseInt(bookB)
    if (!bookA || !bookB || isNaN(idA) || isNaN(idB)) { setError('اختر الكتابَين أولاً'); return }
    if (idA === idB) { setError('يجب اختيار كتابَين مختلفَين'); return }
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch(`/api/books/intersection?a=${idA}&b=${idB}&mode=${mode}`)
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setResult(data)
    } catch {
      setError('حدث خطأ في البحث')
    } finally {
      setLoading(false)
    }
  }

  const bookAInfo = books.find(b => b.id === parseInt(bookA))
  const bookBInfo = books.find(b => b.id === parseInt(bookB))

  return (
    <div>
      <form onSubmit={handleSearch} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">الكتاب الأول</label>
            <select
              value={bookA}
              onChange={e => { setBookA(e.target.value); setResult(null) }}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-300 transition-colors"
              dir="rtl"
            >
              <option value="">-- اختر --</option>
              {books.map(b => (
                <option key={b.id} value={b.id}>{b.title} ({b.hadith_count.toLocaleString('ar-EG')} ح)</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">الكتاب الثاني</label>
            <select
              value={bookB}
              onChange={e => { setBookB(e.target.value); setResult(null) }}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-300 transition-colors"
              dir="rtl"
            >
              <option value="">-- اختر --</option>
              {books.filter(b => b.id !== parseInt(bookA)).map(b => (
                <option key={b.id} value={b.id}>{b.title} ({b.hadith_count.toLocaleString('ar-EG')} ح)</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">نوع التحليل:</label>
            <button
              type="button"
              onClick={() => setMode('intersection')}
              className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                mode === 'intersection' ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}
            >
              المتفق عليه
            </button>
            <button
              type="button"
              onClick={() => setMode('unique_a')}
              className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                mode === 'unique_a' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'
              }`}
            >
              منفردات الكتاب الأول
            </button>
          </div>
          <button
            type="submit"
            disabled={loading || !bookA || !bookB}
            className="px-5 py-2 bg-green-700 text-white text-sm font-medium rounded-xl hover:bg-green-800 transition-colors disabled:opacity-50"
          >
            {loading ? 'جاري البحث...' : 'بحث'}
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3 mt-2">
          <strong>المتفق عليه:</strong> أحاديث تشترك فيها الكتب عبر روابط التخريج — يُظهر كلا الروايتَين<br />
          <strong>المنفردات:</strong> أحاديث في الكتاب الأول ليس لها رواية موازية في الكتاب الثاني
        </div>
      </form>

      {result && (
        <div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <h2 className="font-bold text-green-900 text-lg">
              {result.mode === 'intersection' ? 'الأحاديث المشتركة بين' : 'منفردات'}
              {' '}{result.bookATitle}
              {result.mode === 'intersection' && ` و${result.bookBTitle}`}
            </h2>
            <span className="text-sm text-gray-500">
              ({result.total.toLocaleString('ar-EG')} حديث — يُعرض أول 50)
            </span>
          </div>

          {result.hadiths.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
              <p className="text-amber-800">لم يُعثر على أحاديث مشتركة بين هذين الكتابَين في قاعدة التخريج</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {result.hadiths.map(h => {
                return (
                  <Link
                    key={`${h.main_id}-${h.book_id}`}
                    href={`/hadith/${h.main_id}`}
                    className="block bg-white rounded-xl border border-gray-100 px-5 py-4 hover:shadow-md hover:border-green-200 transition-all group"
                  >
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                        h.book_id === parseInt(bookA)
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-purple-50 text-purple-700 border-purple-200'
                      }`}>
                        {h.book_id === parseInt(bookA) ? bookAInfo?.title || '' : bookBInfo?.title || ''}
                      </span>
                      <HadithNumber harf={h.tarqeem_harf} matboa={h.tarqeem_matboa1} />
                      {h.grade_hint && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          h.grade_hint === 'صحيح' ? 'bg-green-100 text-green-700' :
                          h.grade_hint === 'حسن' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-600'
                        }`}>
                          {h.grade_hint}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-800 text-sm leading-relaxed line-clamp-3 group-hover:text-green-900">
                      {stripTags(h.tarf || '').slice(0, 200)}...
                    </p>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
