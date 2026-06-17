'use client'

import { useRef, useState, useLayoutEffect, useCallback } from 'react'
import Link from 'next/link'
import type { Judgment } from './HadithSidebarLayout'

const GRADE_ORDER: Record<string, number> = { 'صحيح': 0, 'حسن': 1, 'ضعيف': 2 }

function badgeCls(g: string | null): string {
  return g === 'صحيح' ? 'bg-green-100 text-green-800 border-green-200'
    : g === 'حسن' ? 'bg-blue-100 text-blue-800 border-blue-200'
    : g === 'ضعيف' ? 'bg-red-100 text-red-700 border-red-200'
    : 'bg-gray-100 text-gray-600 border-gray-200'
}

function sourceLabel(j: Judgment): string {
  if (!j.source_book) return ''
  const loc = j.source_part != null && j.source_page != null ? `: (${j.source_part} / ${j.source_page})` : ''
  return `${j.source_book}${loc}`
}

export default function HadithGradeBadge({
  judgments, consensusGrade, chipCls,
}: {
  judgments: Judgment[]
  consensusGrade: string | null
  chipCls: string
}) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 })

  const show = useCallback(() => { if (closeTimer.current) clearTimeout(closeTimer.current); setOpen(true) }, [])
  const hide = useCallback(() => { closeTimer.current = setTimeout(() => setOpen(false), 140) }, [])

  useLayoutEffect(() => {
    if (!open) return
    const a = anchorRef.current?.getBoundingClientRect()
    const p = popRef.current?.getBoundingClientRect()
    if (!a || !p) return
    const pad = 8, vw = window.innerWidth, vh = window.innerHeight
    let top = a.bottom + 5
    if (top + p.height > vh - pad) top = a.top - 5 - p.height // flip above if no room below
    top = Math.max(pad, Math.min(top, vh - p.height - pad))
    const left = Math.max(pad, Math.min(a.right - p.width, vw - p.width - pad))
    setPos({ top, left })
  }, [open])

  const sorted = [...judgments].sort((x, y) =>
    (GRADE_ORDER[x.grade_class ?? ''] ?? 9) - (GRADE_ORDER[y.grade_class ?? ''] ?? 9)
    || (x.death_year_num ?? 9999) - (y.death_year_num ?? 9999))

  const hasDetail = judgments.length > 0

  return (
    <span
      ref={anchorRef}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      tabIndex={hasDetail ? 0 : undefined}
    >
      <span className={`inline-flex items-center gap-1 text-sm px-3 py-1 rounded-full border ${hasDetail ? 'cursor-help' : 'cursor-default'} ${chipCls}`}>
        <span className="font-normal opacity-80">الحكم:</span>
        <span className="font-bold">{consensusGrade ?? 'لا يوجد'}</span>
        {hasDetail && <span className="opacity-70 text-[10px]">▾</span>}
      </span>

      {open && hasDetail && (
        <div
          ref={popRef}
          dir="rtl"
          onMouseEnter={show}
          onMouseLeave={hide}
          className="fixed z-50 w-[min(23rem,calc(100vw-1rem))] max-h-[calc(100vh-1rem)] overflow-y-auto bg-surface border border-border rounded-xl shadow-lg p-3 text-right"
          style={{ top: pos.top, left: pos.left }}
        >
          <p className="text-xs font-bold text-green-900 mb-2">
            أقوال العلماء في درجة الحديث ({judgments.length})
          </p>
          <ul className="space-y-2.5">
            {sorted.map((j, i) => (
              <li key={i} className="text-xs">
                <div className="flex items-start gap-1.5">
                  {j.grade_class && (
                    <span className={`shrink-0 mt-px text-[10px] font-bold px-1.5 py-0.5 rounded border ${badgeCls(j.grade_class)}`}>
                      {j.grade_class}
                    </span>
                  )}
                  <p className="text-ink leading-relaxed flex-1">{j.say_text}</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 ps-1">
                  {j.scientist_name ? (
                    j.scientist_id ? (
                      <Link href={`/narrator/${j.scientist_id}`} className="font-bold text-green-800 hover:text-green-600 hover:underline">
                        {j.abb_name || j.scientist_name}
                      </Link>
                    ) : (
                      <span className="font-bold text-green-800">{j.abb_name || j.scientist_name}</span>
                    )
                  ) : (
                    <span className="text-gray-400">عالم غير محدد</span>
                  )}
                  {j.death_year_num != null && <span className="text-gray-400">ت {j.death_year_num}هـ</span>}
                  {j.source_book && (
                    j.source_content_id ? (
                      <Link href={`/service-content/${j.source_content_id}`} className="text-blue-600 hover:underline">
                        {sourceLabel(j)}
                      </Link>
                    ) : (
                      <span className="text-gray-400">{sourceLabel(j)}</span>
                    )
                  )}
                </div>
              </li>
            ))}
          </ul>
          <a href="#aqwal" className="block mt-2 pt-2 border-t border-border text-[11px] text-green-700 hover:underline">
            عرض التفصيل الكامل في «أقوال العلماء» ←
          </a>
        </div>
      )}
    </span>
  )
}
