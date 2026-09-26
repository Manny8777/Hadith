'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface NarratorRow {
  id: number
  name: string
  living_city: string | null
  birth_city: string | null
  journey_city: string | null
  death_year_num: number | null
}

function primaryCity(n: NarratorRow): string {
  const raw = (n.living_city || n.birth_city || '').trim()
  if (!raw) return ''
  return raw.split('،')[0].replace(/قال.*?:/g, '').trim()
}

export default function NarratorsByRegionInline({ hadithId }: { hadithId: number }) {
  const [narrators, setNarrators] = useState<NarratorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch(`/api/hadith/${hadithId}/narrators-by-region`)
      .then(r => r.json())
      .then(data => {
        setNarrators(data.narrators || [])
        setLoading(false)
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [hadithId])

  if (loading) return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl" />)}
    </div>
  )
  if (error) return <p className="text-sm text-red-500 py-4">حدث خطأ في تحميل البيانات الجغرافية</p>
  if (narrators.length === 0) return (
    <p className="text-sm text-gray-400 py-4">لا تتوفر بيانات جغرافية لرواة هذا الحديث</p>
  )

  const cityMap = new Map<string, NarratorRow[]>()
  const noCityList: NarratorRow[] = []
  for (const n of narrators) {
    const city = primaryCity(n)
    if (city) {
      const bucket = cityMap.get(city) || []
      bucket.push(n)
      cityMap.set(city, bucket)
    } else {
      noCityList.push(n)
    }
  }
  const cities = Array.from(cityMap.entries()).sort((a, b) => b[1].length - a[1].length)

  return (
    <div dir="rtl">
      {/* Counts are in the section header (SectionBadges) */}
      <div className="space-y-5">
        {cities.map(([city, narrs]) => (
          <div key={city}>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-sm font-bold text-green-900">{city}</h3>
              <span className="text-xs text-gray-400">{narrs.length} راوٍ</span>
            </div>
            <div className="space-y-1.5">
              {narrs.map(n => (
                <Link
                  key={n.id}
                  href={`/narrator/${n.id}`}
                  className="flex items-start gap-3 px-4 py-2.5 bg-white border border-gray-100 rounded-xl hover:border-green-200 hover:shadow-sm transition-all group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 group-hover:text-green-800 leading-snug">{n.name}</p>
                    {n.journey_city && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        رحل إلى: {n.journey_city.split('،')[0].trim()}
                      </p>
                    )}
                  </div>
                  {n.death_year_num && (
                    <span className="text-xs text-gray-400 shrink-0 mt-1">ت {n.death_year_num}هـ</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}

        {noCityList.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-sm font-bold text-gray-400">غير محدد البلد</h3>
              <span className="text-xs text-gray-400">{noCityList.length} راوٍ</span>
            </div>
            <div className="space-y-1.5">
              {noCityList.map(n => (
                <Link
                  key={n.id}
                  href={`/narrator/${n.id}`}
                  className="flex items-start gap-3 px-4 py-2.5 bg-white border border-gray-100 rounded-xl hover:border-gray-200 transition-all group"
                >
                  <p className="text-sm text-gray-600 group-hover:text-green-800 flex-1 leading-snug">{n.name}</p>
                  {n.death_year_num && (
                    <span className="text-xs text-gray-400 shrink-0 mt-1">ت {n.death_year_num}هـ</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
