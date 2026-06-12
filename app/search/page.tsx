'use client'
import { useState, useEffect } from 'react'
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

function stripTags(html: string) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function SearchInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialQ = searchParams.get('q') || ''

  const [q, setQ] = useState(initialQ)
  const [results, setResults] = useState<SearchResult[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    if (initialQ.length >= 2) doSearch(initialQ)
  }, [initialQ])

  async function doSearch(query: string) {
    if (query.trim().length < 2) return
    setLoading(true)
    setSearched(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setResults(data.results || [])
      setTotal(data.total || 0)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    router.push(`/search?q=${encodeURIComponent(q.trim())}`)
    doSearch(q)
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-green-900 mb-6">البحث في الأحاديث</h1>

      <form onSubmit={handleSubmit} className="flex gap-3 mb-8">
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
      </form>

      {loading && <p className="text-gray-500 text-center py-8">جاري البحث...</p>}

      {!loading && searched && (
        <p className="text-gray-600 mb-4">
          {total > 0 ? `${total.toLocaleString('ar')} نتيجة` : 'لا توجد نتائج'}
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
