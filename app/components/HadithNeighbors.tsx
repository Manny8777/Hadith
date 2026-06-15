'use client'
import { useState } from 'react'
import Link from 'next/link'
import HadithNumber from './HadithNumber'

interface Neighbor {
  main_id: number
  tarf: string | null
  tarqeem_harf: string | null
  tarqeem_matboa1: string | null
}

function stripTags(html: string) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export default function HadithNeighbors({ hadithId }: { hadithId: number }) {
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [prev, setPrev] = useState<Neighbor[]>([])
  const [next, setNext] = useState<Neighbor[]>([])
  const [chapter, setChapter] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/hadith/${hadithId}/neighbors`)
      const data = await res.json()
      setPrev(data.prev || [])
      setNext(data.next || [])
      setChapter(data.chapter || null)
      setLoaded(true)
    } catch {
      //
    } finally {
      setLoading(false)
    }
  }

  if (!loaded) {
    return (
      <button
        onClick={load}
        disabled={loading}
        className="text-sm text-gray-600 bg-gray-50 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
      >
        {loading ? 'جاري التحميل...' : 'عرض الأحاديث المجاورة في الباب'}
      </button>
    )
  }

  if (prev.length === 0 && next.length === 0) {
    return <p className="text-sm text-gray-400">لا توجد أحاديث مجاورة في نفس الباب</p>
  }

  function NeighborRow({ n, direction }: { n: Neighbor; direction: 'prev' | 'next' }) {
    return (
      <Link
        href={`/hadith/${n.main_id}`}
        className={`flex items-start gap-3 p-3 rounded-lg border transition-all hover:shadow-sm group ${
          direction === 'prev'
            ? 'bg-gray-50 border-gray-200 hover:border-gray-400'
            : 'bg-amber-50 border-amber-100 hover:border-amber-300'
        }`}
      >
        <span className={`text-xs mt-0.5 shrink-0 ${direction === 'prev' ? 'text-gray-400' : 'text-amber-500'}`}>
          {direction === 'prev' ? '▲' : '▼'}
        </span>
        <div className="flex-1 min-w-0">
          <HadithNumber harf={n.tarqeem_harf} matboa={n.tarqeem_matboa1} className="mr-1" />
          <p className="text-sm text-gray-700 group-hover:text-gray-900 line-clamp-2 inline">
            {stripTags(n.tarf || '').slice(0, 120)}...
          </p>
        </div>
      </Link>
    )
  }

  return (
    <div>
      {chapter && (
        <p className="text-xs text-gray-400 mb-3">في باب: {chapter}</p>
      )}
      <div className="space-y-2">
        {prev.map(n => <NeighborRow key={n.main_id} n={n} direction="prev" />)}
        <div className="border-r-4 border-green-500 pr-3 py-1">
          <span className="text-xs font-semibold text-green-700">الحديث الحالي</span>
        </div>
        {next.map(n => <NeighborRow key={n.main_id} n={n} direction="next" />)}
      </div>
    </div>
  )
}
