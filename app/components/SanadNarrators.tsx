'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { stripTashkeel } from '@/lib/ghareeb'
import type { SanadNarratorPreview, SanadSegment } from '@/lib/sanadNarrators'

interface SanadNarratorsProps {
  segments: SanadSegment[]
  narrators: Record<number, SanadNarratorPreview>
  showTashkeel: boolean
  className?: string
}

function displayText(text: string, showTashkeel: boolean): string {
  return showTashkeel ? text : stripTashkeel(text)
}

function NarratorPopover({
  narrator,
  anchorRect,
  onClose,
}: {
  narrator: SanadNarratorPreview
  anchorRect: DOMRect
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState({ top: anchorRect.top, left: anchorRect.left })

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [onClose])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const pad = 8
    const gap = 10
    const { width: w, height: h } = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    // Open on whichever side of the anchor has more room, then clamp fully into the viewport
    let left = anchorRect.left >= vw - anchorRect.right
      ? anchorRect.left - gap - w
      : anchorRect.right + gap
    left = Math.max(pad, Math.min(left, vw - w - pad))

    let top = anchorRect.top + anchorRect.height / 2 - h / 2
    top = Math.max(pad, Math.min(top, vh - h - pad))

    setStyle({ top, left })
  }, [anchorRect, narrator.id])

  const death =
    narrator.death_year ||
    (narrator.death_year_num != null ? `${narrator.death_year_num} هـ` : null)

  return (
    <div
      ref={ref}
      dir="rtl"
      className="fixed z-50 w-[min(22rem,calc(100vw-2rem))] max-h-[calc(100vh-1rem)] overflow-y-auto rounded-xl bg-gray-900 text-white shadow-2xl border border-gray-700"
      style={{ top: style.top, left: style.left }}
      role="dialog"
    >
      <div className="px-4 pt-3 pb-2 border-b border-gray-700/80">
        <span className="text-[10px] font-bold tracking-wider text-teal-300 uppercase">
          راوٍ
        </span>
        <p className="text-base font-bold text-teal-50 mt-0.5 font-serif leading-snug">
          {narrator.name}
        </p>
        {narrator.kunia && (
          <p className="text-xs text-gray-400 mt-0.5">{narrator.kunia}</p>
        )}
      </div>

      <div className="px-4 py-3 space-y-1.5 text-xs text-gray-300">
        {narrator.is_companion && (
          <span className="inline-block bg-amber-500/20 text-amber-200 border border-amber-500/40 px-2 py-0.5 rounded-full text-[11px] mb-1">
            صحابي
          </span>
        )}
        {narrator.tabaqa && (
          <p>
            <span className="text-gray-500">الطبقة: </span>
            {narrator.tabaqa}
          </p>
        )}
        {death && (
          <p>
            <span className="text-gray-500">الوفاة: </span>
            {death}
          </p>
        )}
        {narrator.martaba_ibn_hajar && (
          <p>
            <span className="text-gray-500">ابن حجر: </span>
            {narrator.martaba_ibn_hajar}
          </p>
        )}
        {narrator.martaba_zahabi && (
          <p>
            <span className="text-gray-500">الذهبي: </span>
            {narrator.martaba_zahabi}
          </p>
        )}
      </div>

      <div className="px-4 py-2 bg-gray-800/60 border-t border-gray-700">
        <Link
          href={`/narrator/${narrator.id}`}
          className="text-xs text-teal-300 hover:text-teal-200 hover:underline"
        >
          الترجمة الكاملة ←
        </Link>
      </div>
    </div>
  )
}

export default function SanadNarrators({
  segments,
  narrators,
  showTashkeel,
  className = '',
}: SanadNarratorsProps) {
  const [activeId, setActiveId] = useState<number | null>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      setActiveId(null)
      setAnchorRect(null)
    }, 200)
  }, [])

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }, [])

  const openPopover = useCallback(
    (narratorId: number, el: HTMLElement) => {
      if (!narrators[narratorId]) return
      cancelClose()
      setActiveId(narratorId)
      setAnchorRect(el.getBoundingClientRect())
    },
    [cancelClose, narrators]
  )

  const closePopover = useCallback(() => {
    scheduleClose()
  }, [scheduleClose])

  const rendered = useMemo(() => {
    const nodes: ReactNode[] = []

    segments.forEach((seg, i) => {
      const text = displayText(seg.text, showTashkeel)

      if (seg.kind === 'narrator' && seg.narratorId && narrators[seg.narratorId]) {
        const id = seg.narratorId
        nodes.push(
          <span
            key={`nar-${id}-${i}`}
            className="font-bold text-ink cursor-pointer rounded-sm px-0.5 underline decoration-green-300 decoration-1 underline-offset-[5px] transition-colors hover:decoration-green-600 hover:text-green-800"
            onClick={e => {
              e.stopPropagation()
              if (activeId === id) closePopover()
              else openPopover(id, e.currentTarget)
            }}
            role="button"
            tabIndex={0}
            aria-label={`راوٍ: ${narrators[id].name}`}
          >
            {text}
          </span>
        )
      } else {
        nodes.push(
          <span key={`txt-${i}`}>{text}</span>
        )
      }
    })

    return nodes
  }, [
    segments,
    narrators,
    showTashkeel,
    openPopover,
    closePopover,
    activeId,
  ])

  const activeNarrator = activeId != null ? narrators[activeId] : null

  return (
    <>
      <p className={className} dir="rtl">
        {rendered}
      </p>
      {activeNarrator && anchorRect && (
        <NarratorPopover
          narrator={activeNarrator}
          anchorRect={anchorRect}
          onClose={scheduleClose}
        />
      )}
    </>
  )
}
