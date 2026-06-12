'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function HadithNumSearch({ bookId }: { bookId: number }) {
  const [num, setNum] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = num.trim()
    if (!trimmed) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/books/${bookId}/by-num?num=${encodeURIComponent(trimmed)}`)
      const data = await res.json()
      if (data.found && data.main_id) {
        router.push(`/hadith/${data.main_id}`)
      } else {
        setError(`لم يُعثر على الحديث رقم ${trimmed}`)
      }
    } catch {
      setError('حدث خطأ في البحث')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSearch} className="flex items-center gap-2">
      <input
        type="text"
        value={num}
        onChange={e => { setNum(e.target.value); setError('') }}
        placeholder="رقم الحديث..."
        className="w-32 bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-amber-300 transition-colors"
        dir="ltr"
      />
      <button
        type="submit"
        disabled={loading || !num.trim()}
        className="text-sm text-amber-300 hover:text-amber-100 border border-amber-400/30 hover:border-amber-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
      >
        {loading ? '...' : 'انتقال'}
      </button>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </form>
  )
}
