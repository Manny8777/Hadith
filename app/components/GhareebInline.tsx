'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { findGhareebMatches, type GhareebWord } from '@/lib/ghareeb'

export default function GhareebInline({ hadithId }: { hadithId: number }) {
  const [words, setWords] = useState<GhareebWord[]>([])
  const [matn, setMatn] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch(`/api/hadith/${hadithId}/ghareeb-words`)
      .then(r => r.json())
      .then(data => {
        setWords(data.words || [])
        setMatn(data.matn || '')
        setLoading(false)
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [hadithId])

  const matched = useMemo(() => {
    if (!matn || words.length === 0) return []
    const matches = findGhareebMatches(matn, words)
    const seen = new Set<number>()
    const result: GhareebWord[] = []
    for (const m of matches) {
      const w = words.find(x => x.formId === m.formId)
      if (w && !seen.has(w.wordId)) {
        seen.add(w.wordId)
        result.push(w)
      }
    }
    return result
  }, [matn, words])

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        <div className="h-16 bg-amber-50 rounded-xl border border-amber-100" />
        <div className="h-12 bg-amber-50 rounded-xl border border-amber-100" />
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-red-500 py-4">حدث خطأ في تحميل غريب الحديث</p>
  }

  if (matched.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 leading-relaxed">
        <p className="mb-2">
          هذا الحديث مصنَّف ضمن <strong>غريب الحديث</strong>، لكن لم تُعثر على ألفاظ غريبة
          مرتبطة بمتنه في المعجم.
        </p>
        <Link href="/lexicon" className="text-xs text-amber-800 hover:underline font-medium">
          تصفّح معجم غريب الحديث ←
        </Link>
      </div>
    )
  }

  return (
    <div dir="rtl" className="space-y-3">
      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        وُجد في متن هذا الحديث{' '}
        <strong>{matched.length.toLocaleString('ar-EG')}</strong>{' '}
        {matched.length === 1 ? 'لفظة غريبة' : 'ألفاظ غريبة'} — مرّر على المتن أعلاه لعرض الشرح
      </p>

      <div className="grid sm:grid-cols-2 gap-2">
        {matched.map(w => (
          <Link
            key={w.wordId}
            href={`/lexicon/${w.wordId}`}
            className="flex flex-col gap-1 bg-white border border-amber-200 rounded-xl px-4 py-3 hover:border-amber-400 hover:shadow-sm transition-all group"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-amber-900 text-base font-serif group-hover:text-green-800">
                {w.wordText}
              </span>
              <span className="text-[10px] font-bold text-amber-600 bg-amber-100 rounded-full px-2 py-0.5 shrink-0">
                غريب
              </span>
            </div>
            {w.formText !== w.wordText && (
              <span className="text-xs text-gray-500">صيغة: {w.formText}</span>
            )}
            {w.sourceBook && (
              <span className="text-[11px] text-gray-400">{w.sourceBook}</span>
            )}
            {w.definition && (
              <p className="text-xs text-gray-600 leading-relaxed line-clamp-2 mt-0.5">
                {w.definition}
              </p>
            )}
          </Link>
        ))}
      </div>

      <Link href="/lexicon" className="inline-block text-xs text-amber-800 hover:underline font-medium mt-1">
        تصفّح معجم غريب الحديث ←
      </Link>
    </div>
  )
}
