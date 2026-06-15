'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Topic {
  id: number
  title: string
  hadith_count: number
}

export default function NarratorTopics({ narratorId }: { narratorId: number }) {
  const [topics, setTopics] = useState<Topic[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/narrator/${narratorId}/topics`)
      const data = await res.json()
      setTopics(data.topics || [])
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
        className="text-sm text-indigo-700 bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
      >
        {loading ? 'جاري التحميل...' : 'عرض التوزيع الموضوعي'}
      </button>
    )
  }

  if (topics.length === 0) {
    return <p className="text-sm text-gray-400">لا توجد بيانات موضوعية لهذا الراوي</p>
  }

  const max = topics[0].hadith_count

  return (
    <div className="space-y-2">
      {topics.map(t => (
        <div key={t.id} className="flex items-center gap-3">
          <Link
            href={`/topics/${t.id}`}
            className="text-sm text-indigo-700 hover:underline shrink-0 w-36 text-right leading-snug"
          >
            {t.title}
          </Link>
          <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
            <div
              className="bg-indigo-400 h-3 rounded-full"
              style={{ width: `${Math.round((t.hadith_count / max) * 100)}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 shrink-0 w-12 text-left">
            {t.hadith_count.toLocaleString('ar-EG')}
          </span>
        </div>
      ))}
      <p className="text-xs text-gray-400 pt-1">
        أعلى {topics.length} موضوع من المحتوى المصنَّف لأحاديث هذا الراوي
      </p>
    </div>
  )
}
