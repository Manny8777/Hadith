'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import HadithNumber from './HadithNumber'

// Strip diacritics for grouping key so "مختصراً" and "مختصرا" cluster together
function normDescKey(desc: string): string {
  return desc.replace(/\.$/, '').replace(/[ًٌٍَُِّْ]/g, '').trim()
}

// ── Word diff ─────────────────────────────────────────────────────────────────

type DiffChunk = { type: 'equal' | 'add' | 'del'; text: string }

// Normalize for comparison: unify alef variants, taa marbuta, alef maqsura, strip diacritics
function normWord(w: string): string {
  return w
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ًٌٍَُِّْ]/g, '')
}

function wordDiff(base: string, comp: string): { baseChunks: DiffChunk[]; compChunks: DiffChunk[] } {
  const bw = base.split(/\s+/).filter(Boolean)
  const cw = comp.split(/\s+/).filter(Boolean)
  const bn = bw.map(normWord)
  const cn = cw.map(normWord)
  const m = bw.length, n = cw.length

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = bn[i - 1] === cn[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])

  const bChunks: DiffChunk[] = [], cChunks: DiffChunk[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && bn[i - 1] === cn[j - 1]) {
      bChunks.unshift({ type: 'equal', text: bw[i - 1] })
      cChunks.unshift({ type: 'equal', text: cw[j - 1] })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      cChunks.unshift({ type: 'add', text: cw[j - 1] })
      j--
    } else {
      bChunks.unshift({ type: 'del', text: bw[i - 1] })
      i--
    }
  }
  return { baseChunks: bChunks, compChunks: cChunks }
}

function DiffText({ chunks, side }: { chunks: DiffChunk[]; side: 'base' | 'comp' }) {
  return (
    <p className="text-sm leading-loose text-right" dir="rtl">
      {chunks.map((c, i) => {
        if (c.type === 'equal') return <span key={i}>{c.text} </span>
        if (side === 'base' && c.type === 'del')
          return <span key={i} className="bg-blue-100 text-blue-800 rounded px-0.5">{c.text} </span>
        if (side === 'comp' && c.type === 'add')
          return <span key={i} className="bg-red-100 text-red-800 rounded px-0.5">{c.text} </span>
        return <span key={i}>{c.text} </span>
      })}
    </p>
  )
}

const DESC_SORT_ORDER = [
  'بمثله', 'بمثله مختصرا', 'بمثله مطولا',
  'بنحوه', 'بنحوه مختصرا', 'بنحوه مطولا',
  'بمعناه', 'بمعناه مختصرا', 'بمعناه مطولا',
  'بلفظه', 'من غير ذكر هذا اللفظ',
]

type ViewMode = 'ijmali' | 'mutawassit' | 'tafsili'
type SortBy = 'sihha' | 'shuhura' | 'wafayat'

export interface TakhrijRow {
  main_id: number
  book_id: number
  book_title: string | null
  book_strong: number | null
  book_fame: number | null
  book_takhrij_author: string | null
  book_takhrij_death: number | null
  tarf: string | null
  part_num: number
  page_num: number
  tarqeem_harf: string | null
  tarqeem_matboa1: string | null
  grade_hint: string | null
  matn_description: string | null
  kind: 'mutabaa' | 'shahid' | 'other'
}

function stripTags(html: string): string {
  return (html || '')
    .replace(/<رقم_حديث[^>]*>[^<]*<\/رقم_حديث>/g, '')
    .replace(/<رقم_الفقرة[^>]*\/>/g, '')
    .replace(/<نه\/>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, c: string) => String.fromCharCode(parseInt(c, 10)))
    .replace(/^\s*[-–—]\s*/, '').replace(/\s+/g, ' ').trim()
}

function partPage(row: TakhrijRow) {
  if (!row.part_num && !row.page_num) return null
  const parts = []
  if (row.part_num > 0) parts.push(`ج${row.part_num}`)
  if (row.page_num > 0) parts.push(`ص${row.page_num}`)
  return parts.join(' ')
}

/** Display a hadith number as plain text (for copy output) */
function numText(row: TakhrijRow): string {
  return row.tarqeem_matboa1 || row.tarqeem_harf || ''
}

const KIND_BADGE: Record<string, string> = {
  mutabaa: 'bg-blue-100 text-blue-700',
  shahid: 'bg-violet-100 text-violet-700',
}
const KIND_LABEL: Record<string, string> = {
  mutabaa: 'متابعة',
  shahid: 'شاهد',
}

const GRADE_BADGE: Record<string, string> = {
  صحيح: 'bg-green-100 text-green-700',
  حسن: 'bg-amber-100 text-amber-700',
  ضعيف: 'bg-red-100 text-red-600',
}

function sortRows(rows: TakhrijRow[], sortBy: SortBy): TakhrijRow[] {
  return [...rows].sort((a, b) => {
    if (sortBy === 'sihha') {
      return (a.book_strong ?? 9999) - (b.book_strong ?? 9999)
    }
    if (sortBy === 'shuhura') {
      return (a.book_fame ?? 9999) - (b.book_fame ?? 9999)
    }
    // wafayat
    const da = a.book_takhrij_death ?? 9999
    const db = b.book_takhrij_death ?? 9999
    if (da !== db) return da - db
    return (a.book_id ?? 0) - (b.book_id ?? 0)
  })
}

// ── Copy helper ───────────────────────────────────────────────────────────────

/**
 * Build Arabic prose citation text, grouped by book.
 * e.g. "أخرجه البخاري برقم (1543)، ومسلم برقم (1281، 1282)، والبزار برقم (2142) بمعناه مختصرا."
 */
function buildCopyText(rows: TakhrijRow[], sourceId: number): string {
  // Preserve order; group consecutive same-book entries together keeping sort order
  const bookOrder: number[] = []
  const bookMap = new Map<number, { title: string; entries: TakhrijRow[] }>()
  for (const row of rows) {
    if (!bookMap.has(row.book_id)) {
      bookOrder.push(row.book_id)
      bookMap.set(row.book_id, { title: row.book_title || `كتاب ${row.book_id}`, entries: [] })
    }
    bookMap.get(row.book_id)!.entries.push(row)
  }

  const parts: string[] = []
  for (let bi = 0; bi < bookOrder.length; bi++) {
    const { title, entries } = bookMap.get(bookOrder[bi])!
    const nums = entries.map(r => numText(r)).filter(Boolean)
    const connector = bi === 0 ? '' : bi === 1 ? 'و' : 'و'
    // Use Arabic "و" prefix — first book gets "أخرجه", rest get "و" + book name
    let part = bi === 0 ? `أخرجه ${title}` : `${connector}${title}`
    if (nums.length > 0) {
      part += ` برقم (${nums.join('، ')})`
    }
    // Find the dominant description for this book (excluding source hadith)
    const descs = entries
      .filter(r => r.main_id !== sourceId && r.matn_description)
      .map(r => r.matn_description!.replace(/\.$/, '').trim())
    if (descs.length > 0) {
      // Most common description
      const freq = new Map<string, number>()
      for (const d of descs) freq.set(d, (freq.get(d) ?? 0) + 1)
      const dominant = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0]
      part += ` ${dominant}`
    }
    parts.push(part)
  }

  return parts.join('، ') + '.'
}

// ── Small reusable CopyButton ─────────────────────────────────────────────────

function CopyButton({ getText, label = 'نسخ', className = '' }: {
  getText: () => string
  label?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(getText())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: do nothing silently
    }
  }, [getText])

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border transition-colors
        ${copied
          ? 'bg-green-100 text-green-700 border-green-300'
          : 'bg-white text-gray-500 border-gray-300 hover:border-green-400 hover:text-green-700'
        } ${className}`}
      title="نسخ نص التخريج"
    >
      {copied ? '✓ تم النسخ' : `📋 ${label}`}
    </button>
  )
}

// ── إجمالي view ──────────────────────────────────────────────────────────────

function IjmaliView({ rows, sourceId }: { rows: TakhrijRow[]; sourceId: number }) {
  // Deduplicate by book, preserving sorted order
  const bookOrder: number[] = []
  const bookMap = new Map<number, { row: TakhrijRow; count: number; hasSource: boolean }>()
  for (const row of rows) {
    if (bookMap.has(row.book_id)) {
      bookMap.get(row.book_id)!.count++
      if (row.main_id === sourceId) bookMap.get(row.book_id)!.hasSource = true
    } else {
      bookOrder.push(row.book_id)
      bookMap.set(row.book_id, { row, count: 1, hasSource: row.main_id === sourceId })
    }
  }
  const books = bookOrder.map(id => ({ id, ...bookMap.get(id)! }))

  const getCopyText = useCallback(() => {
    const names = books.map(b => b.row.book_title || `كتاب ${b.id}`)
    const joined = names.length <= 1
      ? names[0] ?? ''
      : names.slice(0, -1).join('، و') + '، و' + names[names.length - 1]
    return `أخرجه ${joined}  [${books.length} كتاب]`
  }, [books])

  return (
    <div>
      {/* Copy button top-right */}
      <div className="flex justify-end mb-3">
        <CopyButton getText={getCopyText} label="نسخ أسماء الكتب" />
      </div>

      <div className="space-y-1" dir="rtl">
        {books.map(({ id, row, count, hasSource }, i) => (
          <div key={id} className="flex items-center gap-2 py-1.5 border-b border-gray-100 last:border-0 text-sm">
            <span className="text-gray-300 shrink-0 w-5 text-xs text-center">{i + 1}</span>
            <div className="flex-1 flex items-center flex-wrap gap-x-2 gap-y-0.5">
              <Link
                href={`/books/${id}`}
                className="text-green-800 hover:text-green-600 hover:underline font-semibold"
              >
                {row.book_title || `كتاب ${id}`}
              </Link>
              {row.book_takhrij_author && (
                <span className="text-gray-500 text-xs">{row.book_takhrij_author}</span>
              )}
              {row.book_takhrij_death && (
                <span className="text-gray-400 text-xs">(ت {row.book_takhrij_death}هـ)</span>
              )}
              <span className="text-gray-400 text-xs">
                — {count === 1 ? 'رواية واحدة' : `${count} روايات`}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {hasSource && (
                <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">المصدر</span>
              )}
              {row.kind !== 'other' && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${KIND_BADGE[row.kind]}`}>
                  {KIND_LABEL[row.kind]}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── متوسط view ────────────────────────────────────────────────────────────────
// Grouped by book as flowing prose. Each book is one block with inline hadith links.

function MutawassitView({ rows, sourceId }: { rows: TakhrijRow[]; sourceId: number }) {
  // Group by book, preserving sort order
  const bookOrder: number[] = []
  const bookMap = new Map<number, { title: string; death: number | null; entries: TakhrijRow[] }>()
  for (const row of rows) {
    if (!bookMap.has(row.book_id)) {
      bookOrder.push(row.book_id)
      bookMap.set(row.book_id, {
        title: row.book_title || `كتاب ${row.book_id}`,
        death: row.book_takhrij_death,
        entries: [],
      })
    }
    bookMap.get(row.book_id)!.entries.push(row)
  }

  const getCopyText = useCallback(() => buildCopyText(rows, sourceId), [rows, sourceId])

  return (
    <div dir="rtl">
      <div className="flex justify-end mb-3">
        <CopyButton getText={getCopyText} label="نسخ التخريج" />
      </div>

      <div className="space-y-3">
        {bookOrder.map((bookId) => {
          const { title, death, entries } = bookMap.get(bookId)!
          const hasSource = entries.some(r => r.main_id === sourceId)

          // Check if all non-source entries share the same description
          const descs = entries
            .filter(r => r.main_id !== sourceId && r.matn_description)
            .map(r => r.matn_description!.replace(/\.$/, '').trim())
          const uniqueDescs = [...new Set(descs)]
          const sharedDesc = uniqueDescs.length === 1 ? uniqueDescs[0] : null

          return (
            <div
              key={bookId}
              className="group leading-loose text-sm"
              dir="rtl"
            >
              {/* Book name as heading inline with entries */}
              <span className="inline">
                <Link
                  href={`/books/${bookId}`}
                  className="font-semibold text-green-800 hover:text-green-600 hover:underline"
                >
                  {title}
                </Link>
                {death && (
                  <span className="text-gray-400 text-xs mr-1">(ت {death}هـ)</span>
                )}
                {hasSource && (
                  <span className="mr-1.5 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full align-middle">المصدر</span>
                )}
                <span className="text-gray-400 mx-1.5">:</span>

                {/* Inline hadith number links */}
                {entries.map((row, ei) => {
                  const isCurrent = row.main_id === sourceId
                  const hasNum = !!(row.tarqeem_harf || row.tarqeem_matboa1)
                  // Per-entry description only if descriptions differ across entries
                  const entryDesc = !sharedDesc && !isCurrent && row.matn_description
                    ? row.matn_description.replace(/\.$/, '').trim()
                    : null

                  return (
                    <span key={`${row.main_id}-${ei}`} className="inline">
                      {ei > 0 && <span className="text-gray-400 mx-0.5">،</span>}
                      {hasNum ? (
                        <Link
                          href={`/hadith/${row.main_id}`}
                          className={`rounded px-0.5 transition-colors
                            ${isCurrent
                              ? 'text-amber-700 hover:text-amber-600 font-medium'
                              : 'text-green-700 hover:text-green-500 hover:underline'
                            }`}
                          title={isCurrent ? 'المصدر الحالي' : undefined}
                        >
                          ({row.tarqeem_matboa1 || row.tarqeem_harf})
                        </Link>
                      ) : (
                        <Link
                          href={`/hadith/${row.main_id}`}
                          className="text-green-700 hover:underline text-xs"
                        >
                          [رواية]
                        </Link>
                      )}
                      {/* Per-entry description badge when descriptions differ */}
                      {entryDesc && (
                        <span className="mr-0.5 text-[10px] text-teal-600 italic">{entryDesc}</span>
                      )}
                    </span>
                  )
                })}

                {/* Shared description for all entries in this book */}
                {sharedDesc && (
                  <span className="mr-1 text-xs text-teal-700 italic">{sharedDesc}</span>
                )}

                {/* Kind badges */}
                {entries[0].kind !== 'other' && (
                  <span className={`mr-1.5 text-[10px] px-1.5 py-0.5 rounded-full align-middle ${KIND_BADGE[entries[0].kind]}`}>
                    {KIND_LABEL[entries[0].kind]}
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── تفصيلي view ───────────────────────────────────────────────────────────────
// Each hadith is its own block. Book name + number clickable. Tarf shown below.

function TafsiliView({ rows, sourceId }: { rows: TakhrijRow[]; sourceId: number }) {
  const getCopyText = useCallback(() => buildCopyText(rows, sourceId), [rows, sourceId])

  return (
    <div dir="rtl">
      {/* Copy button */}
      <div className="flex justify-end mb-4">
        <CopyButton getText={getCopyText} label="نسخ التخريج" />
      </div>

      <div className="space-y-4">
        {rows.map((row, i) => {
          const isCurrent = row.main_id === sourceId
          const pp = partPage(row)
          const tarf = row.tarf ? stripTags(row.tarf).slice(0, 140) : null
          const isLong = row.tarf ? stripTags(row.tarf).length > 140 : false

          return (
            <div
              key={`${row.main_id}-${i}`}
              className={`relative pr-4 border-r-2 transition-colors
                ${isCurrent ? 'border-amber-400' : 'border-gray-200 hover:border-green-300'}`}
              dir="rtl"
            >
              {/* Main citation line */}
              <div className="flex items-start gap-2 flex-wrap leading-relaxed text-sm">
                {/* Ordinal */}
                <span className="text-gray-300 text-xs shrink-0 mt-0.5 w-5 text-center">{i + 1}</span>

                <div className="flex-1 min-w-0">
                  {/* Book name — clickable link */}
                  <Link
                    href={`/books/${row.book_id}`}
                    className="font-semibold text-green-800 hover:text-green-600 hover:underline"
                  >
                    {row.book_title || `كتاب ${row.book_id}`}
                  </Link>

                  {/* Death year */}
                  {row.book_takhrij_death && (
                    <span className="text-gray-400 text-xs mr-1">(ت {row.book_takhrij_death}هـ)</span>
                  )}

                  {/* Hadith number — clickable link */}
                  {(row.tarqeem_harf || row.tarqeem_matboa1) && (
                    <span className="text-gray-400 mx-1">—</span>
                  )}
                  {(row.tarqeem_harf || row.tarqeem_matboa1) && (
                    <Link
                      href={`/hadith/${row.main_id}`}
                      className={`font-medium hover:underline
                        ${isCurrent ? 'text-amber-700 hover:text-amber-600' : 'text-green-700 hover:text-green-500'}`}
                    >
                      (<HadithNumber harf={row.tarqeem_harf} matboa={row.tarqeem_matboa1} />)
                    </Link>
                  )}

                  {/* Volume / page */}
                  {pp && (
                    <span className="text-gray-400 text-xs mr-1">{pp}</span>
                  )}

                  {/* Badges row */}
                  <span className="inline-flex flex-wrap gap-1 mr-1.5 align-middle">
                    {isCurrent && (
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">المصدر الحالي</span>
                    )}
                    {row.kind !== 'other' && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${KIND_BADGE[row.kind]}`}>
                        {KIND_LABEL[row.kind]}
                      </span>
                    )}
                    {row.grade_hint && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${GRADE_BADGE[row.grade_hint] ?? 'bg-gray-100 text-gray-500'}`}>
                        {row.grade_hint}
                      </span>
                    )}
                    {!isCurrent && row.matn_description && (
                      <span
                        className="text-[10px] bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded-full"
                        title="وصف التطابق / الاختلاف بين المتون"
                      >
                        {row.matn_description.replace(/\.$/, '')}
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* Tarf — opening phrase as a subtle subtitle */}
              {tarf && (
                <Link
                  href={`/hadith/${row.main_id}`}
                  className="block text-gray-400 text-xs mt-1 pr-7 leading-relaxed hover:text-green-600 transition-colors"
                  dir="rtl"
                >
                  &ldquo;{tarf}{isLong ? '…' : ''}&rdquo;
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── مقارنة المتون grouped section ─────────────────────────────────────────────

function MatnComparisonSection({
  rows, sourceId, baseText,
}: {
  rows: TakhrijRow[]
  sourceId: number
  baseText: string | null
}) {
  const [open, setOpen] = useState(false)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [diffId, setDiffId] = useState<number | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffResult, setDiffResult] = useState<{ baseChunks: DiffChunk[]; compChunks: DiffChunk[] } | null>(null)

  async function handleDiff(row: TakhrijRow) {
    if (!baseText) return
    if (diffId === row.main_id) { setDiffId(null); setDiffResult(null); return }
    setDiffId(row.main_id)
    setDiffLoading(true)
    setDiffResult(null)
    try {
      const res = await fetch(`/api/hadith/${row.main_id}/text`)
      const { text } = await res.json() as { text: string | null }
      if (text) setDiffResult(wordDiff(baseText, text))
    } finally {
      setDiffLoading(false)
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; rows: TakhrijRow[] }>()
    for (const row of rows) {
      if (row.main_id === sourceId || !row.matn_description) continue
      const label = row.matn_description.replace(/\.$/, '').trim()
      const key = normDescKey(label)
      if (!map.has(key)) map.set(key, { label, rows: [] })
      map.get(key)!.rows.push(row)
    }
    return Array.from(map.entries()).sort(([ka, { rows: ra }], [kb, { rows: rb }]) => {
      const ai = DESC_SORT_ORDER.indexOf(ka)
      const bi = DESC_SORT_ORDER.indexOf(kb)
      if (ai !== -1 && bi !== -1) return ai - bi
      if (ai !== -1) return -1
      if (bi !== -1) return 1
      return rb.length - ra.length
    })
  }, [rows, sourceId])

  if (groups.length === 0) return null

  return (
    <div className="mt-5 border border-teal-200 rounded-xl overflow-hidden" dir="rtl">
      {/* Header / toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-teal-50 hover:bg-teal-100 transition-colors text-right"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-teal-800 text-sm">مقارنة المتون</span>
          <span className="text-xs text-teal-600">— وصف التطابق والاختلاف بين الروايات</span>
          {!open && groups.map(([key, { label, rows: gr }]) => (
            <span key={key}
              className="text-[11px] bg-white text-teal-700 border border-teal-300 px-2 py-0.5 rounded-full font-medium">
              {label} ({gr.length})
            </span>
          ))}
        </div>
        <span className="text-teal-500 text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {/* Body */}
      {open && (
        <div className="p-4 space-y-2 bg-white">
          {groups.map(([key, { label, rows: gr }]) => (
            <div key={key} className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setOpenGroup(g => g === key ? null : key)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-gray-50 transition-colors text-right"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-800 text-sm">{label}</span>
                  <span className="text-[11px] bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full">
                    {gr.length === 1 ? 'رواية واحدة' : `${gr.length} روايات`}
                  </span>
                </div>
                <span className="text-gray-400 text-[10px] shrink-0">{openGroup === key ? '▲' : '▼'}</span>
              </button>

              {openGroup === key && (
                <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                  <ol className="space-y-2 text-sm">
                    {gr.map((row, i) => {
                      const isActive = diffId === row.main_id
                      return (
                        <li key={`${row.main_id}-${i}`}>
                          <div className="flex gap-2 leading-snug items-start">
                            <span className="text-gray-400 shrink-0 w-5 text-xs pt-0.5">{i + 1}.</span>
                            <div className="flex-1 min-w-0">
                              <span>
                                <Link href={`/books/${row.book_id}`} className="text-green-800 hover:underline font-medium">
                                  {row.book_title || `كتاب ${row.book_id}`}
                                </Link>
                                {row.book_takhrij_author && (
                                  <span className="text-gray-500"> — {row.book_takhrij_author}</span>
                                )}
                                {row.book_takhrij_death && (
                                  <span className="text-gray-400"> (ت {row.book_takhrij_death}هـ)</span>
                                )}
                                {(row.tarqeem_harf || row.tarqeem_matboa1) && (
                                  <span className="text-gray-500 text-xs"> — برقم{' '}
                                    <Link href={`/hadith/${row.main_id}`} className="text-green-700 hover:underline">
                                      <HadithNumber harf={row.tarqeem_harf} matboa={row.tarqeem_matboa1} />
                                    </Link>
                                  </span>
                                )}
                              </span>
                              {baseText && (
                                <button
                                  onClick={() => handleDiff(row)}
                                  className={`mr-2 text-[11px] px-2 py-0.5 rounded border transition-colors ${
                                    isActive
                                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                                      : 'bg-white text-gray-500 border-gray-300 hover:border-amber-300 hover:text-amber-700'
                                  }`}
                                >
                                  {isActive ? 'إخفاء الفروق' : 'عرض الفروق'}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Diff panel */}
                          {isActive && (
                            <div className="mt-2 mr-7 border border-amber-200 rounded-lg overflow-hidden bg-white">
                              {diffLoading ? (
                                <p className="text-xs text-gray-400 text-center py-4">جارٍ تحميل النص…</p>
                              ) : diffResult ? (
                                <>
                                  <div className="grid grid-cols-2 divide-x divide-x-reverse divide-amber-100">
                                    <div className="p-3 border-r border-amber-100">
                                      <p className="text-[10px] text-gray-400 mb-1 text-right">المصدر الحالي</p>
                                      <DiffText chunks={diffResult.baseChunks} side="base" />
                                    </div>
                                    <div className="p-3">
                                      <p className="text-[10px] text-gray-400 mb-1 text-right">
                                        {row.book_title} — <HadithNumber harf={row.tarqeem_harf} matboa={row.tarqeem_matboa1} />
                                      </p>
                                      <DiffText chunks={diffResult.compChunks} side="comp" />
                                    </div>
                                  </div>
                                  <div className="flex gap-3 px-3 py-1.5 bg-gray-50 text-[10px] text-gray-500 border-t border-amber-100">
                                    <span><span className="inline-block w-2.5 h-2.5 rounded bg-blue-100 border border-blue-300 align-middle ml-1"></span>في المصدر فقط</span>
                                    <span><span className="inline-block w-2.5 h-2.5 rounded bg-red-100 border border-red-300 align-middle ml-1"></span>في الرواية الأخرى فقط</span>
                                  </div>
                                </>
                              ) : (
                                <p className="text-xs text-gray-400 text-center py-4">لا يوجد نص متاح للمقارنة</p>
                              )}
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function TakhrijClient({
  rows,
  sourceId,
  totalBooks,
  mutabaatCount,
  shawahidCount,
  truncated,
  baseText,
}: {
  rows: TakhrijRow[]
  sourceId: number
  totalBooks: number
  mutabaatCount: number
  shawahidCount: number
  truncated: boolean
  baseText: string | null
}) {
  const [viewMode, setViewMode] = useState<ViewMode>('tafsili')
  const [sortBy, setSortBy] = useState<SortBy>('sihha')

  const sorted = useMemo(() => sortRows(rows, sortBy), [rows, sortBy])

  return (
    <div dir="rtl">
      {/* Summary bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap text-xs">
        <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full font-medium">
          {rows.length} رواية في {totalBooks} كتاب
        </span>
        {mutabaatCount > 0 && (
          <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full font-medium">
            {mutabaatCount} متابعة
          </span>
        )}
        {shawahidCount > 0 && (
          <span className="bg-violet-50 text-violet-700 border border-violet-200 px-2.5 py-1 rounded-full font-medium">
            {shawahidCount} شاهد
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4">
        {/* View mode */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 shrink-0">العرض:</span>
          {([ ['ijmali', 'إجمالي'], ['mutawassit', 'متوسط'], ['tafsili', 'تفصيلي'] ] as [ViewMode, string][]).map(([mode, label]) => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                viewMode === mode
                  ? 'bg-green-700 text-white border-green-700'
                  : 'border-gray-200 text-gray-600 hover:border-green-300 hover:text-green-700'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 shrink-0">ترتيب:</span>
          {([ ['sihha', 'أصحية الكتب'], ['shuhura', 'الشهرة'], ['wafayat', 'وفيات المصنفين'] ] as [SortBy, string][]).map(([sort, label]) => (
            <button key={sort} onClick={() => setSortBy(sort)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                sortBy === sort
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'border-gray-200 text-gray-500 hover:border-amber-300 hover:text-amber-700'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {viewMode === 'ijmali'     && <IjmaliView     rows={sorted} sourceId={sourceId} />}
      {viewMode === 'mutawassit' && <MutawassitView  rows={sorted} sourceId={sourceId} />}
      {viewMode === 'tafsili'    && <TafsiliView     rows={sorted} sourceId={sourceId} />}

      {truncated && (
        <p className="text-xs text-gray-400 mt-2 text-center">
          يُعرض أول 120 رواية — لمزيد من الطرق انظر{' '}
          <a href="#adawat" className="text-green-600 hover:underline">صفحة الشواهد الكاملة</a>
        </p>
      )}

      <MatnComparisonSection rows={rows} sourceId={sourceId} baseText={baseText} />
    </div>
  )
}
