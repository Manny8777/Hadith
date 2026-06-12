'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface NarratorResult { id: number; name: string; abb_name: string | null; martaba_ibn_hajar: string | null }

function NarratorSearchBox({
  label,
  value,
  onSelect,
}: {
  label: string
  value: string
  onSelect: (id: number, name: string) => void
}) {
  const [q, setQ] = useState(value)
  const [results, setResults] = useState<NarratorResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  async function search(query: string) {
    setQ(query)
    if (query.trim().length < 2) { setResults([]); setOpen(false); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/narrators?q=${encodeURIComponent(query)}&limit=8`)
      const data = await res.json()
      setResults(data.narrators || data || [])
      setOpen(true)
    } catch { setResults([]) } finally { setLoading(false) }
  }

  return (
    <div className="relative">
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <input
        type="text"
        value={q}
        onChange={e => search(e.target.value)}
        placeholder="ابحث باسم الراوي..."
        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-600"
        dir="rtl"
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => results.length > 0 && setOpen(true)}
      />
      {loading && <div className="absolute left-3 top-8 text-xs text-gray-400">...</div>}
      {open && results.length > 0 && (
        <div className="absolute z-20 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden">
          {results.map(n => (
            <button
              key={n.id}
              onMouseDown={() => {
                onSelect(n.id, n.abb_name || n.name)
                setQ(n.abb_name || n.name)
                setOpen(false)
              }}
              className="w-full text-right px-4 py-2.5 hover:bg-green-50 flex items-center justify-between gap-3 text-sm"
            >
              <span className="text-green-900">{n.name}</span>
              {n.martaba_ibn_hajar && (
                <span className="text-xs text-gray-500 shrink-0">{n.martaba_ibn_hajar}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CompareSearch({ initialA, initialB }: { initialA: string; initialB: string }) {
  const router = useRouter()
  const [idA, setIdA] = useState(initialA)
  const [idB, setIdB] = useState(initialB)

  function compare() {
    if (idA && idB) router.push(`/compare?a=${idA}&b=${idB}`)
    else if (idA) router.push(`/compare?a=${idA}`)
    else if (idB) router.push(`/compare?b=${idB}`)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <h2 className="text-sm font-bold text-green-900 mb-4">اختر راويين للمقارنة</h2>
      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <NarratorSearchBox
          label="الراوي الأول"
          value={initialA}
          onSelect={(id) => setIdA(String(id))}
        />
        <NarratorSearchBox
          label="الراوي الثاني"
          value={initialB}
          onSelect={(id) => setIdB(String(id))}
        />
      </div>
      <button
        onClick={compare}
        disabled={!idA && !idB}
        className="w-full bg-green-900 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        مقارنة
      </button>
    </div>
  )
}
