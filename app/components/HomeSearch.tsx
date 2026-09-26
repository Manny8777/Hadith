'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import UiIcon from './UiIcon'

export default function HomeSearch() {
  const [q, setQ] = useState('')
  const router = useRouter()

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (q.trim().length >= 2) router.push(`/search?q=${encodeURIComponent(q.trim())}`)
  }

  return (
    <form onSubmit={handleSearch} className="home-search font-sans" role="search">
      <div className="relative flex-1 min-w-0">
        <label htmlFor="home-search" className="sr-only">البحث في الأحاديث</label>
        <UiIcon name="search" size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#0F3D2E] pointer-events-none" />
        <input
          id="home-search"
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="ابحث في الأحاديث أو الرواة أو الكتب..."
          className="home-search-input"
          dir="rtl"
          autoFocus
          enterKeyHint="search"
        />
      </div>
      <button
        type="submit"
        className="home-search-button"
      >
        <UiIcon name="search" size={17} />
        بحث
      </button>
    </form>
  )
}
