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
    <form onSubmit={handleSearch} className="w-full max-w-2xl flex gap-3">
      <input
        type="text"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="ابحث في متون الأحاديث النبوية..."
        className="flex-1 border border-green-200 rounded-xl px-5 py-3.5 text-base bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent"
        dir="rtl"
        autoFocus
      />
      <button
        type="submit"
        className="bg-green-900 text-white px-7 py-3.5 rounded-xl hover:bg-green-800 transition-colors font-semibold text-sm shrink-0"
      >
        بحث
      </button>
    </form>
  )
}
