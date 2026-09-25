'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import HadithNumber from '@/app/components/HadithNumber'

interface NarratorSuggestion {
  id: number
  name: string
  martaba_ibn_hajar: string | null
  tabaqa: string | null
}

interface HadithResult {
  main_id: number
  book_name: string
  tarf: string | null
  section_text: string | null
  chapter_text: string | null
  part_num: number
  page_num: number
  tarqeem_harf: string | null
  tarqeem_matboa1: string | null
  grade_hint?: string | null
}

function stripTags(html: string) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function gradeBadgeClass(grade: string | null) {
  if (!grade) return 'bg-gray-100 text-gray-600 border-gray-200'
  if (/ثقة|صحيح|عدل|صحابي/.test(grade)) return 'bg-green-100 text-green-800 border-green-200'
  if (/صدوق|حسن|مقبول/.test(grade)) return 'bg-amber-100 text-amber-800 border-amber-200'
  if (/ضعيف|منكر|متروك|كذاب/.test(grade)) return 'bg-red-100 text-red-700 border-red-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

function ChainFilterInner() {
  const searchParams = useSearchParams()
  const seedId = searchParams.get('seed')
  const presetParam = searchParams.get('preset')
  const [narrators, setNarrators] = useState<NarratorSuggestion[]>([])

  const autoSearchDone = useRef(false)

  useEffect(() => {
    const ids: number[] = []
    if (presetParam) {
      presetParam.split(',').forEach(s => {
        const n = parseInt(s.trim())
        if (!isNaN(n) && n > 0) ids.push(n)
      })
    } else if (seedId) {
      const n = parseInt(seedId)
      if (!isNaN(n) && n > 0) ids.push(n)
    }
    if (ids.length === 0) return
    Promise.all(ids.map(id => fetch(`/api/narrator-info?id=${id}`).then(r => r.json())))
      .then(results => {
        const valid = results.filter(d => d?.id)
        if (valid.length > 0) {
          setNarrators(valid)
          // Auto-search when preset has 2+ narrators
          if (ids.length >= 2 && !autoSearchDone.current) {
            autoSearchDone.current = true
            const idStr = ids.slice(0, 5).join(',')
            setLoading(true)
            setSearched(true)
            fetch(`/api/chain-filter?narrator_ids=${idStr}&page=1`)
              .then(r => r.json())
              .then(data => {
                setResults(data.results || [])
                setTotal(data.total || 0)
                setPage(1)
              })
              .catch(() => {})
              .finally(() => setLoading(false))
          }
        }
      })
      .catch(() => {})
  }, [seedId, presetParam])
  const [searchQ, setSearchQ] = useState('')
  const [suggestions, setSuggestions] = useState<NarratorSuggestion[]>([])
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [results, setResults] = useState<HadithResult[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')

  const searchNarrators = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setSuggestions([]); return }
    setSuggestLoading(true)
    try {
      const res = await fetch(`/api/narrators-search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setSuggestions(Array.isArray(data) ? data : [])
    } catch {
      setSuggestions([])
    } finally {
      setSuggestLoading(false)
    }
  }, [])

  const addNarrator = (n: NarratorSuggestion) => {
    if (narrators.length >= 5) return
    if (narrators.some(x => x.id === n.id)) return
    setNarrators(prev => [...prev, n])
    setSearchQ('')
    setSuggestions([])
  }

  const removeNarrator = (id: number) => {
    setNarrators(prev => prev.filter(n => n.id !== id))
  }

  const doSearch = useCallback(async (pg = 1) => {
    if (narrators.length < 2) {
      setError('يجب إضافة راويَين على الأقل')
      return
    }
    setError('')
    setLoading(true)
    setSearched(true)
    try {
      const ids = narrators.map(n => n.id).join(',')
      const res = await fetch(`/api/chain-filter?narrator_ids=${ids}&page=${pg}`)
      const data = await res.json()
      if (data.error) { setError(data.error); setResults([]); setTotal(0); return }
      setResults(data.results || [])
      setTotal(data.total || 0)
      setPage(pg)
    } catch {
      setError('حدث خطأ أثناء البحث')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [narrators])

  const totalPages = Math.ceil(total / 20)

  return (
    <div dir="rtl" className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/narrators" className="text-sm text-green-700 hover:underline">← الرواة</Link>
        <h1 className="text-2xl font-bold text-green-900 mt-2 mb-1">بحث سلاسل الرواة</h1>
        <p className="text-gray-500 text-sm">
          حدد راويَين أو أكثر للبحث عن الأحاديث التي تتضمن جميعهم في سند واحد
        </p>
      </div>

      {/* Narrator picker */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-6">
        <h2 className="font-bold text-gray-700 text-sm mb-3">اختر الرواة (2–5 رواة):</h2>

        {/* Selected narrators */}
        {narrators.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {narrators.map((n, i) => (
              <div key={n.id} className="flex items-center gap-1.5 bg-teal-50 border border-teal-200 rounded-full px-3 py-1.5">
                <span className="text-xs text-teal-600 font-mono bg-teal-100 rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <Link href={`/narrator/${n.id}`} className="text-sm text-teal-900 font-medium hover:underline">
                  {n.name}
                </Link>
                {n.martaba_ibn_hajar && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full border ${gradeBadgeClass(n.martaba_ibn_hajar)}`}>
                    {n.martaba_ibn_hajar}
                  </span>
                )}
                <button
                  onClick={() => removeNarrator(n.id)}
                  className="text-teal-400 hover:text-red-500 transition-colors text-base leading-none ml-1"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Narrator search input */}
        {narrators.length < 5 && (
          <div className="relative">
            <input
              type="text"
              value={searchQ}
              onChange={e => { setSearchQ(e.target.value); searchNarrators(e.target.value) }}
              placeholder="ابحث عن راوٍ لإضافته..."
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            {(suggestLoading || suggestions.length > 0) && (
              <div className="absolute top-full right-0 left-0 z-10 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-60 overflow-y-auto">
                {suggestLoading && (
                  <div className="px-4 py-3 text-sm text-gray-400">جاري البحث...</div>
                )}
                {suggestions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => addNarrator(s)}
                    className="w-full text-right px-4 py-2.5 hover:bg-teal-50 transition-colors flex items-center gap-2 group"
                  >
                    <span className="text-sm text-gray-800 group-hover:text-teal-900 flex-1">{s.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {s.martaba_ibn_hajar && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full border ${gradeBadgeClass(s.martaba_ibn_hajar)}`}>
                          {s.martaba_ibn_hajar}
                        </span>
                      )}
                      {s.tabaqa && (
                        <span className="text-xs text-gray-400">{s.tabaqa}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => doSearch(1)}
            disabled={narrators.length < 2 || loading}
            className="bg-teal-700 text-white px-6 py-2.5 rounded-lg hover:bg-teal-600 transition-colors font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'جاري البحث...' : 'بحث في الأسانيد'}
          </button>
          {narrators.length < 2 && (
            <span className="text-xs text-gray-400">أضف راويَين على الأقل للبدء</span>
          )}
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}
      </div>

      {/* Search info */}
      {!loading && searched && (
        <div className="mb-4 flex items-center justify-between">
          <p className="text-gray-600 text-sm">
            {total > 0 ? (
              <>
                <span className="font-semibold text-teal-700">{total.toLocaleString('ar-EG')}</span>
                {' '}حديث يحتوي سنده على جميع الرواة المحددين
              </>
            ) : (
              <span className="text-gray-500">لا توجد أحاديث تجمع هؤلاء الرواة في سند واحد</span>
            )}
          </p>
          {total > 0 && (
            <span className="text-xs text-gray-400">صفحة {page} / {totalPages}</span>
          )}
        </div>
      )}

      {/* Results */}
      <div className="grid grid-cols-1 gap-4">
        {results.map(r => (
          <Link
            key={r.main_id}
            href={`/hadith/${r.main_id}`}
            className="block bg-white rounded-xl border border-gray-100 px-5 py-4 hover:shadow-md hover:border-teal-200 transition-all group"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-teal-700 bg-teal-50 rounded-full px-3 py-1">{r.book_name}</span>
                {r.grade_hint && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    r.grade_hint === 'صحيح' ? 'bg-green-100 text-green-700' :
                    r.grade_hint === 'حسن' ? 'bg-amber-100 text-amber-700' :
                    r.grade_hint === 'ضعيف' ? 'bg-red-100 text-red-600' : ''
                  }`}>{r.grade_hint}</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <HadithNumber harf={r.tarqeem_harf} matboa={r.tarqeem_matboa1} />
                {(r.part_num > 0 || r.page_num > 0) && (
                  <span className="text-xs text-gray-400">
                    ج{r.part_num} ص{r.page_num}
                  </span>
                )}
              </div>
            </div>
            {(r.section_text || r.chapter_text) && (
              <p className="text-xs text-gray-400 mb-2">
                {[r.section_text, r.chapter_text].filter(Boolean).join(' — ')}
              </p>
            )}
            <p className="text-gray-800 text-sm leading-relaxed line-clamp-4">
              {r.tarf ? stripTags(r.tarf).slice(0, 350) : '...'}
            </p>
            <div className="mt-3 flex justify-end">
              <span className="text-xs text-teal-600 group-hover:text-teal-700 transition-colors">عرض كامل الإسناد ←</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          {page > 1 && (
            <button
              onClick={() => doSearch(page - 1)}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-teal-800 hover:border-teal-300 text-sm"
            >
              السابق
            </button>
          )}
          <span className="text-sm text-gray-500 px-2">{page} / {totalPages}</span>
          {page < totalPages && (
            <button
              onClick={() => doSearch(page + 1)}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-teal-800 hover:border-teal-300 text-sm"
            >
              التالي
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function ChainFilterPage() {
  return (
    <Suspense fallback={<div className="text-gray-500 py-8 text-center">تحميل...</div>}>
      <ChainFilterInner />
    </Suspense>
  )
}
