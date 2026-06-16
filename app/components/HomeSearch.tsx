'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function HomeSearch() {
  const [q, setQ] = useState('')
  const router = useRouter()

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (q.trim().length >= 2) router.push(`/search?q=${encodeURIComponent(q.trim())}`)
  }

  return (
    <form onSubmit={handleSearch} className="w-full max-w-2xl flex flex-col sm:flex-row gap-2 sm:gap-3 font-sans">
      <input
        type="text"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="ابحث في متون الأحاديث النبوية..."
        className="flex-1 border border-gray-200 rounded-xl px-4 sm:px-5 py-3 sm:py-3.5 text-base bg-white focus:outline-none focus:ring-2 focus:ring-green-800/30 focus:border-green-700 min-w-0"
        dir="rtl"
        autoFocus
      />
      <button
        type="submit"
        className="bg-green-800 text-white px-5 sm:px-7 py-3 sm:py-3.5 rounded-xl hover:bg-green-700 transition-colors font-semibold text-sm shrink-0 w-full sm:w-auto"
      >
        بحث
      </button>
    </form>
  )
}
