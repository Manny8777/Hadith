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
    <form onSubmit={handleSearch} className="w-full max-w-2xl flex flex-col sm:flex-row gap-2 sm:gap-3 font-sans">
      <div className="relative flex-1 min-w-0">
        <UiIcon name="search" size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8a7c6a] pointer-events-none" />
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="ابحث في متون الأحاديث النبوية..."
          className="w-full border border-[#d8cdba] rounded-xl pl-4 pr-12 py-3 sm:py-3.5 text-base bg-[#fffdf7] text-[#201b14] shadow-sm focus:outline-none focus:ring-2 focus:ring-[#b8872f]/25 focus:border-[#b8872f] min-w-0 dark:bg-[#151a21] dark:text-[#ece6da] dark:border-[#2a313a]"
          dir="rtl"
          autoFocus
        />
      </div>
      <button
        type="submit"
        className="inline-flex items-center justify-center gap-2 bg-[#123b32] text-[#f3e8c9] px-5 sm:px-7 py-3 sm:py-3.5 rounded-xl border border-[#b8872f]/60 hover:bg-[#1d4a3c] transition-colors font-semibold text-sm shrink-0 w-full sm:w-auto"
      >
        <UiIcon name="search" size={16} />
        بحث
      </button>
    </form>
  )
}
