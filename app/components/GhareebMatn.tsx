'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { findGhareebMatches, stripTashkeel, type GhareebWord } from '@/lib/ghareeb'

interface GhareebMatnProps {
  hadithId: number
  matn: string
  showTashkeel: boolean
  className?: string
}

function GhareebPopover({
  word,
  anchorRect,
  onClose,
  onEnter,
}: {
  word: GhareebWord
  anchorRect: DOMRect
  onClose: () => void
  onEnter: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<{ top: number; left: number }>({
    top: anchorRect.top,
    left: anchorRect.left,
  })

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

    // Open on whichever side of the word has more room, then clamp fully into the viewport
    let left = anchorRect.left >= vw - anchorRect.right
      ? anchorRect.left - gap - w
      : anchorRect.right + gap
    left = Math.max(pad, Math.min(left, vw - w - pad))

    let top = anchorRect.top + anchorRect.height / 2 - h / 2
    top = Math.max(pad, Math.min(top, vh - h - pad))

    setStyle({ top, left })
  }, [anchorRect, word])

  const sources = word.sources?.length ? word.sources : [{
    definition: word.definition,
    verbatimText: word.definition,
    sourceBook: word.sourceBook,
    sourceRefId: word.sourceRefId,
  }]

  return (
    <div
      ref={ref}
      dir="rtl"
      className="fixed z-50 w-[min(28rem,calc(100vw-2rem))] max-h-[calc(100vh-1rem)] rounded-xl bg-gray-900 text-white shadow-2xl border border-gray-700 overflow-hidden flex flex-col"
      style={{ top: style.top, left: style.left }}
      role="tooltip"
      onMouseEnter={onEnter}
      onMouseLeave={onClose}
    >
      <div className="px-4 pt-3 pb-2 border-b border-gray-700/80 shrink-0">
        <span className="text-[10px] font-bold tracking-wider text-orange-300 uppercase">
          غريب
        </span>
        <p className="text-lg font-bold text-orange-100 mt-0.5 font-serif">{word.wordText}</p>
        {word.formText !== word.wordText && (
          <p className="text-xs text-gray-400 mt-0.5">صيغة: {word.formText}</p>
        )}
      </div>
      <div className="overflow-y-auto divide-y divide-gray-700/60 min-h-0">
        {sources.map((src, i) => {
          const text = src.verbatimText || src.definition
          return (
          <div key={`${src.sourceRefId ?? i}-${src.sourceBook ?? i}`} className="px-4 py-3">
            {src.sourceBook && (
              <p className="text-[11px] font-semibold text-orange-300/90 mb-1.5">{src.sourceBook}</p>
            )}
            {text ? (
              <p className="text-sm text-gray-200 leading-relaxed font-serif whitespace-pre-wrap">{text}</p>
            ) : (
              <p className="text-xs text-gray-500">لا يوجد شرح متاح</p>
            )}
            {src.sourceRefId && (
              <Link
                href={`/service-content/${src.sourceRefId}`}
                className="inline-block mt-2 text-[11px] text-gray-400 hover:text-orange-200 hover:underline"
              >
                عرض المصدر ←
              </Link>
            )}
          </div>
          )
        })}
      </div>
      {word.wordId > 0 && (
      <div className="px-4 py-2 bg-gray-800/60 border-t border-gray-700 shrink-0">
        <Link
          href={`/lexicon/${word.wordId}`}
          className="text-xs text-orange-300 hover:text-orange-200 hover:underline"
        >
          المعجم ←
        </Link>
      </div>
      )}
    </div>
  )
}

export default function GhareebMatn({
  hadithId,
  matn,
  showTashkeel,
  className = '',
}: GhareebMatnProps) {
  const [words, setWords] = useState<GhareebWord[]>([])
  const [loading, setLoading] = useState(true)
  const [activeWord, setActiveWord] = useState<GhareebWord | null>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      setActiveWord(null)
      setAnchorRect(null)
    }, 200)
  }, [])

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }, [])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/hadith/${hadithId}/ghareeb-words`)
      .then(r => r.json())
      .then(data => {
        setWords(data.words || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [hadithId])

  const displayMatn = useMemo(() => {
    if (showTashkeel) return matn
    return stripTashkeel(matn)
  }, [matn, showTashkeel])

  const matches = useMemo(
    () => findGhareebMatches(displayMatn, words),
    [displayMatn, words]
  )

  const wordByFormId = useMemo(() => {
    const map = new Map<number, GhareebWord>()
    words.forEach(w => map.set(w.formId, w))
    return map
  }, [words])

  const openPopover = useCallback((word: GhareebWord, el: HTMLElement) => {
    cancelClose()
    setActiveWord(word)
    setAnchorRect(el.getBoundingClientRect())
  }, [cancelClose])

  const closePopover = useCallback(() => {
    scheduleClose()
  }, [scheduleClose])

  if (loading) {
    return (
      <p className={className || 'text-lg leading-loose text-gray-900 font-serif'} dir="rtl">
        {displayMatn}
      </p>
    )
  }

  if (matches.length === 0) {
    return (
      <p className={className || 'text-lg leading-loose text-gray-900 font-serif'} dir="rtl">
        {displayMatn}
      </p>
    )
  }

  const segments: ReactNode[] = []
  let cursor = 0

  for (const m of matches) {
    if (m.start > cursor) {
      segments.push(displayMatn.slice(cursor, m.start))
    }
    const word = wordByFormId.get(m.formId)
    if (word) {
      segments.push(
        <span
          key={`${m.formId}-${m.start}`}
          className="cursor-help bg-orange-100/50 rounded-sm px-0.5 transition-colors hover:bg-orange-200/60"
          onMouseEnter={e => openPopover(word, e.currentTarget)}
          onMouseLeave={() => closePopover()}
          onClick={e => {
            e.stopPropagation()
            if (activeWord?.formId === word.formId) closePopover()
            else openPopover(word, e.currentTarget)
          }}
          role="button"
          tabIndex={0}
          aria-label={`غريب: ${word.wordText}`}
        >
          {displayMatn.slice(m.start, m.end)}
        </span>
      )
    } else {
      segments.push(displayMatn.slice(m.start, m.end))
    }
    cursor = m.end
  }

  if (cursor < displayMatn.length) {
    segments.push(displayMatn.slice(cursor))
  }

  return (
    <>
      <p className={className || 'text-lg leading-loose text-gray-900 font-serif'} dir="rtl">
        {segments}
      </p>
      {activeWord && anchorRect && (
        <GhareebPopover
          word={activeWord}
          anchorRect={anchorRect}
          onClose={scheduleClose}
          onEnter={cancelClose}
        />
      )}
    </>
  )
}
