'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import HadithNumber from './HadithNumber'

interface SimilarityRow {
  hadith_id:    number
  book_title:   string | null
  book_death:   number | null
  num_harf:     string | null
  num_matboa:   string | null
  old_label:    string | null
  matn_display: string | null
  score:        number
  is_source:    boolean
}

function scoreBadgeClass(score: number): string {
  if (score >= 80) return 'bg-green-100 text-green-800 border-green-200'
  if (score >= 60) return 'bg-amber-100 text-amber-800 border-amber-200'
  if (score >= 40) return 'bg-orange-100 text-orange-800 border-orange-200'
  return 'bg-red-50 text-red-700 border-red-200'
}

function scoreBarClass(score: number): string {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-amber-400'
  if (score >= 40) return 'bg-orange-400'
  return 'bg-red-400'
}

export default function MatnSimilaritySection({ hadithId }: { hadithId: number }) {
  const [allRows, setAllRows]           = useState<SimilarityRow[]>([])
  const [baseWordCount, setBaseWordCount] = useState(0)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(false)
  const [minScore, setMinScore]         = useState(0)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/hadith/${hadithId}/matn-similarity`)
      .then(r => r.json())
      .then((data: { results?: SimilarityRow[]; base_word_count?: number; error?: string }) => {
        if (data.error || !data.results) { setError(true); return }
        setAllRows(data.results)
        setBaseWordCount(data.base_word_count ?? 0)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [hadithId])

  const filtered = useMemo(
    () => allRows.filter(r => r.is_source || r.score >= minScore),
    [allRows, minScore]
  )

  return (
    <section id="matn-similarity" className="mb-8 scroll-mt-14" dir="rtl">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-base font-bold text-green-900 shrink-0 font-display">
          مطابقة المتون
        </h2>
        <span className="text-xs text-gray-400">حساب مباشر — نسبة تطابق الألفاظ بين المتون</span>
        <div className="flex-1 h-px bg-green-100" />
      </div>

      {/* ── Old vs New labels ── */}
      <div className="flex flex-wrap gap-2 mb-4 text-[11px]">
        <span className="inline-flex items-center gap-1.5 bg-teal-50 text-teal-700 border border-teal-200 px-2.5 py-1 rounded-full">
          <span className="w-2 h-2 rounded-full bg-teal-400 shrink-0" />
          <span className="font-semibold">النظام القديم</span>
          تصنيف مسبق (بلفظه / بمثله / بنحوه…)
        </span>
        <span className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full">
          <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
          <span className="font-semibold">الحساب المباشر</span>
          نسبة التطابق اللفظي بعد تطبيع النص العربي
        </span>
      </div>

      {/* ── Loading / error ── */}
      {loading && (
        <div className="py-10 text-center text-sm text-gray-400">
          جارٍ حساب نسب التطابق…
        </div>
      )}
      {error && !loading && (
        <div className="py-6 text-center text-sm text-red-400">
          تعذّر حساب التطابق لهذا الحديث
        </div>
      )}

      {!loading && !error && allRows.length > 0 && (
        <>
          {/* ── Controls bar ── */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-5 p-3 bg-gray-50 rounded-xl border border-gray-100">
            {/* Count */}
            <span className="text-xs text-gray-600 font-medium shrink-0">
              {filtered.length} رواية
              {filtered.length !== allRows.length && (
                <span className="text-gray-400 font-normal"> (من {allRows.length})</span>
              )}
              {baseWordCount > 0 && (
                <span className="text-gray-400 font-normal mr-2">
                  · كلمات المتن الأصلي: {baseWordCount}
                </span>
              )}
            </span>

            {/* Slider */}
            <div className="flex items-center gap-3 flex-1 min-w-[240px]">
              <span className="text-xs text-gray-500 shrink-0">أدنى نسبة تطابق:</span>
              <input
                type="range" min={0} max={100} step={5}
                value={minScore}
                onChange={e => setMinScore(Number(e.target.value))}
                className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-indigo-600"
                style={{ direction: 'ltr' }}
              />
              <span className="w-10 text-sm font-bold text-indigo-700 text-left shrink-0">
                {minScore}٪
              </span>
            </div>
          </div>

          {/* ── Results ── */}
          <div className="space-y-4">
            {filtered.map((row, i) => (
              <div
                key={`${row.hadith_id}-${i}`}
                className={`rounded-xl border overflow-hidden transition-colors ${
                  row.is_source
                    ? 'border-amber-300 bg-amber-50/40'
                    : 'border-gray-200 bg-white'
                }`}
              >
                {/* Citation line */}
                <div className="flex items-start gap-3 px-4 py-3">
                  {/* Ordinal */}
                  <span className="text-gray-300 text-xs shrink-0 pt-0.5 w-5 text-center">
                    {i + 1}
                  </span>

                  {/* Score badge + bar */}
                  <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${scoreBadgeClass(row.score)}`}>
                      {row.score}٪
                    </span>
                    <div className="w-10 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${scoreBarClass(row.score)}`}
                        style={{ width: `${row.score}%` }}
                      />
                    </div>
                  </div>

                  {/* Book + num + badges */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-snug">
                      <Link
                        href={`/books/${row.hadith_id}`}
                        className="font-semibold text-green-800 hover:text-green-600 hover:underline"
                      >
                        {row.book_title ?? 'كتاب'}
                      </Link>

                      {row.book_death && (
                        <span className="text-gray-400 text-xs">(ت {row.book_death}هـ)</span>
                      )}

                      {(row.num_harf || row.num_matboa) && (
                        <>
                          <span className="text-gray-300">—</span>
                          <Link
                            href={`/hadith/${row.hadith_id}`}
                            className={`font-medium hover:underline ${
                              row.is_source
                                ? 'text-amber-700 hover:text-amber-600'
                                : 'text-green-700 hover:text-green-500'
                            }`}
                          >
                            (<HadithNumber harf={row.num_harf} matboa={row.num_matboa} />)
                          </Link>
                        </>
                      )}

                      {/* Badges */}
                      <span className="inline-flex flex-wrap gap-1 mr-0.5">
                        {row.is_source && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
                            المصدر الحالي
                          </span>
                        )}
                        {/* Old system label */}
                        {row.old_label ? (
                          <span className="text-[10px] bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded-full"
                            title="تصنيف النظام القديم">
                            {row.old_label}
                          </span>
                        ) : !row.is_source && (
                          <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">
                            بدون تصنيف قديم
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Matn text */}
                {row.matn_display && (
                  <div className={`px-4 pb-4 pt-1 border-t ${
                    row.is_source ? 'border-amber-100 bg-amber-50/30' : 'border-gray-100 bg-gray-50/50'
                  }`}>
                    <p className="text-[11px] text-gray-400 mb-1.5 font-medium tracking-wide">المتن</p>
                    <p
                      className="text-sm leading-loose text-gray-800 font-serif"
                      dir="rtl"
                    >
                      {row.matn_display}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">
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
