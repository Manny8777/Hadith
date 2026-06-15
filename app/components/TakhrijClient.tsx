'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import HadithNumber from './HadithNumber'

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

// ── إجمالي view ──────────────────────────────────────────────────────────────

function IjmaliView({ rows, sourceId }: { rows: TakhrijRow[]; sourceId: number }) {
  const bookMap = new Map<number, { row: TakhrijRow; count: number; hasSource: boolean }>()
  for (const row of rows) {
    if (bookMap.has(row.book_id)) {
      bookMap.get(row.book_id)!.count++
      if (row.main_id === sourceId) bookMap.get(row.book_id)!.hasSource = true
    } else {
      bookMap.set(row.book_id, { row, count: 1, hasSource: row.main_id === sourceId })
    }
  }
  const books = Array.from(bookMap.values())

  return (
    <ol className="space-y-1.5 text-sm leading-relaxed">
      {books.map(({ row, count, hasSource }, i) => (
        <li key={row.book_id} className="flex gap-2">
          <span className="text-gray-400 shrink-0 w-6">{i + 1}.</span>
          <span>
            <Link href={`/books/${row.book_id}`} className="text-green-800 hover:underline font-medium">
              {row.book_title || `كتاب ${row.book_id}`}
            </Link>
            {row.book_takhrij_author && (
              <span className="text-gray-600"> — {row.book_takhrij_author}</span>
            )}
            {row.book_takhrij_death && (
              <span className="text-gray-400"> (ت {row.book_takhrij_death}هـ)</span>
            )}
            <span className="text-gray-500"> — {count === 1 ? 'رواية واحدة' : `${count} روايات`}</span>
            {hasSource && (
              <span className="mr-1.5 text-[11px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">المصدر الحالي</span>
            )}
            {row.kind !== 'other' && (
              <span className={`mr-1.5 text-[11px] px-1.5 py-0.5 rounded ${KIND_BADGE[row.kind]}`}>
                {KIND_LABEL[row.kind]}
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}

// ── متوسط view ────────────────────────────────────────────────────────────────

function MutawassitView({ rows, sourceId }: { rows: TakhrijRow[]; sourceId: number }) {
  return (
    <ol className="space-y-1.5 text-sm leading-relaxed">
      {rows.map((row, i) => {
        const isCurrent = row.main_id === sourceId
        const pp = partPage(row)
        return (
          <li key={`${row.main_id}-${i}`} className="flex gap-2">
            <span className="text-gray-400 shrink-0 w-6">{i + 1}.</span>
            <span>
              <Link href={`/books/${row.book_id}`} className="text-green-800 hover:underline font-medium">
                {row.book_title || `كتاب ${row.book_id}`}
              </Link>
              {row.book_takhrij_author && (
                <span className="text-gray-600"> — {row.book_takhrij_author}</span>
              )}
              {row.book_takhrij_death && (
                <span className="text-gray-400"> (ت {row.book_takhrij_death}هـ)</span>
              )}
              {(row.tarqeem_harf || row.tarqeem_matboa1) && (
                <span className="text-gray-500"> — برقم{' '}
                  <Link href={`/hadith/${row.main_id}`} className="text-green-700 hover:underline">
                    <HadithNumber harf={row.tarqeem_harf} matboa={row.tarqeem_matboa1} />
                  </Link>
                </span>
              )}
              {pp && <span className="text-gray-400"> — {pp}</span>}
              {isCurrent && (
                <span className="mr-1.5 text-[11px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">المصدر</span>
              )}
              {row.kind !== 'other' && (
                <span className={`mr-1.5 text-[11px] px-1.5 py-0.5 rounded ${KIND_BADGE[row.kind]}`}>
                  {KIND_LABEL[row.kind]}
                </span>
              )}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

// ── تفصيلي view ───────────────────────────────────────────────────────────────

function TafsiliView({ rows, sourceId }: { rows: TakhrijRow[]; sourceId: number }) {
  return (
    <ol className="space-y-3 text-sm leading-relaxed">
      {rows.map((row, i) => {
        const isCurrent = row.main_id === sourceId
        const pp = partPage(row)
        const tarf = row.tarf ? stripTags(row.tarf).slice(0, 120) : null
        const isLong = row.tarf ? stripTags(row.tarf).length > 120 : false
        return (
          <li key={`${row.main_id}-${i}`} className="flex gap-2">
            <span className="text-gray-400 shrink-0 w-6">{i + 1}.</span>
            <div>
              <span>
                <Link href={`/books/${row.book_id}`} className="text-green-800 hover:underline font-medium">
                  {row.book_title || `كتاب ${row.book_id}`}
                </Link>
                {row.book_takhrij_death && (
                  <span className="text-gray-400"> (ت {row.book_takhrij_death}هـ)</span>
                )}
                {(row.tarqeem_harf || row.tarqeem_matboa1) && (
                  <span className="text-gray-500"> — برقم{' '}
                    <Link href={`/hadith/${row.main_id}`} className="text-green-700 hover:underline">
                      <HadithNumber harf={row.tarqeem_harf} matboa={row.tarqeem_matboa1} />
                    </Link>
                  </span>
                )}
                {pp && <span className="text-gray-400"> — {pp}</span>}
                {isCurrent && (
                  <span className="mr-1.5 text-[11px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">المصدر</span>
                )}
                {row.kind !== 'other' && (
                  <span className={`mr-1.5 text-[11px] px-1.5 py-0.5 rounded ${KIND_BADGE[row.kind]}`}>
                    {KIND_LABEL[row.kind]}
                  </span>
                )}
                {row.grade_hint && (
                  <span className={`mr-1.5 text-[11px] px-1.5 py-0.5 rounded ${GRADE_BADGE[row.grade_hint] ?? 'bg-gray-100 text-gray-500'}`}>
                    {row.grade_hint}
                  </span>
                )}
              </span>
              {tarf && (
                <Link href={`/hadith/${row.main_id}`}
                  className="block text-gray-500 text-xs mt-0.5 hover:text-green-700">
                  {tarf}{isLong ? '…' : ''}
                </Link>
              )}
            </div>
          </li>
        )
      })}
    </ol>
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
}: {
  rows: TakhrijRow[]
  sourceId: number
  totalBooks: number
  mutabaatCount: number
  shawahidCount: number
  truncated: boolean
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
      {viewMode === 'ijmali'     && <IjmaliView    rows={sorted} sourceId={sourceId} />}
      {viewMode === 'mutawassit' && <MutawassitView rows={sorted} sourceId={sourceId} />}
      {viewMode === 'tafsili'    && <TafsiliView    rows={sorted} sourceId={sourceId} />}

      {truncated && (
        <p className="text-xs text-gray-400 mt-2 text-center">
          يُعرض أول 120 رواية — لمزيد من الطرق انظر{' '}
          <a href="#adawat" className="text-green-600 hover:underline">صفحة الشواهد الكاملة</a>
        </p>
      )}
    </div>
  )
}
