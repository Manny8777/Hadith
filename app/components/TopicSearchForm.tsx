'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { buildTopicUrl } from '@/lib/urlState'

export default function TopicSearchForm({
  itemId,
  currentQuery,
  initialQuery,
}: {
  itemId: number
  currentQuery: string
  initialQuery: string
}) {
  const router = useRouter()
  const [query, setQuery] = useState(initialQuery)

  useEffect(() => {
    setQuery(initialQuery)
  }, [initialQuery])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = query.trim()
    setQuery(trimmed)
    router.push(buildTopicUrl(itemId, currentQuery, { q: trimmed }), { scroll: false })
  }

  function clearQuery(event: React.MouseEvent<HTMLAnchorElement>) {
    // A route-level filter change belongs in browser history, just like grade/view/page changes.
    event.preventDefault()
    setQuery('')
    router.push(buildTopicUrl(itemId, currentQuery, { q: '' }), { scroll: false })
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4" role="search" aria-label="البحث داخل أحاديث الموضوع">
      <div className="flex gap-2">
        <label htmlFor="topic-q" className="sr-only">نص البحث داخل الموضوع</label>
        <input
          id="topic-q"
          type="search"
          name="q"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="ابحث في أحاديث هذا الموضوع..."
          className="flex-1 min-w-0 border border-gray-300 rounded-lg px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-700"
          dir="rtl"
        />
        <button
          type="submit"
          className="bg-green-900 text-white px-4 py-2 rounded-lg hover:bg-green-800 transition-colors text-sm font-medium"
        >
          بحث
        </button>
        {initialQuery && (
          <Link
            href={buildTopicUrl(itemId, currentQuery, { q: '' })}
            onClick={clearQuery}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            مسح
          </Link>
        )}
      </div>
    </form>
  )
}
