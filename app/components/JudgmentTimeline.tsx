'use client'
import { useState } from 'react'
import Link from 'next/link'

interface JudgmentRow {
  say_text: string
  grade_class: string | null
  scientist_id: number | null
  scientist_name: string | null
  death_year: string | null
  death_year_num: number | null
  tabaqa: string | null
  computed_grade: string
}

interface Props {
  hadithId: number
}

function gradeConfig(g: string) {
  switch (g) {
    case 'صحيح': return { bg: 'bg-green-50 border-green-200', badge: 'bg-green-100 text-green-800', dot: 'bg-green-500', text: 'text-green-800' }
    case 'حسن': return { bg: 'bg-amber-50 border-amber-200', badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-400', text: 'text-amber-800' }
    case 'ضعيف': return { bg: 'bg-red-50 border-red-200', badge: 'bg-red-100 text-red-700', dot: 'bg-red-500', text: 'text-red-700' }
    default: return { bg: 'bg-gray-50 border-gray-200', badge: 'bg-gray-100 text-gray-600', dot: 'bg-gray-300', text: 'text-gray-600' }
  }
}

export default function JudgmentTimeline({ hadithId }: Props) {
  const [data, setData] = useState<{ judgments: JudgmentRow[]; total: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  function load() {
    if (data) { setOpen(o => !o); return }
    setLoading(true)
    fetch(`/api/hadith/${hadithId}/judgment-timeline`)
      .then(r => r.json())
      .then(d => { setData(d); setOpen(true) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  function toggleExpand(i: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  if (!open && !loading) {
    return (
      <button
        onClick={load}
        className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
      >
        تسلسل الأحكام التاريخي
      </button>
    )
  }

  if (loading) return <span className="text-xs text-gray-400">جاري التحميل...</span>

  if (!data || data.judgments.length === 0) {
    return <span className="text-xs text-gray-400">لا توجد أحكام موثقة</span>
  }

  const sahihCount = data.judgments.filter(j => j.computed_grade === 'صحيح').length
  const hasanCount = data.judgments.filter(j => j.computed_grade === 'حسن').length
  const daifCount = data.judgments.filter(j => j.computed_grade === 'ضعيف').length

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-indigo-900">
            تسلسل الأحكام عبر القرون
          </h3>
          <span className="text-xs text-gray-400">({data.total} حكم)</span>
          {sahihCount > 0 && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{sahihCount} صحيح</span>}
          {hasanCount > 0 && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{hasanCount} حسن</span>}
          {daifCount > 0 && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{daifCount} ضعيف</span>}
        </div>
        <button onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute right-[1.1rem] top-0 bottom-0 w-px bg-gray-200"></div>

        <div className="space-y-3">
          {data.judgments.map((j, i) => {
            const cfg = gradeConfig(j.computed_grade)
            const isExpanded = expanded.has(i)
            const isLong = j.say_text.length > 120
            return (
              <div key={i} className="flex items-start gap-3 relative">
                {/* Timeline dot */}
                <div className={`w-4 h-4 rounded-full border-2 border-white shadow ${cfg.dot} shrink-0 mt-1 z-10`}></div>

                {/* Content */}
                <div className={`flex-1 rounded-xl border p-3 ${cfg.bg}`}>
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    {j.scientist_id ? (
                      <Link
                        href={`/narrator/${j.scientist_id}`}
                        className={`text-xs font-semibold hover:underline ${cfg.text}`}
                      >
                        {j.scientist_name || 'غير معروف'}
                      </Link>
                    ) : (
                      <span className={`text-xs font-semibold ${cfg.text}`}>
                        {j.scientist_name || 'غير معروف'}
                      </span>
                    )}
                    {j.death_year && (
                      <span className="text-xs text-gray-400">ت {j.death_year}</span>
                    )}
                    {j.tabaqa && (
                      <span className="text-xs text-gray-300">— {j.tabaqa}</span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full mr-auto shrink-0 ${cfg.badge}`}>
                      {j.computed_grade}
                    </span>
                  </div>
                  <p className={`text-xs text-gray-700 leading-relaxed ${!isExpanded && isLong ? 'line-clamp-2' : ''}`}>
                    {j.say_text}
                  </p>
                  {isLong && (
                    <button onClick={() => toggleExpand(i)} className="text-xs text-indigo-600 hover:text-indigo-800 mt-1">
                      {isExpanded ? 'إخفاء ▲' : 'عرض الكامل ▼'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-3 text-left">
        مرتبة بحسب وفاة العالم تصاعدياً — الأقدم أولاً
      </p>
    </div>
  )
}
