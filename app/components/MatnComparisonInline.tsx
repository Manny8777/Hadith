'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface VersionRow {
  hadith_id: number
  book_name: string
  book_death: number | null
  chapter_name: string | null
  hadith_text: string
  chain_count: number
  judgment: string | null
  companion_name: string | null
}

function judgmentColor(j: string | null) {
  if (!j) return 'text-gray-400'
  if (/صحيح/.test(j)) return 'text-green-700'
  if (/حسن/.test(j)) return 'text-blue-700'
  if (/ضعيف/.test(j)) return 'text-red-600'
  return 'text-gray-500'
}

export default function MatnComparisonInline({ hadithId }: { hadithId: number }) {
  const [versions, setVersions] = useState<VersionRow[]>([])
  const [mainId, setMainId] = useState(hadithId)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch(`/api/hadith/${hadithId}/matn-comparison`)
      .then(r => r.json())
      .then(data => {
        setVersions(data.versions || [])
        setMainId(data.mainId ?? hadithId)
        setLoading(false)
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [hadithId])

  if (loading) return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl" />)}
    </div>
  )
  if (error) return <p className="text-sm text-red-500 py-4">حدث خطأ في تحميل مقارنة المتون</p>
  if (versions.length === 0) return (
    <p className="text-sm text-gray-400 py-4">لا توجد روايات موازية للمقارنة</p>
  )

  return (
    <div dir="rtl">
      <p className="text-xs text-gray-500 mb-4">
        {versions.length} رواية موازية — مقارنة اللفظ بين المصادر
      </p>
      <div className="space-y-3">
        {versions.map(v => (
          <div
            key={v.hadith_id}
            className={`bg-white rounded-xl border p-4 ${
              v.hadith_id === mainId ? 'border-green-300 ring-1 ring-green-200' : 'border-gray-100'
            }`}
          >
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="font-bold text-green-900 text-sm">{v.book_name}</span>
              {v.book_death && <span className="text-xs text-gray-400">ت {v.book_death}هـ</span>}
              {v.companion_name && (
                <span className="text-xs bg-amber-50 text-amber-800 border border-amber-100 px-2 py-0.5 rounded-full">
                  {v.companion_name}
                </span>
              )}
              {v.judgment && (
                <span className={`text-xs ${judgmentColor(v.judgment)}`}>
                  {v.judgment.slice(0, 50)}
                </span>
              )}
              {v.hadith_id === mainId && (
                <span className="text-xs bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded-full">
                  الرواية الأساسية
                </span>
              )}
              {v.hadith_id !== mainId && (
                <Link href={`/hadith/${v.hadith_id}`} className="text-xs text-green-700 hover:underline mr-auto">
                  رابط ←
                </Link>
              )}
            </div>
            <p className="text-sm text-gray-700 leading-relaxed line-clamp-4">
              {v.hadith_text.replace(/\s+/g, ' ').trim()}
            </p>
            {v.chain_count > 0 && (
              <p className="text-xs text-gray-400 mt-2">{v.chain_count} سند</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
