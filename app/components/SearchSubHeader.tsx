'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { buildSearchUrl } from '@/lib/urlState'
import UiIcon from './UiIcon'

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
    <div className="relative z-10 bg-surface border-b border-border font-sans" dir="rtl">
      <div className="max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
          <form onSubmit={handleSubmit} className="flex flex-1 min-w-0 gap-2" role="search">
            <label htmlFor="global-search" className="sr-only">البحث النصي في الأحاديث</label>
            <input
              id="global-search"
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="بحث نصي في المتون والأطراف..."
              className="flex-1 min-w-0 min-h-11 rounded-full border border-border-warm bg-surface px-4 py-2 text-sm text-ink placeholder:text-muted focus:border-[#C9A96B] focus:outline-none focus:ring-2 focus:ring-[#C9A96B]/20 transition-colors"
              dir="rtl"
              enterKeyHint="search"
            />
            <button
              type="submit"
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-[#C9A96B] px-4 sm:px-5 py-2 text-sm font-semibold text-[#0F3D2E] hover:bg-[#B28F50] transition-colors"
            >
              <UiIcon name="search" size={15} />
              بحث
            </button>
          </form>

          <div className="hidden sm:flex items-center gap-1 sm:gap-2 shrink-0 text-xs sm:text-sm">
            <Link
              href="/find-by-number"
              className="rounded-full border border-border-warm bg-surface px-3 py-1.5 text-ink hover:border-[#C9A96B] hover:bg-paper hover:text-primary transition-colors whitespace-nowrap"
            >
              رقم حديث
            </Link>
            <Link
              href="/hadiths/advanced-research"
              className="rounded-full border border-border-warm bg-surface px-3 py-1.5 text-ink hover:border-[#C9A96B] hover:bg-paper hover:text-primary transition-colors whitespace-nowrap"
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
    <div className="relative z-10 bg-surface border-b border-border font-sans" dir="rtl" aria-hidden>
      <div className="max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-2.5">
        <div className="h-10 rounded-full bg-surface-sunken animate-pulse" />
      </div>
    </div>
  )
}
