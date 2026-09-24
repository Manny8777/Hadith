'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { buildSearchUrl } from '@/lib/urlState'

export default function SearchSubHeader() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [q, setQ] = useState('')

  useEffect(() => {
    if (pathname === '/search') {
      setQ(searchParams.get('q') || '')
    }
  }, [pathname, searchParams])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = q.trim()
    if (trimmed.length < 2) return
    // On /search, commit only q: existing source, narrator, grade, subject, depth, scope,
    // matching, catalogue, and pagination state stays in the shareable URL.
    const href = pathname === '/search'
      ? buildSearchUrl(searchParams.toString(), { q: trimmed })
      : `/search?q=${encodeURIComponent(trimmed)}`
    router.push(href, { scroll: false })
  }

  return (
    <div className="relative z-10 bg-white border-b border-gray-200 font-sans" dir="rtl">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-7 py-1.5 sm:py-2">
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
          <form onSubmit={handleSubmit} className="flex flex-1 min-w-0 gap-2" role="search">
            <label htmlFor="global-search" className="sr-only">البحث النصي في الأحاديث</label>
            <input
              id="global-search"
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="بحث نصي في المتون والأطراف..."
              className="flex-1 min-w-0 rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-500 focus:border-green-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-700/15 transition-colors"
              dir="rtl"
              enterKeyHint="search"
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-green-800 px-4 sm:px-5 py-1.5 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
            >
              بحث
            </button>
          </form>

          <div className="hidden sm:flex items-center gap-1 sm:gap-2 shrink-0 text-xs sm:text-sm">
            <Link
              href="/find-by-number"
              className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-gray-700 hover:border-green-300 hover:bg-green-50 hover:text-green-800 transition-colors whitespace-nowrap"
            >
              رقم حديث
            </Link>
            <Link
              href="/hadiths/advanced-research"
              className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-gray-700 hover:border-green-300 hover:bg-green-50 hover:text-green-800 transition-colors whitespace-nowrap"
            >
              بحث متعدد
            </Link>
            <Link
              href="/bio-search"
              className="hidden md:inline-block rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-gray-700 hover:border-green-300 hover:bg-green-50 hover:text-green-800 transition-colors whitespace-nowrap"
            >
              تراجم
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export function SearchSubHeaderFallback() {
  return (
    <div className="relative z-10 bg-white border-b border-gray-200 font-sans" dir="rtl" aria-hidden>
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-7 py-2 sm:py-2.5">
        <div className="h-10 rounded-lg bg-gray-100 animate-pulse" />
      </div>
    </div>
  )
}
