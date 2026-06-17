'use client'

import { useRef, useState, useLayoutEffect, useCallback, type ReactNode } from 'react'

// A hover popover that escapes overflow (position: fixed) and stays inside the viewport.
// Used inside React Flow nodes, where the canvas clips and zoom-transforms normal tooltips.
export default function HoverCard({
  trigger, children, width = '22rem',
}: {
  trigger: ReactNode
  children: ReactNode
  width?: string
}) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 })

  const show = useCallback(() => { if (timer.current) clearTimeout(timer.current); setOpen(true) }, [])
  const hide = useCallback(() => { timer.current = setTimeout(() => setOpen(false), 150) }, [])

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

  return (
    <span
      ref={anchorRef}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      tabIndex={0}
    >
      {trigger}
      {open && (
        <div
          ref={popRef}
          dir="rtl"
          onMouseEnter={show}
          onMouseLeave={hide}
          className="nodrag nopan fixed z-[60] overflow-y-auto bg-surface border border-border rounded-xl shadow-lg p-3 text-right cursor-default"
          style={{ top: pos.top, left: pos.left, width: `min(${width}, calc(100vw - 1rem))`, maxHeight: 'calc(100vh - 1rem)' }}
        >
          {children}
        </div>
      )}
    </span>
  )
}
