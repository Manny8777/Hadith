'use client'
import { useState, useCallback } from 'react'
import Link from 'next/link'
import { Suspense } from 'react'

const BIO_BOOKS = [
  'تقريب التهذيب',
  'تهذيب الكمال',
  'الكاشف في معرفة من له رواية في الكتب الستة',
  'تهذيب التهذيب',
  'الجرح والتعديل لابن أبي حاتم',
  'لسان الميزان',
  'سير أعلام النبلاء',
  'الإصابة في تمييز الصحابة',
  'الكامل في الضعفاء',
  'تاريخ الإسلام',
  'تاريخ بغداد',
  'الثقات',
  'تحفة التحصيل في المراسيل',
  'تعريف أهل التقديس',
]

interface BioResult {
  narrator_id: number
  book_name: string
  title: string
  excerpt: string
  narrator_name: string
  abb_name: string | null
  martaba_ibn_hajar: string | null
  is_companion: boolean
}

function gradeColor(grade: string | null) {
  if (!grade) return 'bg-gray-100 text-gray-500'
  if (/ثقة|صحيح|عدل|صحابي/.test(grade)) return 'bg-green-100 text-green-700'
  if (/صدوق|حسن|مقبول/.test(grade)) return 'bg-amber-100 text-amber-700'
  if (/ضعيف|منكر|متروك|كذاب/.test(grade)) return 'bg-red-100 text-red-600'
  return 'bg-gray-100 text-gray-500'
}

function BioSearchInner() {
  const [q, setQ] = useState('')
  const [bookFilter, setBookFilter] = useState('')
  const [results, setResults] = useState<BioResult[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [currentQ, setCurrentQ] = useState('')
  const [currentBook, setCurrentBook] = useState('')

  const doSearch = useCallback(async (query: string, book: string, pg = 1) => {
    if (query.length < 3) return
    setLoading(true)
    setSearched(true)
    setCurrentQ(query)
    setCurrentBook(book)
    try {
      let url = `/api/bio-search?q=${encodeURIComponent(query)}&page=${pg}`
      if (book) url += `&book=${encodeURIComponent(book)}`
      const res = await fetch(url)
      const data = await res.json()
      if (pg === 1) {
        setResults(data.results || [])
      } else {
        setResults(prev => [...prev, ...(data.results || [])])
      }
      setHasMore(data.hasMore || false)
      setPage(pg)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    doSearch(q.trim(), bookFilter)
  }

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-2">البحث في كتب التراجم</h1>
        <p className="text-gray-500 text-sm">
          ابحث في نصوص تقريب التهذيب، وتهذيب الكمال، والكاشف، وسائر كتب الرجال والتراجم
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mb-8 space-y-3">
        <div className="flex gap-3">
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ابحث في نصوص كتب الرجال... (3 أحرف على الأقل)"
            className="flex-1 border border-gray-300 rounded-lg px-4 py-3 text-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-green-700"
            dir="rtl"
          />
          <button
            type="submit"
            disabled={q.trim().length < 3}
            className="bg-green-900 text-white px-6 py-3 rounded-lg hover:bg-green-800 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            بحث
          </button>
        </div>
        <select
          value={bookFilter}
          onChange={e => setBookFilter(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-4 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-700"
          dir="rtl"
        >
          <option value="">جميع كتب الرجال والتراجم</option>
          {BIO_BOOKS.map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <p className="text-xs text-gray-400">
          مثال: ابحث عن اسم شيخ، أو مدينة، أو صفة (تدليس، إرسال، أخطأ فيه...)
        </p>
      </form>

      {loading && page === 1 && <p className="text-gray-500 text-center py-8">جاري البحث في كتب التراجم...</p>}

      {!loading && searched && results.length === 0 && (
        <p className="text-gray-400 text-center py-8">لا توجد نتائج — حاول بمصطلح أكثر تحديداً</p>
      )}

      {results.length > 0 && (
        <div>
          <p className="text-sm text-gray-500 mb-4">
            {results.length}{hasMore ? '+' : ''} نتيجة لـ "<strong className="text-green-800">{currentQ}</strong>"
          </p>

          <div className="space-y-4">
            {results.map((r, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 hover:border-green-200 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/narrator/${r.narrator_id}`}
                      className="font-bold text-green-800 hover:text-green-600 hover:underline"
                    >
                      {r.narrator_name}
                    </Link>
                    {r.is_companion && (
                      <span className="bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">صحابي</span>
                    )}
                    {r.martaba_ibn_hajar && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${gradeColor(r.martaba_ibn_hajar)}`}>
                        {r.martaba_ibn_hajar}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded font-medium">
                    {r.book_name}
                  </span>
                </div>
                {r.title && r.title !== r.book_name && (
                  <p className="text-xs text-gray-400 mb-2">{r.title}</p>
                )}
                <p className="text-sm text-gray-700 leading-7" dir="rtl">
                  {r.excerpt.split(/(【[^】]*】)/).map((part, pi) =>
                    part.startsWith('【') && part.endsWith('】') ? (
                      <mark key={pi} className="bg-amber-200 text-amber-900 rounded px-0.5 not-italic font-semibold">
                        {part.slice(1, -1)}
                      </mark>
                    ) : (
                      <span key={pi}>{part}</span>
                    )
                  )}
                </p>
                <div className="mt-3">
                  <Link
                    href={`/narrator/${r.narrator_id}`}
                    className="text-xs text-green-700 hover:underline"
                  >
                    عرض ترجمة كاملة ←
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {hasMore && (
            <div className="mt-6 text-center">
              <button
                onClick={() => doSearch(currentQ, currentBook, page + 1)}
                disabled={loading}
                className="px-8 py-3 bg-white border border-gray-200 rounded-xl text-green-800 hover:border-green-300 hover:shadow-sm transition-all text-sm disabled:opacity-50"
              >
                {loading ? 'جاري التحميل...' : 'تحميل المزيد'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function BioSearchPage() {
  return (
    <Suspense fallback={<div className="text-gray-500 py-8 text-center">تحميل...</div>}>
      <BioSearchInner />
    </Suspense>
  )
}
