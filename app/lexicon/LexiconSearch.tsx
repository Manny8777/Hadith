'use client'
import { useState } from 'react'
import Link from 'next/link'

interface LexiconItem {
  id: number
  text: string
  results_count: number
}

export default function LexiconSearch() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<LexiconItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const query = q.trim()
    if (query.length < 2) return
    setLoading(true)
    setSearched(true)
    try {
      const res = await fetch(`/api/lexicon?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setResults(data.items || [])
      setTotal(data.total || 0)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <form onSubmit={handleSearch} className="flex gap-3 mb-4">
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="ابحث عن كلمة غريبة..."
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

      {loading && <p className="text-gray-500 text-center py-4">جاري البحث...</p>}

      {!loading && searched && (
        <p className="text-gray-600 mb-3 text-sm">
          {total > 0 ? `${total.toLocaleString('ar')} نتيجة` : 'لا توجد نتائج'}
        </p>
      )}

      {!loading && results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {results.map(item => (
            <Link
              key={item.id}
              href={`/lexicon/${item.id}`}
              className="bg-white rounded-lg border border-amber-100 px-4 py-3 hover:shadow-md hover:border-green-300 transition-all flex items-center justify-between gap-2"
            >
              <span className="text-green-900 font-semibold text-sm leading-relaxed">{item.text}</span>
              {item.results_count > 0 && (
                <span className="text-xs text-amber-600 bg-amber-50 rounded-full px-2 py-0.5 shrink-0">
                  {item.results_count}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
