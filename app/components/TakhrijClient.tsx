'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'

// Strip diacritics for grouping key so "مختصراً" and "مختصرا" cluster together
function normDescKey(desc: string): string {
  return desc.replace(/\.$/, '').replace(/[ًٌٍَُِّْ]/g, '').trim()
}

// Match precision level derived from description prefix (1 = most precise)
function getMatchLevel(desc: string | null): number {
  if (!desc) return 5
  const d = desc.replace(/\.$/, '').trim()
  if (d.startsWith('بلفظه')) return 1
  if (d.startsWith('بمثله')) return 2
  if (d.startsWith('بنحوه')) return 3
  if (d.startsWith('بمعناه')) return 4
  return 5
}

const LEVEL_LABELS: Record<number, string> = {
  1: 'بلفظه',
  2: 'بمثله',
  3: 'بنحوه',
  4: 'بمعناه',
  5: 'غير محدد',
}

const LEVEL_OPTIONS = [1, 2, 3, 4, 5] as const

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
          return <span key={i} className="bg-blue-100 text-blue-800 dark:text-ink rounded px-0.5">{c.text} </span>
        if (side === 'comp' && c.type === 'add')
          return <span key={i} className="bg-red-100 text-red-800 dark:text-ink rounded px-0.5">{c.text} </span>
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
type SourceGroup = 'matn' | 'other'

export interface TakhrijRow {
  main_id: number
  book_id: number
  book_title: string | null
  book_strong: number | null
  book_fame: number | null
  book_takhrij_author: string | null
  book_takhrij_death: number | null
  tarf: string | null
  section_text: string | null
  chapter_text: string | null
  part_num: number
  page_num: number
  tarqeem_harf: string | null
  tarqeem_matboa1: string | null
  grade_hint: string | null
  matn_description: string | null
  kind: 'mutabaa' | 'shahid' | 'other'
}

export interface OtherTakhrijSource {
  id: number
  href: string
  book_id: number | null
  book_title: string
  section_text: string | null
  chapter_text: string | null
  part_num: number
  page_num: number
  tarf: string | null
}

function citationLocation(row: TakhrijRow): string {
  const locParts: string[] = []
  if (row.part_num > 0 || row.page_num > 0) {
    const part = row.part_num > 0 ? String(row.part_num) : '-'
    const page = row.page_num > 0 ? String(row.page_num) : '-'
    locParts.push(`(${part} / ${page})`)
  }

  const num = numText(row)
  if (num) locParts.push(`برقم: (${num})`)

  return locParts.join(' ')
}

function bookCitationTitle(row: TakhrijRow): string {
  const title = row.book_title || `كتاب ${row.book_id}`
  return row.book_takhrij_author
    ? `${row.book_takhrij_author} في "${title}"`
    : `"${title}"`
}

function chapterPath(row: TakhrijRow): string | null {
  const parts = [row.section_text, row.chapter_text]
    .map(part => part?.replace(/\s+/g, ' ').trim())
    .filter((part): part is string => !!part)

  return [...new Set(parts)].join(' ، ') || null
}

function sourcePath(source: OtherTakhrijSource): string | null {
  const parts = [source.section_text, source.chapter_text]
    .map(part => part?.replace(/\s+/g, ' ').trim())
    .filter((part): part is string => !!part)

  return [...new Set(parts)].join(' ، ') || null
}

/** Display the takhrij citation number independent of the global numbering switch. */
function numText(row: TakhrijRow): string {
  return row.tarqeem_harf || ''
}

function sortRows(rows: TakhrijRow[], sortBy: SortBy): TakhrijRow[] {
  return [...rows].sort((a, b) => {
    if (sortBy === 'sihha') {
      const byStrong = (a.book_strong ?? 9999) - (b.book_strong ?? 9999)
      if (byStrong !== 0) return byStrong
    }
    if (sortBy === 'shuhura') {
      const byFame = (a.book_fame ?? 9999) - (b.book_fame ?? 9999)
      if (byFame !== 0) return byFame
    }

    if (sortBy === 'wafayat') {
      const da = a.book_takhrij_death ?? 9999
      const db = b.book_takhrij_death ?? 9999
      if (da !== db) return da - db
    }

    const byBook = (a.book_id ?? 0) - (b.book_id ?? 0)
    if (byBook !== 0) return byBook
    return a.main_id - b.main_id
  })
}

// ── Copy helper ───────────────────────────────────────────────────────────────

/**
 * Build Arabic prose citation text, grouped by book.
 * e.g. "أخرجه البخاري برقم (1543)، ومسلم برقم (1281، 1282)، والبزار برقم (2142) بمعناه مختصرا."
 */
function citationExtra(row: TakhrijRow, viewMode: ViewMode, sourceId: number): string {
  if (viewMode === 'ijmali') return ''

  const extras: string[] = []
  const path = chapterPath(row)
  if (path) extras.push(`(${path})`)

  if (viewMode === 'tafsili' && row.main_id !== sourceId && row.matn_description) {
    extras.push(`(${row.matn_description.replace(/\.$/, '').trim()}.)`)
  }

  return extras.length > 0 ? ` ${extras.join(' ')}` : ''
}

function buildCopyText(rows: TakhrijRow[], viewMode: ViewMode, sourceId: number): string {
  if (rows.length === 0) return ''

  // Preserve order; group consecutive same-book entries together keeping sort order
  const bookOrder: number[] = []
  const bookMap = new Map<number, { row: TakhrijRow; entries: TakhrijRow[] }>()
  for (const row of rows) {
    if (!bookMap.has(row.book_id)) {
      bookOrder.push(row.book_id)
      bookMap.set(row.book_id, { row, entries: [] })
    }
    bookMap.get(row.book_id)!.entries.push(row)
  }

  const parts: string[] = []
  for (let bi = 0; bi < bookOrder.length; bi++) {
    const { row, entries } = bookMap.get(bookOrder[bi])!
    const locations = entries
      .map(entry => `${citationLocation(entry)}${citationExtra(entry, viewMode, sourceId)}`.trim())
      .filter(Boolean)
    const part = `${bookCitationTitle(row)}${locations.length ? ` ${locations.join(' ، ')}` : ''}`
    parts.push(part)
  }

  return `أخرجه ${parts.join(' و')}.`
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
      {copied ? '✓ تم النسخ' : label}
    </button>
  )
}

function ViewModeControls({
  viewMode,
  onChange,
}: {
  viewMode: ViewMode
  onChange: (mode: ViewMode) => void
}) {
  return (
    <div className="ui-control-group">
      <span className="ui-label">العرض:</span>
      <div className="ui-segmented ui-segmented-fill min-w-0 flex-1 sm:flex-initial">
        {([ ['ijmali', 'إجمالي'], ['mutawassit', 'متوسط'], ['tafsili', 'تفصيلي'] ] as [ViewMode, string][]).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            className={`ui-segmented-item ${viewMode === mode ? 'ui-segmented-item-active' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── إجمالي view ──────────────────────────────────────────────────────────────

function CitationTextView({
  rows,
  sourceId,
  viewMode,
}: {
  rows: TakhrijRow[]
  sourceId: number
  viewMode: ViewMode
}) {
  const getCopyText = useCallback(() => buildCopyText(rows, viewMode, sourceId), [rows, viewMode, sourceId])

  if (rows.length === 0) {
    return <p className="text-sm text-gray-400 py-4">لا توجد روايات مطابقة لهذه المرشحات</p>
  }

  const bookOrder: number[] = []
  const bookMap = new Map<number, { row: TakhrijRow; entries: TakhrijRow[] }>()
  for (const row of rows) {
    if (!bookMap.has(row.book_id)) {
      bookOrder.push(row.book_id)
      bookMap.set(row.book_id, { row, entries: [] })
    }
    bookMap.get(row.book_id)!.entries.push(row)
  }

  return (
    <div dir="rtl">
      <div className="flex justify-end mb-3">
        <CopyButton getText={getCopyText} label="نسخ التخريج" />
      </div>
      <p className="ui-prose-block">
        <span>أخرجه </span>
        {bookOrder.map((bookId, bookIndex) => {
          const { row, entries } = bookMap.get(bookId)!
          return (
            <span key={bookId}>
              {bookIndex > 0 && <span> و</span>}
              {row.book_takhrij_author && <span>{row.book_takhrij_author} في </span>}
                <Link
                  href={`/books/${bookId}`}
                  className="ui-link font-semibold"
                >
                  &quot;{row.book_title || `كتاب ${bookId}`}&quot;
                </Link>
                {entries.map((row, ei) => {
                  const num = numText(row)
                  const pp = row.part_num > 0 || row.page_num > 0
                    ? `(${row.part_num > 0 ? row.part_num : '-'} / ${row.page_num > 0 ? row.page_num : '-'})`
                    : null

                  return (
                    <span key={`${row.main_id}-${ei}`}>
                      <span>{ei > 0 ? ' ، ' : ' '}</span>
                      {pp && <span>{pp} </span>}
                      {num ? (
                        <>
                          <span>برقم: </span>
                          <span>(</span>
                          <Link
                            href={`/hadith/${row.main_id}`}
                            className={row.main_id === sourceId ? 'ui-link-current' : 'ui-link'}
                            title={row.main_id === sourceId ? 'المصدر الحالي' : undefined}
                          >
                            {num}
                          </Link>
                          <span>)</span>
                        </>
                      ) : (
                        <Link
                          href={`/hadith/${row.main_id}`}
                          className="ui-link"
                        >
                          رواية
                        </Link>
                      )}
                      {citationExtra(row, viewMode, sourceId)}
                    </span>
                  )
                })}
            </span>
          )
        })}
      </p>
    </div>
  )
}

function otherSourceExtra(source: OtherTakhrijSource, viewMode: ViewMode): string {
  if (viewMode === 'ijmali') return ''

  const extras: string[] = []
  const path = sourcePath(source)
  if (path) extras.push(`(${path})`)

  if (viewMode === 'tafsili' && source.tarf) {
    extras.push(`(${source.tarf.replace(/\s+/g, ' ').trim()})`)
  }

  return extras.length > 0 ? ` ${extras.join(' ')}` : ''
}

function buildOtherSourcesText(sources: OtherTakhrijSource[], viewMode: ViewMode): string {
  if (sources.length === 0) return ''

  const parts = sources.map(source => {
    const location = source.part_num > 0 || source.page_num > 0
      ? `(${source.part_num > 0 ? source.part_num : '-'} / ${source.page_num > 0 ? source.page_num : '-'})`
      : ''

    return `"${source.book_title}"${location ? ` ${location}` : ''}${otherSourceExtra(source, viewMode)}`
  })

  return `ذُكر في ${parts.join(' و')}.`
}

function OtherSourcesView({ sources, viewMode }: { sources: OtherTakhrijSource[]; viewMode: ViewMode }) {
  const getCopyText = useCallback(() => buildOtherSourcesText(sources, viewMode), [sources, viewMode])

  if (sources.length === 0) {
    return <p className="text-sm text-gray-400 py-4">لا توجد كتب أخرى مسجلة لهذا الحديث</p>
  }

  return (
    <div dir="rtl">
      <div className="flex justify-end mb-3">
        <CopyButton getText={getCopyText} label="نسخ التخريج" />
      </div>
      <p className="ui-prose-block">
        <span>ذُكر في </span>
        {sources.map((source, index) => {
        const location = source.part_num > 0 || source.page_num > 0
          ? `(${source.part_num > 0 ? source.part_num : '-'} / ${source.page_num > 0 ? source.page_num : '-'})`
          : null

        return (
          <span key={`${source.id}-${index}`}>
            {index > 0 && <span> و</span>}
            <Link href={source.href} className="ui-link font-semibold">
              &quot;{source.book_title}&quot;
            </Link>
            {location && <span> {location}</span>}
            {otherSourceExtra(source, viewMode)}
          </span>
        )
      })}
      </p>
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
  const [open, setOpen] = useState(true)
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
    <div className="mt-5 border border-green-200 rounded-xl overflow-hidden" dir="rtl">
      {/* Header / toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-green-50 hover:bg-green-100/80 transition-colors text-right"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-green-900 text-sm font-sans">مقارنة المتون</span>
          <span className="text-xs text-green-700 font-sans">— وصف التطابق والاختلاف بين الروايات</span>
          {!open && groups.map(([key, { label, rows: gr }]) => (
            <span key={key}
              className="text-[11px] bg-white text-green-800 border border-green-200 px-2 py-0.5 rounded-full font-medium font-sans">
              {label} ({gr.length})
            </span>
          ))}
        </div>
        <span className="text-green-600 text-xs shrink-0">{open ? '▲' : '▼'}</span>
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
                  <span className="text-[11px] bg-green-50 text-green-800 border border-green-200 px-2 py-0.5 rounded-full font-sans">
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
                                {numText(row) && (
                                  <span className="text-gray-500 text-xs"> — برقم{' '}
                                    <Link href={`/hadith/${row.main_id}`} className="text-green-700 hover:underline">
                                      {numText(row)}
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
                                        {row.book_title} — {numText(row)}
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
  otherSources,
  sourceId,
  totalBooks,
  mutabaatCount,
  shawahidCount,
  truncated,
  baseText,
}: {
  rows: TakhrijRow[]
  otherSources: OtherTakhrijSource[]
  sourceId: number
  totalBooks: number
  mutabaatCount: number
  shawahidCount: number
  truncated: boolean
  baseText: string | null
}) {
  const [sourceGroup, setSourceGroup] = useState<SourceGroup>('matn')
  const [viewMode, setViewMode] = useState<ViewMode>('ijmali')
  const [sortBy, setSortBy] = useState<SortBy>('sihha')
  const [excludedLevels, setExcludedLevels] = useState<Set<number>>(() => new Set())
  const [excludedBookIds, setExcludedBookIds] = useState<Set<number>>(() => new Set())
  const [booksOpen, setBooksOpen] = useState(false)
  const [accuracyOpen, setAccuracyOpen] = useState(false)

  const sorted = useMemo(() => sortRows(rows, sortBy), [rows, sortBy])

  const bookOptions = useMemo(() => {
    const bookOrder: number[] = []
    const map = new Map<number, { id: number; title: string; count: number }>()
    for (const row of sorted) {
      if (!map.has(row.book_id)) {
        bookOrder.push(row.book_id)
        map.set(row.book_id, {
          id: row.book_id,
          title: row.book_title || `كتاب ${row.book_id}`,
          count: 0,
        })
      }
      map.get(row.book_id)!.count++
    }
    return bookOrder.map(id => map.get(id)!)
  }, [sorted])

  const selectedBookCount = bookOptions.filter(book => !excludedBookIds.has(book.id)).length
  const allBooksSelected = bookOptions.length > 0 && selectedBookCount === bookOptions.length

  const selectedLevelCount = LEVEL_OPTIONS.filter(level => !excludedLevels.has(level)).length
  const allLevelsSelected = selectedLevelCount === LEVEL_OPTIONS.length

  const bookFiltered = useMemo(
    () => sorted.filter(r => !excludedBookIds.has(r.book_id)),
    [sorted, excludedBookIds]
  )

  // Apply match-precision filter inside the selected book; source hadith is kept when visible.
  const filtered = useMemo(
    () => bookFiltered.filter(r => r.main_id === sourceId || !excludedLevels.has(getMatchLevel(r.matn_description))),
    [bookFiltered, sourceId, excludedLevels]
  )

  const visibleBooks = useMemo(() => new Set(filtered.map(r => r.book_id)).size, [filtered])
  const visibleMutabaat = filtered.filter(r => r.kind === 'mutabaa').length
  const visibleShawahid = filtered.filter(r => r.kind === 'shahid').length

  return (
    <div dir="rtl">
      {/* Summary bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="ui-chip">
          {filtered.length} رواية في {visibleBooks} كتاب
          {filtered.length !== rows.length && (
            <span className="text-gray-500 mr-1">(من {rows.length})</span>
          )}
        </span>
        {visibleMutabaat > 0 && (
          <span className="ui-chip-info">
            {visibleMutabaat} متابعة
          </span>
        )}
        {visibleShawahid > 0 && (
          <span className="ui-chip-violet">
            {visibleShawahid} شاهد
          </span>
        )}
      </div>

      <div className="ui-segmented ui-segmented-fill mb-4 w-full sm:w-auto">
        {([
          ['matn', 'كتب المتون', visibleBooks || totalBooks],
          ['other', 'كتب أخرى', otherSources.length],
        ] as [SourceGroup, string, number][]).map(([group, label, count]) => (
          <button
            key={group}
            type="button"
            onClick={() => setSourceGroup(group)}
            className={`ui-segmented-item text-sm px-3 sm:px-4 py-2 ${sourceGroup === group ? 'ui-segmented-item-active' : ''}`}
          >
            <span>{label}</span>
            <span className="mr-2 font-semibold">{count}</span>
          </button>
        ))}
      </div>

      {sourceGroup === 'other' ? (
        <>
          <div className="ui-controls-row mb-4">
            <ViewModeControls viewMode={viewMode} onChange={setViewMode} />
          </div>
          <OtherSourcesView sources={otherSources} viewMode={viewMode} />
        </>
      ) : (
        <>
      {/* Controls */}
      <div className="ui-controls-row mb-4">
        {/* View mode */}
        <ViewModeControls viewMode={viewMode} onChange={setViewMode} />

        {/* Book filter */}
        <div className="ui-control-group">
          <span className="ui-label">الكتب:</span>
          <button
            type="button"
            onClick={() => setBooksOpen(open => !open)}
            className="ui-filter-trigger flex-1 sm:flex-initial min-w-0 truncate text-right"
          >
            {allBooksSelected ? 'الكل' : `${selectedBookCount} من ${bookOptions.length}`} ▼
          </button>
          {booksOpen && (
            <div className="ui-filter-panel sm:w-72">
              <div className="max-h-72 overflow-auto space-y-1">
                <label className="flex items-center gap-2 text-xs rounded-lg px-2.5 py-2 text-gray-700 cursor-pointer hover:bg-green-50">
                  <input
                    type="checkbox"
                    checked={allBooksSelected}
                    onChange={() => {
                      setExcludedBookIds(allBooksSelected
                        ? new Set(bookOptions.map(book => book.id))
                        : new Set()
                      )
                    }}
                    className="accent-green-700"
                  />
                  <span className="font-medium">الكل</span>
                </label>
                <div className="h-px bg-gray-100" />
                {bookOptions.map(book => {
                  const checked = !excludedBookIds.has(book.id)
                  return (
                    <label
                      key={book.id}
                      className={`flex items-center gap-2 text-xs rounded-lg px-2.5 py-2 cursor-pointer transition-colors ${
                        checked ? 'text-green-800 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setExcludedBookIds(prev => {
                            const next = new Set(prev)
                            if (next.has(book.id)) next.delete(book.id)
                            else next.add(book.id)
                            return next
                          })
                        }}
                        className="accent-green-700"
                      />
                      <span>{book.title} ({book.count})</span>
                    </label>
                  )
                })}
              </div>
          </div>
          )}
        </div>

        {/* Sort */}
        <label className="ui-control-group">
          <span className="ui-label">ترتيب:</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortBy)}
            className="ui-filter-trigger flex-1 sm:flex-initial min-w-0"
          >
            <option value="sihha">أصحية الكتب</option>
            <option value="shuhura">الشهرة</option>
            <option value="wafayat">وفيات المصنفين</option>
          </select>
        </label>

        {/* Match accuracy filter */}
        <div className="ui-control-group">
          <span className="ui-label">دقة التطابق:</span>
          <button
            type="button"
            onClick={() => setAccuracyOpen(open => !open)}
            className="ui-filter-trigger flex-1 sm:flex-initial min-w-0 truncate text-right"
          >
            {allLevelsSelected ? 'الكل' : `${selectedLevelCount} من ${LEVEL_OPTIONS.length}`} ▼
          </button>
          {accuracyOpen && (
            <div className="ui-filter-panel sm:w-52">
              <div className="max-h-72 overflow-auto space-y-1">
                <label className="flex items-center gap-2 text-xs rounded-lg px-2.5 py-2 text-gray-700 cursor-pointer hover:bg-green-50 font-sans">
                  <input
                    type="checkbox"
                    checked={allLevelsSelected}
                    onChange={() => {
                      setExcludedLevels(allLevelsSelected
                        ? new Set(LEVEL_OPTIONS)
                        : new Set()
                      )
                    }}
                    className="accent-green-800"
                  />
                  <span className="font-medium">الكل</span>
                </label>
                <div className="h-px bg-gray-100" />
                {LEVEL_OPTIONS.map(level => {
                  const checked = !excludedLevels.has(level)
                  return (
                    <label
                      key={level}
                      className={`flex items-center gap-2 text-xs rounded-lg px-2.5 py-2 cursor-pointer transition-colors font-sans ${
                        checked ? 'text-green-800 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setExcludedLevels(prev => {
                            const next = new Set(prev)
                            if (next.has(level)) next.delete(level)
                            else next.add(level)
                            return next
                          })
                        }}
                        className="accent-green-800"
                      />
                      <span>{LEVEL_LABELS[level]}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <CitationTextView rows={filtered} sourceId={sourceId} viewMode={viewMode} />

      {truncated && (
        <p className="text-xs text-gray-400 mt-2 text-center">
          يُعرض أول 120 رواية — لمزيد من الطرق انظر{' '}
          <a href="#adawat" className="text-green-600 hover:underline">صفحة الشواهد الكاملة</a>
        </p>
      )}

      <MatnComparisonSection rows={filtered} sourceId={sourceId} baseText={baseText} />
        </>
      )}
    </div>
  )
}
