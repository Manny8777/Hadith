'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

interface TopicResult {
  id: number
  title: string
  is_leaf: boolean
  hadith_count: string
}

export default function TopicSearch() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<TopicResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); setOpen(false); return }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/topics/search?q=${encodeURIComponent(q.trim())}`)
        const data = await res.json()
        setResults(data || [])
        setOpen(data?.length > 0)
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [q])

  return (
    <div className="relative max-w-xl" dir="rtl">
      <div className="flex gap-2">
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="ابحث في الموضوعات... (مثال: الصلاة، الزكاة)"
          className="flex-1 min-w-0 border border-gray-300 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-700 focus:border-transparent"
        />
        {loading && (
          <span className="absolute left-3 top-3 text-gray-400 text-xs">...</span>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full right-0 left-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-50 max-h-80 overflow-y-auto">
          {results.map(r => (
            <Link
              key={r.id}
              href={`/topics/item/${r.id}`}
              className="flex items-center justify-between px-4 py-2.5 hover:bg-green-50 border-b border-gray-100 last:border-0 transition-colors"
              onMouseDown={e => e.preventDefault()}
            >
              <span className="text-sm text-green-900 font-medium">{r.title}</span>
              <div className="flex items-center gap-2 shrink-0">
                {parseInt(r.hadith_count) > 0 && (
                  <span className="text-xs text-gray-400">
                    {parseInt(r.hadith_count).toLocaleString('ar-EG')} حديث
                  </span>
                )}
                {!r.is_leaf && (
                  <span className="text-xs bg-amber-50 text-amber-700 rounded-full px-2 py-0.5">فروع</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
