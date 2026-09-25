'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import HadithNumber from './HadithNumber'

interface ParallelHadith {
  main_id: number
  book_title: string
  takhrij_author: string | null
  takhrij_death: number | null
  tarf: string | null
  content: string | null
  part_num: number
  page_num: number
  tarqeem_harf: string | null
  tarqeem_matboa1: string | null
  section_text: string | null
  chapter_text: string | null
  grade_hint: string | null
  companion_id: number | null
  companion_name: string | null
}

function stripTags(html: string) {
  return (html || '')
    .replace(/<رقم_حديث[^>]*>[^<]*<\/رقم_حديث>/g, '')
    .replace(/<رقم_الفقرة[^>]*\/>/g, '')
    .replace(/<نه\/>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/^\s*[-–—]\s*/, '')
    .replace(/\s+/g, ' ').trim()
}

interface Props {
  hadithId: number
}

export default function ParallelTexts({ hadithId }: Props) {
  const [parallels, setParallels] = useState<ParallelHadith[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [groupId, setGroupId] = useState<number | null>(null)

  function load() {
    if (loaded) return
    setLoading(true)
    fetch(`/api/hadith/${hadithId}/parallel`)
      .then(r => r.json())
      .then(data => {
        setParallels(data.parallels || [])
        setGroupId(data.groupId || null)
        setLoaded(true)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  function toggleExpand(id: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!loaded && !loading) {
    return (
      <button
        onClick={load}
        className="text-xs text-amber-700 hover:text-amber-900 border border-amber-200 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors"
      >
        عرض الروايات الموازية
      </button>
    )
  }

  if (loading) {
    return <p className="text-xs text-gray-400 py-2">جاري تحميل الروايات الموازية...</p>
  }

  if (parallels.length === 0) {
    return (
      <p className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
        لا توجد روايات موازية موثقة في الموسوعة
      </p>
    )
  }

  // Group by companion
  const byCompanion: Record<string, ParallelHadith[]> = {}
  parallels.forEach(p => {
    const key = p.companion_name || 'غير محدد'
    if (!byCompanion[key]) byCompanion[key] = []
    byCompanion[key].push(p)
  })

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-bold text-gray-700 text-sm">
          الروايات الموازية
          <span className="mr-2 text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {parallels.length} رواية
          </span>
        </h3>
        <div className="flex items-center gap-2">
          {groupId && (
            <span className="text-xs text-gray-400">مجموعة رقم {groupId}</span>
          )}
          <a
            href={`/hadith/${hadithId}/chains`}
            className="text-xs text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            مقارنة الأسانيد →
          </a>
          <a
            href={`/matn-compare?id=${hadithId}`}
            className="text-xs text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            مقارنة المتون →
          </a>
        </div>
      </div>

      <div className="space-y-4">
        {Object.entries(byCompanion).map(([companion, items]) => (
          <div key={companion}>
            <div className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 mb-2 flex items-center gap-2">
              <span className="text-amber-400">ص</span>
              من حديث: {companion}
              <span className="text-amber-500 font-normal">({items.length})</span>
            </div>
            <div className="grid grid-cols-1 gap-3 mr-4">
              {items.map(p => {
                const isExpanded = expanded.has(p.main_id)
                const text = isExpanded
                  ? (p.content ? stripTags(p.content) : stripTags(p.tarf || ''))
                  : stripTags(p.tarf || '').slice(0, 180)
                const hasMore = (p.content || p.tarf) && stripTags(p.tarf || '').length > 180

                return (
                  <div key={p.main_id} className="bg-white border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-colors">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/hadith/${p.main_id}`}
                          className="text-xs font-semibold text-green-800 hover:underline"
                        >
                          {p.book_title}
                        </Link>
                        {p.takhrij_author && (
                          <span className="text-xs text-gray-400">
                            {p.takhrij_author}{p.takhrij_death ? ` ت${p.takhrij_death}` : ''}
                          </span>
                        )}
                        {p.grade_hint && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                            p.grade_hint === 'صحيح' ? 'bg-green-100 text-green-700' :
                            p.grade_hint === 'حسن' ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-600'
                          }`}>
                            {p.grade_hint}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <HadithNumber harf={p.tarqeem_harf} matboa={p.tarqeem_matboa1} />
                        {(p.part_num > 0 || p.page_num > 0) && (
                          <span>ج{p.part_num}/ص{p.page_num}</span>
                        )}
                      </div>
                    </div>

                    {/* Text */}
                    {text && (
                      <p className="text-gray-700 text-sm leading-loose">
                        {text}{!isExpanded && hasMore ? '...' : ''}
                      </p>
                    )}

                    {/* Expand/collapse button */}
                    {hasMore && (
                      <button
                        onClick={() => toggleExpand(p.main_id)}
                        className="text-xs text-green-600 hover:text-green-800 mt-2"
                      >
                        {isExpanded ? 'إخفاء التفاصيل ▲' : 'عرض النص الكامل ▼'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
