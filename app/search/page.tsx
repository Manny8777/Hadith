'use client'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'

interface SearchResult {
  main_id: number
  book_id: number
  book_name: string
  tarf: string
  section_text: string
  chapter_text: string
  part_num: number
  page_num: number
}

interface Book { id: number; title: string }

function stripTags(html: string) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function SearchInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialQ = searchParams.get('q') || ''
  const initialBookId = searchParams.get('book_id') || ''
  const narratorIdParam = searchParams.get('narrator_id') || ''
  const narratorNameParam = searchParams.get('narrator_name') || ''

  const [q, setQ] = useState(initialQ)
  const [bookId, setBookId] = useState(initialBookId)
  const [books, setBooks] = useState<Book[]>([])
  const [results, setResults] = useState<SearchResult[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    fetch('/api/books')
      .then(r => r.json())
      .then(data => setBooks(Array.isArray(data) ? data : data.books || []))
      .catch(() => {})
  }, [])

  const doSearch = useCallback(async (query: string, bId: string, pg = 1, nid = '') => {
    setLoading(true)
    setSearched(true)
    try {
      let url: string
      if (nid) {
        url = `/api/search?narrator_id=${encodeURIComponent(nid)}&page=${pg}`
      } else {
        if (query.trim().length < 2) { setLoading(false); return }
        url = `/api/search?q=${encodeURIComponent(query)}&page=${pg}`
        if (bId) url += `&book_id=${encodeURIComponent(bId)}`
      }
      const res = await fetch(url)
      const data = await res.json()
      setResults(data.results || [])
      setTotal(data.total || 0)
      setPage(pg)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (narratorIdParam) {
      doSearch('', '', 1, narratorIdParam)
    } else if (initialQ.length >= 2) {
      doSearch(initialQ, initialBookId)
    }
  }, [narratorIdParam, initialQ, initialBookId, doSearch])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = q.trim()
    let url = `/search?q=${encodeURIComponent(trimmed)}`
    if (bookId) url += `&book_id=${encodeURIComponent(bookId)}`
    router.push(url)
    doSearch(trimmed, bookId)
  }

  const totalPages = Math.ceil(total / 20)

  // Narrator mode: show results for a specific narrator in isnad
  const isNarratorMode = !!narratorIdParam

  return (
    <div dir="rtl">
      <h1 className="text-3xl font-bold text-green-900 mb-6">البحث في الأحاديث</h1>

      {/* Narrator mode banner */}
      {isNarratorMode && narratorNameParam && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 flex items-center justify-between">
          <div className="text-sm text-amber-800">
            عرض الأحاديث التي يروي فيها:
            <Link href={`/narrator/${narratorIdParam}`} className="font-bold text-green-800 hover:underline mr-2">
              {narratorNameParam}
            </Link>
          </div>
          <Link href="/search" className="text-xs text-gray-400 hover:text-gray-600">
            بحث نصي
          </Link>
        </div>
      )}

      {/* Text search form (hidden in narrator mode) */}
      {!isNarratorMode && (
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="flex gap-3 mb-3">
            <input
              type="text"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="ابحث في الأحاديث النبوية..."
              className="flex-1 border border-gray-300 rounded-lg px-4 py-3 text-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-green-700"
              dir="rtl"
            />
            <button
              type="submit"
              className="bg-green-900 text-white px-6 py-3 rounded-lg hover:bg-green-800 transition-colors font-semibold"
            >
              بحث
            </button>
          </div>

          <div className="flex gap-3 items-center">
            <label className="text-sm text-gray-600 shrink-0">تصفية حسب الكتاب:</label>
            <select
              value={bookId}
              onChange={e => setBookId(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
              dir="rtl"
            >
              <option value="">جميع الكتب</option>
              {books.map(b => (
                <option key={b.id} value={String(b.id)}>{b.title}</option>
              ))}
            </select>
            {bookId && (
              <button
                type="button"
                onClick={() => { setBookId(''); doSearch(q, '') }}
                className="text-sm text-gray-500 hover:text-red-600 transition-colors shrink-0"
              >
                مسح الفلتر
              </button>
            )}
          </div>
        </form>
      )}

      {loading && <p className="text-gray-500 text-center py-8">جاري البحث...</p>}

      {!loading && searched && (
        <p className="text-gray-600 mb-4">
          {total > 0 ? (
            <>
              <span className="font-semibold">{total.toLocaleString('ar-EG')}</span> حديث
              {bookId && books.length > 0 && (
                <span className="text-amber-700 mr-2">
                  — في: {books.find(b => String(b.id) === bookId)?.title || ''}
                </span>
              )}
            </>
          ) : (
            'لا توجد نتائج'
          )}
        </p>
      )}

      <div className="grid gap-4">
        {results.map(r => (
          <Link
            key={r.main_id}
            href={`/hadith/${r.main_id}`}
            className="block bg-white rounded-lg border border-gray-100 px-5 py-4 hover:shadow-md hover:border-green-200 transition-all"
          >
            <div className="text-xs text-green-700 mb-2 font-semibold">{r.book_name}</div>
            {(r.section_text?.trim() || r.chapter_text?.trim()) && (
              <div className="text-xs text-gray-500 mb-2">
                {r.section_text?.trim()} {r.chapter_text?.trim()}
              </div>
            )}
            <p className="text-gray-800 text-sm leading-relaxed line-clamp-4">
              {stripTags(r.tarf).slice(0, 300) || '...'}
            </p>
            {(r.part_num > 0 || r.page_num > 0) && (
              <span className="text-xs text-gray-400 mt-2 block">
                ج{r.part_num} ص{r.page_num}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2 flex-wrap">
          {page > 1 && (
            <button
              onClick={() => doSearch(q, bookId, page - 1, narratorIdParam)}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm"
            >
              السابق
            </button>
          )}
          {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
            let pg: number
            if (totalPages <= 7) pg = i + 1
            else if (page <= 4) pg = i + 1
            else if (page >= totalPages - 3) pg = totalPages - 6 + i
            else pg = page - 3 + i
            return (
              <button
                key={pg}
                onClick={() => doSearch(q, bookId, pg, narratorIdParam)}
                className={`px-4 py-2 rounded-lg border text-sm ${
                  pg === page
                    ? 'bg-green-800 text-white border-green-800'
                    : 'border-gray-200 bg-white text-green-800 hover:border-green-300'
                }`}
              >
                {pg.toLocaleString('ar-EG')}
              </button>
            )
          })}
          {page < totalPages && (
            <button
              onClick={() => doSearch(q, bookId, page + 1, narratorIdParam)}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm"
            >
              التالي
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="text-gray-500 py-8 text-center">تحميل...</div>}>
      <SearchInner />
    </Suspense>
  )
}
