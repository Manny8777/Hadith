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
    <form onSubmit={handleSearch} className="w-full max-w-3xl flex flex-col sm:flex-row gap-2 sm:gap-3 font-sans">
      <div className="relative flex-1 min-w-0">
        <UiIcon name="search" size={20} className="absolute right-5 top-1/2 -translate-y-1/2 text-[#0F3D2E] pointer-events-none" />
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="ابحث في الأحاديث أو الرواة أو الكتب..."
          className="w-full min-h-14 border border-[#C9A96B]/70 rounded-full pl-5 pr-13 py-3.5 text-base bg-[#FFFDF7] text-[#17201D] shadow-[0_1px_2px_rgba(23,32,29,.04)] focus:outline-none focus:ring-2 focus:ring-[#C9A96B]/30 focus:border-[#A8894F] min-w-0"
          dir="rtl"
          autoFocus
        />
      </div>
      <button
        type="submit"
        className="inline-flex min-h-14 items-center justify-center gap-2 bg-[#C9A96B] text-[#0F3D2E] px-6 sm:px-8 py-3.5 rounded-full border border-[#A8894F] hover:bg-[#B28F50] transition-colors font-semibold text-sm shrink-0 w-full sm:w-auto"
      >
        <UiIcon name="search" size={17} />
        بحث
      </button>
    </form>
  )
}
