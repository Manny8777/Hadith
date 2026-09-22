'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import HadithNumber from '@/app/components/HadithNumber'

type NarratorLike = { id: number; name: string; abb_name: string; is_companion?: boolean }
type Narrator = NarratorLike & { hadiths_count?: number }
type Candidate = NarratorLike & { pair_count: number }
type ResultRow = {
  main_id: number
  book_name: string
  section_text: string | null
  chapter_text: string | null
  part_num: number | null
  page_num: number | null
  tarf: string
  grade_hint: string | null
  tarqeem_harf?: string
  tarqeem_matboa1?: string
  parallel_count?: number | null
}

const stripTags = (s: string) => (s || '').replace(/<[^>]*>/g, '').trim()
const arNum = (n: number) => n.toLocaleString('ar-EG')

const GRADES: { key: string; label: string; active: boolean }[] = [
  { key: '', label: 'الكل', active: false },
  { key: 'sahih', label: 'صحيح', active: false },
  { key: 'hasan', label: 'حسن', active: false },
  { key: 'daif', label: 'ضعيف', active: false },
]

export default function SanadBuilderPage() {
  const [selected, setSelected] = useState<Narrator[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [candLoading, setCandLoading] = useState(false)

  // step 1 autocomplete
  const [q, setQ] = useState('')
  const [ac, setAc] = useState<Narrator[]>([])
  const [acLoading, setAcLoading] = useState(false)
  const [showAc, setShowAc] = useState(false)

  // results
  const [results, setResults] = useState<ResultRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [grade, setGrade] = useState('')
  const [resultsLoading, setResultsLoading] = useState(false)
  const [searchDone, setSearchDone] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)

  // ---- shareable chain link: hydrate ?ids= on mount ----
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ids = (params.get('ids') || '').split(',').map(s => parseInt(s)).filter(n => !isNaN(n) && n > 0)
    if (ids.length < 1 || ids.length > 5) return
    const controller = new AbortController()
    fetch(`/api/chain-share?ids=${ids.join(',')}`, { signal: controller.signal })
      .then(r => r.json())
      .then((rows: Narrator[]) => {
        // Preserve the requested order, drop any unknown ids.
        setSelected(rows.filter(r => ids.includes(r.id)).map(r => ({
          id: r.id, name: r.name, abb_name: r.abb_name || r.name, is_companion: r.is_companion,
        })))
        if (params.get('page')) {
          const p = parseInt(params.get('page')!) || 1
          const g = params.get('grade') || ''
          setPage(p)
          setSearchDone(true)
          const gurl = `/api/chain-filter?narrator_ids=${ids.join(',')}&page=${p}&grade=${encodeURIComponent(g)}`
          fetch(gurl).then(r => r.json()).then(d => {
            setResults((d.results || []) as ResultRow[])
            setTotal(parseInt(d.total || '0'))
          }).catch(() => {})
        }
      })
      .catch(() => {})
    return () => controller.abort()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- copy shareable chain link ----
  const chainLink = selected.length > 0 ? `${window.location.origin}/asaneed/builder?ids=${selected.map(n => n.id).join(',')}` : ''
  const copyChainLink = useCallback(async () => {
    if (!chainLink) return
    try { await navigator.clipboard.writeText(chainLink) }
    catch { /* clipboard blocked; fallback below */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [chainLink])

  // ---- autocomplete (debounced) ----
  useEffect(() => {
    if (selected.length > 0 || q.trim().length < 2) {
      setAc([])
      return
    }
    const controller = new AbortController()
    const t = setTimeout(async () => {
      setAcLoading(true)
      try {
        const r = await fetch(`/api/narrators-search?q=${encodeURIComponent(q)}&limit=12`, { signal: controller.signal })
        const rows = (await r.json()) as Narrator[]
        setAc(rows)
        setShowAc(true)
      } catch (e) {
        if ((e as any)?.name !== 'AbortError') setErr('خطأ في الاتصال')
      } finally {
        setAcLoading(false)
      }
    }, 300)
    return () => { clearTimeout(t); controller.abort() }
  }, [q, selected.length])

  // ---- next-narrator candidates ----
  useEffect(() => {
    if (selected.length === 0) return
    const last = selected[selected.length - 1]
    const controller = new AbortController()
    setCandLoading(true)
    fetch(`/api/chain-candidates?narrator_id=${last.id}&direction=next`, { signal: controller.signal })
      .then(r => r.json())
      .then((rows: Candidate[]) => setCandidates(rows))
      .catch(e => { if ((e as any)?.name !== 'AbortError') setCandidates([]) })
      .finally(() => setCandLoading(false))
    return () => controller.abort()
  }, [selected])

  const removeAt = useCallback((i: number) => {
    setSelected(s => s.slice(0, i).concat(s.slice(i + 1)))
  }, [])

  const clearAll = useCallback(() => {
    setSelected([])
    setCandidates([])
    setQ('')
    setResults([])
    setTotal(0)
    setPage(1)
    setSearchDone(false)
    setErr('')
  }, [])

  const doSearch = useCallback(async (p: number, g: string) => {
    if (selected.length === 0) return
    setErr('')
    setResultsLoading(true)
    setPage(p)
    setSearchDone(true)
    const ids = selected.map(n => n.id).join(',')
    const url = `/api/chain-filter?narrator_ids=${encodeURIComponent(ids)}&page=${p}&grade=${encodeURIComponent(g)}`
    try {
      const r = await fetch(url)
      const d = await r.json()
      setResults((d.results || []) as ResultRow[])
      setTotal(parseInt(d.total || '0'))
    } catch {
      setErr('خطأ في البحث، حاول مجدداً')
    } finally {
      setResultsLoading(false)
    }
  }, [selected])

  const clickCandidate = (n: NarratorLike) => {
    if (selected.length >= 5) return
    if (selected.some(s => s.id === n.id)) return
    setSelected(s => [...s, n])
  }

  const totalPages = Math.max(1, Math.ceil(total / 20))
  const chainSummary = selected.length === 0 ? null : selected.map((n, i) => {
    const label = n.abb_name || n.name.slice(0, 32)
    return (
      <span key={n.id} className="flex items-center">
        <button
          type="button"
          title={`حذف "${n.name}" من السند`}
          className={`inline-flex items-center gap-0.5 border rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-green-50 hover:border-green-300 ${
            i === selected.length - 1 ? 'bg-green-700 text-white border-green-700 hover:bg-green-800' : 'bg-green-50 text-green-800 border-green-200'
          }`}
          onClick={() => removeAt(i)}
        >
          <span className="truncate max-w-[10rem]">{label}</span>
          <span className="text-xs opacity-70 ml-0.5">✕</span>
        </button>
        {i < selected.length - 1 && (
          <span className="text-green-500 mx-2 text-sm select-none shrink-0" title="التنصيب التالية">←</span>
        )}
      </span>
    )
  })

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-gray-400 mb-6 flex-wrap" dir="rtl">
        <Link href="/" className="hover:text-green-700">الرئيسية</Link>
        <span className="text-gray-300">›</span>
        <Link href="/search" className="hover:text-green-700">البحث</Link>
        <span className="text-gray-300">›</span>
        <span className="text-green-800 font-medium">البحث بواسطة السند</span>
      </nav>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">البحث بواسطة السند</h1>
        <p className="text-gray-500 text-sm mt-1 leading-relaxed">
          ابنِ السند راوياً راوياً: اختر الراوي الأول (قريباً من النبي ﷺ)، ثم اختر من رُوي عنه، حتى المصنّف.
          ستظهر لك أحاديث تحتوي على هذه الروايات المتتابعة في الإسناد.
        </p>
      </div>

      {/* ===== Step 1: pick first narrator ===== */}
      {selected.length === 0 && (
        <div className="ui-card p-5">
          <div className="relative">
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="اكتب اسم الراوي الأول… (مثال: أنس، أو أبو هريرة)"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-green-700 focus:border-transparent"
              dir="rtl"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && ac[0]) { e.preventDefault(); clickCandidate(ac[0]); }
              }}
            />
            {acLoading && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">…</span>
            )}
            {ac.length > 0 && showAc && (
              <ul className="absolute z-20 w-full mt-1 border border-gray-200 rounded-xl bg-white shadow-lg max-h-80 overflow-auto">
                {ac.map(n => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => { clickCandidate(n); setShowAc(false); }}
                      className="w-full text-right px-4 py-2.5 text-sm hover:bg-green-50 transition-colors flex items-center justify-between gap-2"
                    >
                      <span className="truncate max-w-[28rem]">{n.abb_name || n.name}</span>
                      {n.is_companion && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium shrink-0">صاحب</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {q.trim().length >= 2 && ac.length === 0 && !acLoading && (
              <p className="text-sm text-gray-400 mt-2">لم يُوجد راوي بهذا الاسم — جرّب اسم آخر (مثال: «أنس» أو «البخاري»)</p>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            يُطلب الاسم الكامل أو الجزء الأول — مثل: «أنس بن مالك»، «أبو هريرة»، «البخاري»
          </p>
        </div>
      )}

      {/* ===== Chain composer ===== */}
      {selected.length > 0 && (
        <div className="space-y-4">
          <div className="ui-card p-4">
            <div className="text-xs text-gray-500 mb-2">السند الحالي ({selected.length} راوي):</div>
            <div className="flex flex-wrap items-center justify-start gap-1.5" dir="rtl">
              {chainSummary}
            </div>
            <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-100 flex-wrap">
              <button
                type="button"
                onClick={() => doSearch(1, grade)}
                className="bg-green-700 hover:bg-green-800 text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition-colors"
                disabled={resultsLoading}
              >
                🔎 بحث الأحاديث ({selected.length >= 2 ? 'سند مركّب' : 'راوٍ واحد'})
              </button>
              {chainLink && (
                <button
                  type="button"
                  onClick={copyChainLink}
                  title="نسخ رابط هذا السند — يُفتح مباشرةً"
                  className={`text-sm font-semibold px-4 py-2.5 rounded-xl border transition-colors ${
                    copied ? 'bg-green-700 text-white border-green-700' : 'bg-white text-green-800 border-green-300 hover:bg-green-50'
                  }`}
                >
                  {copied ? '✓ نُسخ' : '📎 نسخ رابط السند'}
                </button>
              )}
              <button type="button" onClick={() => removeAt(selected.length - 1)} className="text-sm text-gray-500 hover:text-green-700 hover:underline">
                ← حذف الأخير
              </button>
              <button type="button" onClick={clearAll} className="text-sm text-gray-400 hover:text-red-600 hover:underline">
                مسح الكل
              </button>
            </div>
          </div>

          {selected.length < 5 && (
            <div className="ui-card p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="font-semibold text-gray-900 text-sm">
                    من رُوي بعد «{selected[selected.length - 1].abb_name}» في أيِّ إسناد مسجّل؟
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">اختر الراوي التالي لإكمال السند — الأسماء مرتبةً بأكثر الروايات شيوعاً</p>
                </div>
                {selected.length >= 1 && (
                  <span className="text-xs text-green-700 font-medium">السلسلة: {selected.length}/5</span>
                )}
              </div>

              {candLoading && (
                <div className="text-sm text-gray-500 text-center py-6">جاري تحميل الراوية التاليين…</div>
              )}

              {!candLoading && candidates.length === 0 && (
                <div className="text-sm text-gray-500 py-6">
                  لا يوجد راوي رُوي بعد هذا الراوي في الأسانيد المسجّلة — قد يكون هذا الراوي في آخر السند (المصنّف)
                  أو في أول السند. جرّب راوياً آخر من القائمة أو ازل هذا الراوي.
                </div>
              )}

              {!candLoading && candidates.length > 0 && (
                <ul className="space-y-1 max-h-96 overflow-y-auto pr-1">
                  {candidates.map(n => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => clickCandidate(n)}
                        className="w-full text-right px-3 py-2 border border-gray-100 rounded-xl bg-white hover:bg-green-50 hover:border-green-200 transition-colors text-sm flex items-center justify-between gap-3"
                      >
                        <span className="truncate max-w-[22rem]">{n.name}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          {n.is_companion && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700">صاحب</span>
                          )}
                          <span className="text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full font-medium" title={arNum(n.pair_count) + ' نقلات متتالية'}>
                            ×{arNum(n.pair_count)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== Results ===== */}
      {searchDone && (
        <div className="mt-8">
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <div>
              <p className="text-gray-700">
                {total === 0 ? 'لا توجد نتائج' : (
                  <span>
                    <span className="font-bold">{arNum(total)}</span> حديثاً في هذه الأسانيد
                  </span>
                )}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {resultsLoading ? 'جاري البحث…' : total > 0 && (
                  <>صفحة {arNum(page)} من {arNum(totalPages)}</>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {GRADES.map(g => (
                <button
                  key={g.key || '__all'}
                  type="button"
                  onClick={() => { setGrade(g.key); doSearch(1, g.key) }}
                  disabled={resultsLoading}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    grade === g.key
                      ? g.key === '' ? 'bg-gray-700 text-white border-gray-700' :
                        g.key === 'sahih' ? 'bg-green-700 text-white border-green-700' :
                        g.key === 'hasan' ? 'bg-amber-600 text-white border-amber-600' :
                        'bg-red-600 text-white border-red-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {err && <div className="ui-card p-3 text-sm text-red-600 mb-4">{err}</div>}

          {resultsLoading && total === 0 && (
            <div className="text-gray-500 text-center py-8">جاري البحث…</div>
          )}

          {!resultsLoading && results.length === 0 && (
            <div className="ui-card p-8 text-center text-gray-400 text-sm">
              لا توجد أحاديث تطابق هذا السند — قد يكون بعض الرواة غير متتابعين في الإسناد، أو جرّب درجات أخرى أو سُنَداً أقصر.
            </div>
          )}

          {results.map(r => (
            <Link
              key={r.main_id}
              href={`/hadith/${r.main_id}`}
              className="block ui-card px-5 py-4 hover:border-green-300 transition-all mb-3"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs text-green-700 font-semibold">{r.book_name}</span>
                {r.grade_hint && (
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 font-medium ${
                    r.grade_hint === 'صحيح' ? 'bg-green-100 text-green-700' :
                    r.grade_hint === 'حسن' ? 'bg-amber-100 text-amber-700' :
                    r.grade_hint === 'ضعيف' ? 'bg-red-100 text-red-600' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {r.grade_hint}
                  </span>
                )}
              </div>
              {(r.section_text?.trim() || r.chapter_text?.trim()) && (
                <div className="text-xs text-gray-500 mb-2">
                  {r.section_text?.trim()} {r.chapter_text?.trim()}
                </div>
              )}
              <p className="text-gray-800 text-sm leading-relaxed line-clamp-4">
                {stripTags(r.tarf).slice(0, 300) || '...'}
              </p>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {((r.part_num ?? 0) > 0 || (r.page_num ?? 0) > 0) && (
                  <span className="text-xs text-gray-400">ج{r.part_num ?? 0} ص{r.page_num ?? 0}</span>
                )}
                <HadithNumber harf={r.tarqeem_harf} matboa={r.tarqeem_matboa1} />
                {r.parallel_count != null && r.parallel_count > 0 && (
                  <span
                    className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100 mr-auto"
                    title={`ورد في ${r.parallel_count} مصدر آخر`}
                  >
                    {r.parallel_count} رواية موازية
                  </span>
                )}
              </div>
            </Link>
          ))}

          {totalPages > 1 && !resultsLoading && (
            <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
              {page > 1 && (
                <button
                  type="button"
                  onClick={() => doSearch(page - 1, grade)}
                  className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm"
                >
                  السابق
                </button>
              )}
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                let pg: number
                if (totalPages <= 7) pg = i + 1
                else if (page <= 4) pg = i + 1
                else if (page >= totalPages - 3) pg = totalPages - 6 + i
                else pg = page - 3 + i
                return (
                  <button
                    key={pg}
                    type="button"
                    onClick={() => doSearch(pg, grade)}
                    className={`px-4 py-2 rounded-lg border text-sm ${
                      pg === page
                        ? 'bg-green-800 text-white border-green-800'
                        : 'border-gray-200 bg-white text-green-800 hover:border-green-300'
                    }`}
                  >
                    {pg.toLocaleString('ar-EG')}
                  </button>
                )
              })}
              {page < totalPages && (
                <button
                  type="button"
                  onClick={() => doSearch(page + 1, grade)}
                  className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm"
                >
                  التالي
                </button>
              )}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={clearAll}
                className="text-sm text-gray-400 hover:text-green-700 hover:underline"
              >
                ← ارجع لاختيار سِند جديد
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
