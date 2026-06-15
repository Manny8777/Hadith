'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface NarratorResult {
  id: number
  name: string
  abb_name: string | null
  martaba_ibn_hajar: string | null
}

interface Props {
  currentNarratorId: number
  currentNarratorName: string
}

export default function CompareNarratorPicker({ currentNarratorId, currentNarratorName }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<NarratorResult[]>([])
  const [loading, setLoading] = useState(false)

  const search = useCallback(async (term: string) => {
    if (term.trim().length < 2) { setResults([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/narrators?q=${encodeURIComponent(term)}&limit=10`)
      const data = await res.json()
      setResults(data.narrators || [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQ(e.target.value)
    search(e.target.value)
  }

  function pick(other: NarratorResult) {
    router.push(`/narrators/compare?a=${currentNarratorId}&b=${other.id}`)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
      >
        مقارنة مع راوٍ آخر
      </button>
    )
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-blue-800">
          مقارنة <span className="font-bold">{currentNarratorName}</span> مع:
        </p>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-xs">
          إغلاق
        </button>
      </div>
      <input
        autoFocus
        type="text"
        value={q}
        onChange={handleChange}
        placeholder="ابحث باسم الراوي..."
        className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
        dir="rtl"
      />
      {loading && <p className="text-xs text-gray-400 mt-2">جاري البحث...</p>}
      {results.length > 0 && (
        <div className="mt-2 border border-blue-100 rounded-lg bg-white shadow-sm overflow-hidden">
          {results.map(r => (
            <button
              key={r.id}
              onClick={() => pick(r)}
              className="w-full text-right px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0 flex items-center justify-between"
            >
              <span className="text-gray-800">{r.name}</span>
              {r.martaba_ibn_hajar && (
                <span className="text-xs text-gray-500 mr-2">{r.martaba_ibn_hajar}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
