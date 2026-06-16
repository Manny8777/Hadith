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
    if (words.length === 0) return []
    if (!matn) return words
    const matches = findGhareebMatches(matn, words)
    if (matches.length > 0) {
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
    }
    return words
  }, [matn, words])

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        <div className="h-16 bg-orange-50 rounded-xl border border-orange-100" />
        <div className="h-12 bg-orange-50 rounded-xl border border-orange-100" />
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-red-500 py-4">حدث خطأ في تحميل غريب الحديث</p>
  }

  if (matched.length === 0) {
    return (
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-sm text-orange-900 leading-relaxed">
        <p className="mb-2">
          هذا الحديث مصنَّف ضمن <strong>غريب الحديث</strong>، لكن لم تُعثر على ألفاظ غريبة
          مرتبطة بمتنه في المعجم.
        </p>
        <Link href="/lexicon" className="text-xs text-orange-800 hover:underline font-medium">
          تصفّح معجم غريب الحديث ←
        </Link>
      </div>
    )
  }

  return (
    <div dir="rtl" className="space-y-3">
      <p className="text-xs text-orange-800 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
        وُجد في متن هذا الحديث{' '}
        <strong>{matched.length.toLocaleString('ar-EG')}</strong>{' '}
        {matched.length === 1 ? 'لفظة غريبة' : 'ألفاظ غريبة'} — مرّر على المتن أعلاه لعرض الشرح
      </p>

      <div className="space-y-3">
        {matched.map(w => {
          const sources = w.sources?.length
            ? w.sources
            : [{ definition: w.definition, sourceBook: w.sourceBook, sourceRefId: w.sourceRefId }]

          return (
            <div
              key={w.wordId}
              className="bg-white border border-orange-200 rounded-xl px-4 py-3"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <Link
                  href={`/lexicon/${w.wordId}`}
                  className="font-bold text-orange-900 text-base font-serif hover:text-green-800 hover:underline"
                >
                  {w.wordText}
                </Link>
                <span className="text-[10px] font-bold text-orange-600 bg-orange-100 rounded-full px-2 py-0.5 shrink-0">
                  غريب
                </span>
              </div>
              {w.formText !== w.wordText && (
                <span className="text-xs text-gray-500 block mb-2">صيغة: {w.formText}</span>
              )}

              <div className="space-y-2.5 border-t border-orange-100 pt-2.5">
                {sources.map((src, i) => (
                  <div key={`${src.sourceRefId ?? i}-${src.sourceBook ?? i}`} className="text-sm">
                    {src.sourceBook && (
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[11px] font-semibold text-orange-700">
                          {src.sourceBook}
                        </span>
                        {src.sourceRefId && (
                          <Link
                            href={`/service-content/${src.sourceRefId}`}
                            className="text-[10px] text-gray-500 hover:text-orange-700 hover:underline shrink-0"
                          >
                            المصدر ←
                          </Link>
                        )}
                      </div>
                    )}
                    {src.definition && (
                      <p className="text-xs text-gray-600 leading-relaxed">{src.definition}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <Link href="/lexicon" className="inline-block text-xs text-orange-800 hover:underline font-medium mt-1">
        تصفّح معجم غريب الحديث ←
      </Link>
    </div>
  )
}
