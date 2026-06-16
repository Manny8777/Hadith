'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface QuranRef {
  sura: number
  aya: number
  sura_name: string
  aya_text: string | null
}

export default function QuranRefsInline({ hadithId }: { hadithId: number }) {
  const [refs, setRefs] = useState<QuranRef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch(`/api/hadith/${hadithId}/quran-refs`)
      .then(r => r.json())
      .then(data => {
        setRefs(data.quran_refs || [])
        setLoading(false)
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [hadithId])

  if (loading) return (
    <div className="space-y-3 animate-pulse">
      {[1, 2].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl" />)}
    </div>
  )
  if (error) return <p className="text-sm text-red-500 py-4">حدث خطأ في تحميل القراءات والآيات</p>
  if (refs.length === 0) return (
    <p className="text-sm text-gray-400 py-4">لا توجد آيات قرآنية مرتبطة بهذا الحديث</p>
  )

  return (
    <div dir="rtl" className="space-y-3">
      {refs.map(ref => (
        <div key={`${ref.sura}-${ref.aya}`} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Link
              href={`/quran/${ref.sura}`}
              className="text-sm font-semibold text-green-800 hover:underline"
            >
              سورة {ref.sura_name}
            </Link>
            <span className="text-xs text-gray-400">آية {ref.aya}</span>
          </div>
          {ref.aya_text && (
            <p className="text-sm text-gray-700 leading-loose font-serif">{ref.aya_text}</p>
          )}
        </div>
      ))}
    </div>
  )
}
