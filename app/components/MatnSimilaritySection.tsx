'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import HadithNumber from './HadithNumber'

interface SimilarityRow {
  hadith_id: number
  book_title: string | null
  book_death: number | null
  num_harf: string | null
  num_matboa: string | null
  old_label: string | null
  score: number
  is_source: boolean
}

// Colour ramp for score badge: red → amber → green
function scoreBadgeClass(score: number): string {
  if (score >= 80) return 'bg-green-100 text-green-800 border-green-200'
  if (score >= 60) return 'bg-amber-100 text-amber-800 border-amber-200'
  if (score >= 40) return 'bg-orange-100 text-orange-800 border-orange-200'
  return 'bg-red-50 text-red-700 border-red-200'
}

// Old-label badge (teal, same as TakhrijClient)
function OldLabelBadge({ label }: { label: string }) {
  return (
    <span className="text-[10px] bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
      {label}
    </span>
  )
}

export default function MatnSimilaritySection({ hadithId }: { hadithId: number }) {
  const [allRows, setAllRows] = useState<SimilarityRow[]>([])
  const [baseWordCount, setBaseWordCount] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [minScore, setMinScore] = useState(0)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/hadith/${hadithId}/matn-similarity`)
      .then(r => r.json())
      .then((data: { results: SimilarityRow[]; base_word_count?: number; error?: string }) => {
        if (data.error) { setError(data.error); return }
        setAllRows(data.results ?? [])
        setBaseWordCount(data.base_word_count ?? 0)
      })
      .catch(() => setError('fetch_failed'))
      .finally(() => setLoading(false))
  }, [hadithId])

  // Client-side filter using stored scores — instant, no extra requests
  const filtered = useMemo(
    () => allRows.filter(r => r.is_source || r.score >= minScore),
    [allRows, minScore]
  )

  return (
    <section id="matn-similarity" className="mb-8 scroll-mt-14" dir="rtl">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-base font-bold text-green-900 shrink-0 font-display">مطابقة المتون</h2>
        <div className="flex-1 h-px bg-green-100" />
      </div>

      {/* Old vs New explanation */}
      <div className="flex flex-wrap gap-2 mb-4 text-[11px]">
        <span className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 border border-teal-200 px-2.5 py-1 rounded-full">
          <span className="font-semibold">النظام القديم</span>
          — تصنيف مسبق من قاعدة البيانات (بلفظه، بمثله، بنحوه…)
        </span>
        <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full">
          <span className="font-semibold">الحساب المباشر</span>
          — نسبة تطابق مباشرة بين نصوص المتون بعد التطبيع العربي
        </span>
      </div>

      {loading && (
        <p className="text-sm text-gray-400 py-6 text-center">جارٍ حساب نسب التطابق…</p>
      )}

      {error && !loading && (
        <p className="text-sm text-red-400 py-4 text-center">تعذّر حساب التطابق لهذا الحديث</p>
      )}

      {!loading && !error && allRows.length > 0 && (
        <>
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-4 mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
            {/* Stats */}
            <div className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">{filtered.length}</span> رواية
              {filtered.length !== allRows.length && (
                <span className="text-gray-400"> (من {allRows.length})</span>
              )}
              {baseWordCount > 0 && (
                <span className="mr-2 text-gray-400">· طول المتن الأصلي: {baseWordCount} كلمة</span>
              )}
            </div>

            {/* Slider */}
            <div className="flex items-center gap-3 flex-1 min-w-[240px]">
              <span className="text-xs text-gray-500 shrink-0">أدنى نسبة تطابق:</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={minScore}
                onChange={e => setMinScore(Number(e.target.value))}
                className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-indigo-600"
                style={{ direction: 'ltr' }}
              />
              <span className="text-sm font-semibold text-indigo-700 w-10 text-left shrink-0">
                {minScore}٪
              </span>
            </div>
          </div>

          {/* Results list */}
          <div className="space-y-2">
            {filtered.map((row, i) => (
              <div
                key={`${row.hadith_id}-${i}`}
                className={`relative flex items-start gap-3 pr-3 pl-2 py-2.5 rounded-xl border transition-colors
                  ${row.is_source
                    ? 'border-amber-200 bg-amber-50/60'
                    : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
              >
                {/* Score bar on the right edge */}
                <div className="flex flex-col items-center gap-1 shrink-0 w-12">
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full border ${scoreBadgeClass(row.score)}`}>
                    {row.score}٪
                  </span>
                  {/* Mini bar */}
                  <div className="w-10 h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        row.score >= 80 ? 'bg-green-500'
                          : row.score >= 60 ? 'bg-amber-400'
                          : row.score >= 40 ? 'bg-orange-400'
                          : 'bg-red-400'
                      }`}
                      style={{ width: `${row.score}%` }}
                    />
                  </div>
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-snug">
                    <Link
                      href={`/books/${row.hadith_id}`}
                      className="font-semibold text-green-800 hover:text-green-600 hover:underline"
                    >
                      {row.book_title ?? `كتاب`}
                    </Link>
                    {row.book_death && (
                      <span className="text-gray-400 text-xs">(ت {row.book_death}هـ)</span>
                    )}
                    {(row.num_harf || row.num_matboa) && (
                      <>
                        <span className="text-gray-300">—</span>
                        <Link
                          href={`/hadith/${row.hadith_id}`}
                          className={`font-medium hover:underline ${row.is_source ? 'text-amber-700' : 'text-green-700 hover:text-green-500'}`}
                        >
                          (<HadithNumber harf={row.num_harf} matboa={row.num_matboa} />)
                        </Link>
                      </>
                    )}

                    {/* Badges */}
                    <span className="inline-flex flex-wrap gap-1 mr-1">
                      {row.is_source && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">المصدر</span>
                      )}
                      {row.old_label && (
                        <OldLabelBadge label={row.old_label} />
                      )}
                      {!row.old_label && !row.is_source && (
                        <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">بدون تصنيف قديم</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">
              لا توجد روايات بنسبة تطابق {minScore}٪ أو أكثر
            </p>
          )}
        </>
      )}

      {!loading && !error && allRows.length === 0 && (
        <p className="text-sm text-gray-400 py-4">لا يوجد تخريج لهذا الحديث</p>
      )}
    </section>
  )
}
