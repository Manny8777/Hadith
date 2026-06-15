'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface WitnessRow {
  companion_id: number | null
  companion_name: string | null
  companion_abb: string | null
  hadith_id: number
  tarf: string | null
  book_title: string
  takhrij_author: string | null
  takhrij_death: number | null
  chain_count: number
}

export default function WitnessesInline({ hadithId }: { hadithId: number }) {
  const [witnesses, setWitnesses] = useState<WitnessRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch(`/api/hadith/${hadithId}/witnesses-inline`)
      .then(r => r.json())
      .then(data => {
        setWitnesses(data.witnesses || [])
        setLoading(false)
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [hadithId])

  if (loading) return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl" />)}
    </div>
  )
  if (error) return <p className="text-sm text-red-500 py-4">حدث خطأ في تحميل الشواهد</p>
  if (witnesses.length === 0) return (
    <p className="text-sm text-gray-400 py-4">لم يُعثر على شواهد أو متابعات لهذا الحديث</p>
  )

  const byCompanion = new Map<string, WitnessRow[]>()
  for (const w of witnesses) {
    const key = w.companion_name || '— غير محدد الصحابي'
    if (!byCompanion.has(key)) byCompanion.set(key, [])
    byCompanion.get(key)!.push(w)
  }

  return (
    <div dir="rtl">
      <div className="flex items-center gap-2 mb-4 text-xs flex-wrap">
        <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full font-medium">
          {witnesses.length} طريق موازٍ
        </span>
        <span className="bg-violet-50 text-violet-700 border border-violet-200 px-2.5 py-1 rounded-full font-medium">
          {byCompanion.size} مجموعة
        </span>
      </div>

      <div className="space-y-4">
        {Array.from(byCompanion.entries()).map(([companionName, rows]) => (
          <div key={companionName}>
            <div className="text-xs font-bold text-violet-700 bg-violet-50 border border-violet-100 px-3 py-1.5 rounded-lg mb-2">
              {companionName}
            </div>
            <div className="space-y-2">
              {rows.map(w => (
                <div key={w.hadith_id}
                  className="bg-white border border-gray-100 rounded-xl p-3 hover:border-green-200 transition-colors">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-medium text-green-800">{w.book_title}</span>
                    {w.takhrij_death && <span className="text-xs text-gray-400">ت {w.takhrij_death}هـ</span>}
                    {w.chain_count > 0 && <span className="text-xs text-gray-400">{w.chain_count} سند</span>}
                    <Link href={`/hadith/${w.hadith_id}`}
                      className="text-xs text-green-700 hover:underline mr-auto">
                      رابط ←
                    </Link>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">
                    {(w.tarf || '').slice(0, 150) || `حديث ${w.hadith_id}`}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
