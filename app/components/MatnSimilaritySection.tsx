'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import HadithNumber from './HadithNumber'
import { prepareForComparison, wordDice, queryRecall, splitIntoPhrases } from '@/lib/arabicSimilarity'

interface SimilarityRow {
  hadith_id:       number
  book_title:      string | null
  book_death:      number | null
  num_harf:        string | null
  num_matboa:      string | null
  old_label:       string | null
  matn_display:    string | null
  matn_normalized: string
  score:           number
  is_source:       boolean
}

interface ApiData {
  results:              SimilarityRow[]
  base_word_count:      number
  base_matn_display:    string
  base_matn_normalized: string
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

// `bare`: rendered inside a CollapsibleSection that already shows the title and anchor.
export default function MatnSimilaritySection({ hadithId, bare = false }: { hadithId: number; bare?: boolean }) {
  const [data, setData]             = useState<ApiData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(false)
  const [minScore, setMinScore]     = useState(100)
  // null = all selected (use server scores); Set<number> = specific phrase indices
  const [selected, setSelected]     = useState<Set<number> | null>(null)

  useEffect(() => {
    setLoading(true)
    setSelected(null)
    fetch(`/api/hadith/${hadithId}/matn-similarity`)
      .then(r => r.json())
      .then((d: ApiData & { error?: string }) => {
        if (d.error || !d.results) { setError(true); return }
        setData(d)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [hadithId])

  const phrases = useMemo(
    () => data ? splitIntoPhrases(data.base_matn_display) : [],
    [data]
  )

  // When selected is null → use server scores; when partial → recompute
  const rowsWithScores = useMemo(() => {
    if (!data) return []
    if (selected === null) return data.results

    const phraseIndices = selected.size === 0
      ? Array.from({ length: phrases.length }, (_, i) => i) // all if none selected
      : Array.from(selected)

    const queryText = phraseIndices.map(i => phrases[i]).join(' ')
    const queryNorm = prepareForComparison(queryText)

    if (!queryNorm) return data.results

    // Use queryRecall in partial mode: scores how much of the selected portion
    // appears in each hadith (100% = phrase fully present), not penalised by matn length
    return data.results.map(row => ({
      ...row,
      score: row.matn_normalized
        ? Math.round(queryRecall(queryNorm, row.matn_normalized) * 100)
        : 0,
    })).sort((a, b) => b.score - a.score)
  }, [data, selected, phrases])

  const filtered = useMemo(
    () => rowsWithScores.filter(r => r.is_source || r.score >= minScore),
    [rowsWithScores, minScore]
  )

  const togglePhrase = useCallback((idx: number) => {
    setSelected(prev => {
      // if null (all), start with all indices except this one
      const full = new Set(phrases.map((_, i) => i))
      const current = prev ?? full
      const next = new Set(current)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      // if all selected again, go back to null (server scores)
      if (next.size === phrases.length) return null
      return next
    })
  }, [phrases])

  const isPartialMode = selected !== null
  const allCount = data?.results.length ?? 0

  return (
    <section id={bare ? undefined : 'matn-similarity'} className={bare ? '' : 'mb-8 scroll-mt-14'} dir="rtl">

      {/* ── Header ── */}
      {!bare && (
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-base font-bold text-green-900 shrink-0 font-display">
            مطابقة المتون
          </h2>
          <span className="text-xs text-gray-400">حساب مباشر — نسبة تطابق الألفاظ بين المتون</span>
          <div className="flex-1 h-px bg-green-100" />
        </div>
      )}

      {/* ── Explanation pill ── */}
      <div className="flex flex-wrap gap-2 mb-4 text-[11px]">
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

      {!loading && !error && data && allCount > 0 && (
        <>
          {/* ── Phrase selector ── */}
          {phrases.length > 0 && (
            <div className="mb-5 p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold text-gray-600 tracking-wide">
                  اختر أجزاء المتن للمقارنة
                </span>
                <div className="flex gap-2">
                  {isPartialMode && (
                    <button
                      onClick={() => setSelected(null)}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 hover:underline px-2 py-0.5 rounded"
                    >
                      الكل
                    </button>
                  )}
                  {!isPartialMode && (
                    <span className="text-[11px] text-gray-400">انقر على جزء لتحديده</span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 leading-relaxed">
                {phrases.map((phrase, idx) => {
                  const isActive = selected === null || selected.has(idx)
                  return (
                    <button
                      key={idx}
                      onClick={() => togglePhrase(idx)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer text-right ${
                        isActive
                          ? 'bg-indigo-100 text-indigo-800 border-indigo-300 hover:bg-indigo-200'
                          : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {phrase}
                    </button>
                  )
                })}
              </div>
              {isPartialMode && (
                <p className="mt-2 text-[11px] text-amber-700">
                  المقارنة بناءً على {selected!.size} من {phrases.length} أجزاء
                </p>
              )}
            </div>
          )}

          {/* ── Controls bar ── */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-5 p-3 bg-gray-50 rounded-xl border border-gray-100">
            <span className="text-xs text-gray-600 font-medium shrink-0">
              {filtered.length} رواية
              {filtered.length !== allCount && (
                <span className="text-gray-400 font-normal"> (من {allCount})</span>
              )}
              {(data.base_word_count ?? 0) > 0 && (
                <span className="text-gray-400 font-normal mr-2">
                  · كلمات المتن: {data.base_word_count}
                </span>
              )}
              {isPartialMode && (
                <span className="mr-2 text-amber-600 font-semibold">· مقارنة جزئية</span>
              )}
            </span>

            <div className="flex items-center gap-3 flex-1 min-w-[240px]">
              <span className="text-xs text-gray-500 shrink-0">أدنى نسبة تطابق:</span>
              <input
                type="range" min={0} max={100} step={5}
                value={minScore}
                onChange={e => setMinScore(Number(e.target.value))}
                className="flex-1 min-w-0 h-1.5 rounded-full appearance-none cursor-pointer accent-indigo-600"
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

                      <span className="inline-flex flex-wrap gap-1 mr-0.5">
                        {row.is_source && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
                            المصدر الحالي
                          </span>
                        )}
                        {row.old_label ? (
                          <span
                            className="text-[10px] bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded-full"
                            title="تصنيف النظام القديم"
                          >
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
                    <p className="text-sm leading-loose text-gray-800 font-serif" dir="rtl">
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

      {!loading && !error && (!data || allCount === 0) && (
        <p className="text-sm text-gray-400 py-4">لا يوجد تخريج لهذا الحديث</p>
      )}
    </section>
  )
}
