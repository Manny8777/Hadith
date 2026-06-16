'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { findGhareebMatches, type GhareebWord } from '@/lib/ghareeb'

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

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [onClose])

  const top = anchorRect.bottom + 8
  const left = Math.min(
    Math.max(anchorRect.left + anchorRect.width / 2, 160),
    typeof window !== 'undefined' ? window.innerWidth - 160 : 160
  )

  return (
    <div
      ref={ref}
      dir="rtl"
      className="fixed z-50 w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl bg-gray-900 text-white shadow-2xl border border-gray-700 overflow-hidden"
      style={{ top, left }}
      role="tooltip"
      onMouseEnter={onEnter}
      onMouseLeave={onClose}
    >
      <div className="px-4 pt-3 pb-2 border-b border-gray-700/80">
        <span className="text-[10px] font-bold tracking-wider text-amber-400 uppercase">
          غريب
        </span>
        <p className="text-lg font-bold text-amber-100 mt-0.5 font-serif">{word.wordText}</p>
        {word.formText !== word.wordText && (
          <p className="text-xs text-gray-400 mt-0.5">صيغة: {word.formText}</p>
        )}
        {word.sourceBook && (
          <p className="text-xs text-gray-400 mt-1">{word.sourceBook}</p>
        )}
      </div>
      {word.definition ? (
        <div className="px-4 py-3 max-h-44 overflow-y-auto text-sm text-gray-200 leading-relaxed font-serif">
          {word.definition}
        </div>
      ) : (
        <div className="px-4 py-3 text-xs text-gray-500">لا يوجد شرح متاح</div>
      )}
      <div className="px-4 py-2 bg-gray-800/60 border-t border-gray-700 flex items-center justify-between gap-2">
        <Link
          href={`/lexicon/${word.wordId}`}
          className="text-xs text-amber-300 hover:text-amber-200 hover:underline"
        >
          المعجم ←
        </Link>
        {word.sourceRefId && (
          <Link
            href={`/service-content/${word.sourceRefId}`}
            className="text-xs text-gray-400 hover:text-gray-300 hover:underline"
          >
            المصدر
          </Link>
        )}
      </div>
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
    return matn.replace(/[ؐ-ًؚ-ٰٟ]/g, '')
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

  if (loading || matches.length === 0) {
    return (
      <p className={`text-lg leading-loose text-gray-900 font-serif ${className}`} dir="rtl">
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
          className="text-amber-800 border-b-2 border-dotted border-amber-500 cursor-help bg-amber-50/70 rounded-sm px-0.5 transition-colors hover:bg-amber-100 hover:text-amber-900"
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
      <p className={`text-lg leading-loose text-gray-900 font-serif ${className}`} dir="rtl">
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
