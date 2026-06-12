'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const [q, setQ] = useState('')
  const router = useRouter()

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (q.trim().length >= 2) router.push(`/search?q=${encodeURIComponent(q.trim())}`)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-10">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-green-900 mb-3">
          جامع خادم الحرمين الشريفين
        </h1>
        <p className="text-lg text-gray-600">موسوعة الحديث النبوي الشريف</p>
      </div>

      <form onSubmit={handleSearch} className="w-full max-w-xl flex gap-3">
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="ابحث في الأحاديث النبوية..."
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

      <div className="flex gap-6 text-center">
        <a
          href="/books"
          className="bg-white border border-gray-200 rounded-xl px-8 py-6 hover:shadow-md transition-shadow text-green-900 font-bold"
        >
          <div className="text-3xl mb-2">📚</div>
          <div className="text-lg">تصفح الكتب</div>
          <div className="text-sm text-gray-500 mt-1">245 كتاباً</div>
        </a>
        <a
          href="/search"
          className="bg-white border border-gray-200 rounded-xl px-8 py-6 hover:shadow-md transition-shadow text-green-900 font-bold"
        >
          <div className="text-3xl mb-2">🔍</div>
          <div className="text-lg">البحث المتقدم</div>
          <div className="text-sm text-gray-500 mt-1">مئات الآلاف من الأحاديث</div>
        </a>
      </div>
    </div>
  )
}
