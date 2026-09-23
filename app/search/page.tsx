'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import HadithNumber from '@/app/components/HadithNumber'
import SaveHadith from '@/app/components/SaveHadith'

interface SearchResult {
  main_id: number
  book_id: number
  book_name: string
  tarf: string
  section_text: string
  chapter_text: string
  part_num: number
  page_num: number
  tarqeem_harf?: string | null
  tarqeem_matboa1?: string | null
  grade_hint?: string | null
  parallel_count?: number | null
  // Match line for the matn, built server-side: the opening words and each place the query matches
  // with a couple of words either side, elided with '…'. null when the query has no text terms or
  // the match is beyond the text the server reads for it.
  snippet?: { t: string; hit: boolean }[] | null
}

interface Book { id: number; title: string }
interface SubjectCat { id: number; title: string }

// search_scope: 'both' = بحث في المتن كاملاً، 'tarf' = بحث في الأطراف فقط
type SearchScope = 'both' | 'tarf'
// match: 'phrase' = متتالية (the original's default), 'all' = كل الكلمات, 'any' = أي من الكلمات
type MatchMode = 'phrase' | 'all' | 'any'

function stripTags(html: string) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function SearchInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialQ = searchParams.get('q') || ''
  const initialBookId = searchParams.get('book_id') || ''
  const narratorIdParam = searchParams.get('narrator_id') || ''
  const narratorNameParam = searchParams.get('narrator_name') || ''

  const [q, setQ] = useState(initialQ)
  const [bookId, setBookId] = useState(initialBookId)
  const [gradeFilter, setGradeFilter] = useState(searchParams.get('grade') || '')
  const [subjectCatId, setSubjectCatId] = useState(searchParams.get('subject_cat_id') || '')
  const [maxDepth, setMaxDepth] = useState(searchParams.get('max_depth') || '')
  const [searchScope, setSearchScope] = useState<SearchScope>(
    (searchParams.get('search_scope') as SearchScope) || 'both'
  )
  const [matchMode, setMatchMode] = useState<MatchMode>(
    (searchParams.get('match') as MatchMode) || 'phrase'
  )

  // The search box shows connectives as blocked-out tokens behind the text, so the reader can see
  // which words are operators and which are words — و and أو are also letters inside ordinary words.
  const inputRef = useRef<HTMLInputElement | null>(null)
  const highlightRef = useRef<HTMLDivElement | null>(null)
  const [books, setBooks] = useState<Book[]>([])
  const [subjectCats, setSubjectCats] = useState<SubjectCat[]>([])
  const [results, setResults] = useState<SearchResult[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [mode, setMode] = useState<string>('text')

  useEffect(() => {
    fetch('/api/books')
      .then(r => r.json())
      .then(data => setBooks(Array.isArray(data) ? data : data.books || []))
      .catch(() => {})
    fetch('/api/subject-categories')
      .then(r => r.json())
      .then(data => setSubjectCats(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  const doSearch = useCallback(async (
    query: string,
    bId: string,
    pg = 1,
    nid = '',
    scope: SearchScope = searchScope
  ) => {
    setLoading(true)
    setSearched(true)
    try {
      let url: string
      if (nid && query.trim().length >= 2) {
        // Combined narrator + text search
        url = `/api/search?narrator_id=${encodeURIComponent(nid)}&q=${encodeURIComponent(query)}&page=${pg}&search_scope=${scope}${matchMode !== 'phrase' ? `&match=${matchMode}` : ''}`
        if (gradeFilter) url += `&grade=${encodeURIComponent(gradeFilter)}`
      } else if (nid) {
        // Narrator-only: all hadiths in chain
        url = `/api/search?narrator_id=${encodeURIComponent(nid)}&page=${pg}`
        if (gradeFilter) url += `&grade=${encodeURIComponent(gradeFilter)}`
      } else {
        if (query.trim().length < 2) { setLoading(false); return }
        url = `/api/search?q=${encodeURIComponent(query)}&page=${pg}&search_scope=${scope}${matchMode !== 'phrase' ? `&match=${matchMode}` : ''}`
        if (bId) url += `&book_id=${encodeURIComponent(bId)}`
        if (gradeFilter) url += `&grade=${encodeURIComponent(gradeFilter)}`
        if (subjectCatId) url += `&subject_cat_id=${encodeURIComponent(subjectCatId)}`
        if (maxDepth) url += `&max_depth=${encodeURIComponent(maxDepth)}`
      }
      const res = await fetch(url)
      const data = await res.json()
      setResults(data.results || [])
      setTotal(data.total || 0)
      setPage(pg)
      setMode(data.mode || 'text')
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [gradeFilter, subjectCatId, maxDepth, searchScope, matchMode])

  useEffect(() => {
    if (narratorIdParam) {
      doSearch(initialQ, '', 1, narratorIdParam)
    } else if (initialQ.length >= 2) {
      doSearch(initialQ, initialBookId)
    }
  }, [narratorIdParam, initialQ, initialBookId, doSearch])

  const isNarratorMode = !!narratorIdParam

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = q.trim()
    if (isNarratorMode) {
      let url = `/search?narrator_id=${encodeURIComponent(narratorIdParam)}`
      if (narratorNameParam) url += `&narrator_name=${encodeURIComponent(narratorNameParam)}`
      if (trimmed) url += `&q=${encodeURIComponent(trimmed)}`
      if (searchScope !== 'both') url += `&search_scope=${searchScope}`
      if (matchMode !== 'phrase') url += `&match=${matchMode}`
      router.push(url)
      doSearch(trimmed, '', 1, narratorIdParam, searchScope)
    } else {
      let url = `/search?q=${encodeURIComponent(trimmed)}`
      if (bookId) url += `&book_id=${encodeURIComponent(bookId)}`
      if (searchScope !== 'both') url += `&search_scope=${searchScope}`
      if (matchMode !== 'phrase') url += `&match=${matchMode}`
      router.push(url)
      doSearch(trimmed, bookId, 1, '', searchScope)
    }
  }

  function handleScopeChange(newScope: SearchScope) {
    setSearchScope(newScope)
    // Re-run search immediately with new scope if we already have results
    if (searched && (q.trim().length >= 2 || isNarratorMode)) {
      doSearch(q, bookId, 1, narratorIdParam, newScope)
    }
  }

  function handleMatchChange(newMatch: MatchMode) {
    setMatchMode(newMatch)
    // Re-run immediately, like the scope toggle does.
    if (searched && (q.trim().length >= 2 || isNarratorMode)) {
      doSearch(q, bookId, 1, narratorIdParam, searchScope)
    }
  }

  // The original dialog composes its WHERE clause from operators (' AND ', ' OR ', ' NOT ', ' XOR ')
  // and wildcards ('*', '?') — that is how its two-word and "contains this but not that" searches
  // are expressed (legacy-audit/10-legacy-search-callsite.md §2b). The keys below just type them.
  // The keys type the connective in Arabic — the same words the API accepts (و / أو / ليس) — so what
  // appears in the box is what the reader sees, with no English operator arriving from nowhere.
  // The same whitespace-delimited rule the API applies when it parses the query — so the highlight
  // and the server can never disagree about what is an operator. A token counts only when it stands
  // alone: والزكاة, بدونه, ولاية are words and stay unhighlighted.
  const CONN_TOKEN = /^(?:AND|OR|NOT|XOR|و|أو|ليس|وليس|بدون|وبدون)$/i
  function highlightTokens(raw: string): { text: string; conn: boolean }[] {
    return raw
      .split(/(\s+)/)
      .map(seg => ({ text: seg, conn: seg.trim() !== '' && CONN_TOKEN.test(seg.trim()) }))
  }

  // Keep the highlight layer aligned with the input when the text is longer than the box.
  function syncHighlight(el: HTMLInputElement) {
    const hl = highlightRef.current
    if (hl) hl.scrollLeft = el.scrollLeft
  }

  function insertOp(op: 'AND' | 'OR' | 'NOT' | '*' | '?') {
    setQ(prev => {
      const t = prev.trim()
      if (op === '*' || op === '?') return `${t}${op}`
      // A connective needs something to connect: with an empty box it does nothing, so the reader
      // never gets a query that starts with a dangling «ليس».
      if (!t) return prev
      const word = op === 'AND' ? 'و' : op === 'OR' ? 'أو' : 'ليس'
      // «و ليس» rather than a bare «ليس» so the connective is unambiguous and the API reads the
      // NOT from the connector instead of having to rescue a leading word.
      return op === 'NOT' ? `${t} و ليس ` : `${t} ${word} `
    })
    // Leave the caret at the end, ready for the next word: clicking a key should read as "و" then
    // keep typing, not as a click that steals focus.
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (el) {
        el.focus()
        el.setSelectionRange(el.value.length, el.value.length)
        syncHighlight(el)
      }
    })
  }

  const totalPages = Math.ceil(total / 20)

  return (
    <div dir="rtl">
      <h1 className="text-3xl font-bold text-green-900 mb-6 font-display">البحث في الأحاديث</h1>

      {/* Narrator mode banner */}
      {isNarratorMode && narratorNameParam && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 flex items-center justify-between">
          <div className="text-sm text-amber-800">
            يروي:
            <Link href={`/narrator/${narratorIdParam}`} className="font-bold text-green-800 hover:underline mr-2">
              {narratorNameParam}
            </Link>
            {mode === 'narrator+text' && q && (
              <span className="text-amber-700 mr-2">— يحتوي على: <strong>{q}</strong></span>
            )}
          </div>
          <Link href="/search" className="text-xs text-gray-400 hover:text-gray-600">
            بحث نصي
          </Link>
        </div>
      )}

      {/* Search form — always visible */}
      <form onSubmit={handleSubmit} className="mb-8">
        <div className="flex gap-3 mb-3">
          <div className="relative flex-1 rounded-lg border border-gray-300 bg-white shadow-sm focus-within:ring-2 focus-within:ring-green-700">
            {/* Highlight layer, behind the text. Invisible except for the connector tokens, and
                mirroring the input's font/padding exactly so the blocks land under the words. */}
            <div
              ref={highlightRef}
              aria-hidden
              className="pointer-events-none absolute inset-0 select-none overflow-hidden whitespace-pre rounded-lg px-4 py-3 text-lg text-transparent"
              dir="rtl"
            >
              {highlightTokens(q).map((t, i) =>
                t.conn ? (
                  <mark
                    key={i}
                    className="rounded-sm bg-amber-200 text-transparent shadow-[0_0_0_2px_rgba(253,230,138,0.85)]"
                  >
                    {t.text}
                  </mark>
                ) : (
                  <span key={i}>{t.text}</span>
                )
              )}
            </div>
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={e => { setQ(e.target.value); syncHighlight(e.target) }}
              onScroll={e => syncHighlight(e.currentTarget)}
              placeholder={isNarratorMode
                ? `بحث في أحاديث ${narratorNameParam || 'الراوي'}...`
                : 'ابحث في الأحاديث النبوية...'
              }
              className="relative w-full rounded-lg bg-transparent px-4 py-3 text-lg focus:outline-none"
              dir="rtl"
            />
          </div>
          <button
            type="submit"
            className="bg-green-900 text-white px-6 py-3 rounded-lg hover:bg-green-800 transition-colors font-semibold"
          >
            بحث
          </button>
        </div>

        {/* Search scope toggle — نوع البحث */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-500 shrink-0">نوع البحث:</span>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => handleScopeChange('both')}
              className={`px-3 py-1.5 transition-colors ${
                searchScope === 'both'
                  ? 'bg-green-800 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              بحث في المتن كاملاً
            </button>
            <button
              type="button"
              onClick={() => handleScopeChange('tarf')}
              className={`px-3 py-1.5 border-r border-gray-200 transition-colors ${
                searchScope === 'tarf'
                  ? 'bg-green-800 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              الأطراف فقط
            </button>
          </div>
          {searchScope === 'tarf' && (
            <span className="text-xs text-amber-600">
              — يبحث في أول الحديث (الطرف) فقط
            </span>
          )}
          {searchScope === 'both' && (
            <span className="text-xs text-gray-400">
              — يشمل المتن كاملاً والأطراف
            </span>
          )}
        </div>

        {/* Match mode + operator keys — the original's متتالية / كل الكلمات / أي من الكلمات, and the
            operators its dialog composes the WHERE clause from, offered in Arabic words (و / أو / ليس)
            that the API accepts as connectives. */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-xs text-gray-500 shrink-0">طريقة المطابقة:</span>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            {([['phrase', 'متتالية'], ['all', 'كل الكلمات'], ['any', 'أي من الكلمات']] as [MatchMode, string][]).map(
              ([value, label], i) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleMatchChange(value)}
                  className={`px-3 py-1.5 transition-colors ${i > 0 ? 'border-r border-gray-200 ' : ''}${
                    matchMode === value
                      ? 'bg-green-800 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              )
            )}
          </div>

          <span className="text-xs text-gray-500 shrink-0 mr-1">ربط الشروط:</span>
          <div className="flex gap-1">
            {([
              ['AND', 'و', 'وأيضاً: لا بدّ أن توجد الكلمة الأخرى أيضاً'],
              ['OR', 'أو', 'إحدى الكلمتين: أيّهما وُجد في الحديث'],
              ['NOT', 'ليس', 'بدون هذه الكلمة: توجد الأولى ولا توجد هذه'],
            ] as [string, string, string][]).map(([op, label, hint]) => (
              <button
                key={op}
                type="button"
                onClick={() => insertOp(op as 'AND' | 'OR' | 'NOT')}
                title={hint}
                className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
              >
                {label}
              </button>
            ))}
          </div>

          <span className="text-xs text-gray-500 shrink-0 mr-1">حروف ناقصة:</span>
          <div className="flex gap-1">
            {([
              ['*', 'أيّ عدد من الحروف *', 'مثال: صلا* تجد كل كلمة تبدأ بـ صلا'],
              ['?', 'حرف واحد ناقص ?', 'مثال: الصل? تجد الصلاة — حرف واحد لا تعرفه'],
            ] as [string, string, string][]).map(([op, label, hint]) => (
              <button
                key={op}
                type="button"
                onClick={() => insertOp(op as '*' | '?')}
                title={hint}
                className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-gray-400 mb-3 leading-relaxed">
          أمثلة:
          <span className="mx-1 text-gray-500 font-semibold">«الصلاة و الزكاة»</span>
          حديث فيه الكلمتان —
          <span className="mx-1 text-gray-500 font-semibold">«الصلاة و ليس الزكاة»</span>
          حديث فيه الأولى وليست فيه الثانية —
          <span className="mx-1 text-gray-500 font-semibold">«صلا*»</span>
          أيّ كلمة تبدأ بـ«صلا» —
          <span className="mx-1 text-gray-500 font-semibold">«الصل?»</span>
          كلمة مثل «الصلاة» ينقصها حرف واحد. (وتُقبل المعاملات الإنجليزية AND / OR / NOT كذلك.)
        </div>

        {/* Book + Grade filters */}
        {!isNarratorMode && (
          <div className="space-y-2">
            <div className="flex gap-3 items-center">
              <label className="text-sm text-gray-600 shrink-0 min-w-24">حسب الكتاب:</label>
              <select
                value={bookId}
                onChange={e => setBookId(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                dir="rtl"
              >
                <option value="">جميع الكتب</option>
                {books.map(b => (
                  <option key={b.id} value={String(b.id)}>{b.title}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 items-center">
              <label className="text-sm text-gray-600 shrink-0 min-w-24">درجة الحديث:</label>
              <select
                value={gradeFilter}
                onChange={e => setGradeFilter(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                dir="rtl"
              >
                <option value="">جميع الدرجات</option>
                <option value="sahih">صحيح / صحح</option>
                <option value="hasan">حسن</option>
                <option value="daif">ضعيف / منكر</option>
              </select>
              {(bookId || gradeFilter || subjectCatId || maxDepth) && (
                <button
                  type="button"
                  onClick={() => {
                    setBookId('')
                    setGradeFilter('')
                    setSubjectCatId('')
                    setMaxDepth('')
                    doSearch(q, '', 1, '', searchScope)
                  }}
                  className="text-sm text-gray-500 hover:text-red-600 transition-colors shrink-0"
                >
                  مسح الفلاتر
                </button>
              )}
            </div>
            {subjectCats.length > 0 && (
              <div className="flex gap-3 items-center">
                <label className="text-sm text-gray-600 shrink-0 min-w-24">حسب الموضوع:</label>
                <select
                  value={subjectCatId}
                  onChange={e => setSubjectCatId(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                  dir="rtl"
                >
                  <option value="">جميع الموضوعات</option>
                  {subjectCats.map(sc => (
                    <option key={sc.id} value={String(sc.id)}>{sc.title}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex gap-3 items-center">
              <label className="text-sm text-gray-600 shrink-0 min-w-24">علو الإسناد:</label>
              <select
                value={maxDepth}
                onChange={e => setMaxDepth(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                dir="rtl"
              >
                <option value="">أي طول</option>
                <option value="3">ثلاثي — ≤ 3 رواة</option>
                <option value="4">رباعي — ≤ 4 رواة</option>
                <option value="5">خماسي — ≤ 5 رواة</option>
                <option value="6">سداسي — ≤ 6 رواة</option>
              </select>
            </div>
          </div>
        )}

        {/* Grade filter chips for narrator mode */}
        {isNarratorMode && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xs text-gray-500">درجة الحديث:</span>
            {[
              { key: '', label: 'الكل' },
              { key: 'sahih', label: 'صحيح' },
              { key: 'hasan', label: 'حسن' },
              { key: 'daif', label: 'ضعيف' },
            ].map(g => (
              <button
                key={g.key}
                type="button"
                onClick={() => { setGradeFilter(g.key); doSearch(q, '', 1, narratorIdParam, searchScope) }}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  gradeFilter === g.key
                    ? (g.key === '' ? 'bg-gray-700 text-white border-gray-700' :
                       g.key === 'sahih' ? 'bg-green-700 text-white border-green-700' :
                       g.key === 'hasan' ? 'bg-amber-600 text-white border-amber-600' :
                       'bg-red-600 text-white border-red-600')
                    : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}
        {/* Clear narrator text filter */}
        {isNarratorMode && q && (
          <button
            type="button"
            onClick={() => {
              setQ('')
              doSearch('', '', 1, narratorIdParam, searchScope)
            }}
            className="text-xs text-gray-400 hover:text-gray-600 underline mt-1"
          >
            عرض جميع أحاديث الراوي
          </button>
        )}
      </form>

      {loading && <p className="text-gray-500 text-center py-8">جاري البحث...</p>}

      {!loading && searched && (
        <p className="text-gray-600 mb-4">
          {total > 0 ? (
            <>
              <span className="font-semibold">{total.toLocaleString('ar-EG')}</span> حديث
              {!isNarratorMode && bookId && books.length > 0 && (
                <span className="text-amber-700 mr-2">
                  — في: {books.find(b => String(b.id) === bookId)?.title || ''}
                </span>
              )}
              {!isNarratorMode && subjectCatId && subjectCats.length > 0 && (
                <span className="text-purple-700 mr-2">
                  — موضوع: {subjectCats.find(sc => String(sc.id) === subjectCatId)?.title || ''}
                </span>
              )}
              {!isNarratorMode && (
                <span className="text-gray-400 text-xs mr-2">
                  ({searchScope === 'tarf' ? 'بحث في الأطراف' : 'بحث في المتن كاملاً'})
                </span>
              )}
            </>
          ) : (
            <>
              لا توجد نتائج
              {searchScope === 'tarf' && (
                <button
                  type="button"
                  onClick={() => handleScopeChange('both')}
                  className="text-green-700 hover:underline text-sm mr-2"
                >
                  — جرّب البحث في المتن كاملاً
                </button>
              )}
            </>
          )}
        </p>
      )}

      <div className="grid gap-4">
        {results.map(r => (
          <div key={r.main_id} className="ui-card px-5 py-4 hover:border-green-300 transition-all flex flex-col gap-2">
            <Link href={`/hadith/${r.main_id}`} className="block">
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
            {/* The match line: where the query actually falls in the matn, with the matched words
                marked. Without it a match deep in a long matn was invisible in the results. */}
            {r.snippet && r.snippet.length > 0 && (
              <div className="rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-2">
                <span className="block text-[10px] font-semibold text-amber-700 mb-1">
                  موضع المطابقة في المتن
                </span>
                <p className="text-sm leading-relaxed text-gray-700">
                  {r.snippet.map((part, i) => (
                    <span key={i}>
                      {i > 0 ? ' ' : ''}
                      {part.hit ? (
                        <mark className="rounded bg-amber-200 px-0.5 font-semibold text-amber-900">
                          {part.t}
                        </mark>
                      ) : (
                        part.t
                      )}
                    </span>
                  ))}
                </p>
              </div>
            )}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {(r.part_num > 0 || r.page_num > 0) && (
                <span className="text-xs text-gray-400">
                  ج{r.part_num} ص{r.page_num}
                </span>
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
          <div className="flex justify-start mt-2">
            <SaveHadith hadithId={r.main_id} />
          </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2 flex-wrap">
          {page > 1 && (
            <button
              onClick={() => doSearch(q, bookId, page - 1, narratorIdParam, searchScope)}
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
                onClick={() => doSearch(q, bookId, pg, narratorIdParam, searchScope)}
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
              onClick={() => doSearch(q, bookId, page + 1, narratorIdParam, searchScope)}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm"
            >
              التالي
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="text-gray-500 py-8 text-center">تحميل...</div>}>
      <SearchInner />
    </Suspense>
  )
}
