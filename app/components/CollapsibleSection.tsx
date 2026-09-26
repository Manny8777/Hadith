'use client'

import { useEffect, useState, type ReactNode } from 'react'

// A hadith-page section that starts closed: the reader sees its title and summary, and opens only
// what they want. The body is mounted on first open (so its data loads then, not on page load) and
// kept mounted afterwards. A link to #id (the page's table of contents) opens it.
export default function CollapsibleSection({
  id, label, sub, children,
}: {
  id: string
  label: string
  sub?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const show = () => { setOpen(true); setMounted(true) }
    if (window.location.hash === `#${id}`) show()
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.(`a[href="#${id}"]`)) show()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [id])

  return (
    <section id={id} className={`ui-card mb-3 scroll-mt-header overflow-hidden ${open ? 'ring-1 ring-accent-gold/40' : ''}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-body`}
        onClick={() => { setOpen(o => !o); setMounted(true) }}
        className={`w-full flex items-center gap-3 px-4 sm:px-5 py-3.5 text-right cursor-pointer transition-colors hover:bg-surface-sunken/50 ${open ? 'border-b border-border bg-surface-sunken/40' : ''}`}
      >
        <span className="flex-1 min-w-0">
          <span className="block text-base sm:text-lg font-bold text-ink font-display leading-snug">{label}</span>
          {sub && <span className="block text-xs text-gray-500 font-sans mt-0.5">{sub}</span>}
        </span>
        <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-sans font-medium transition-colors ${
          open
            ? 'border-border bg-surface text-gray-600'
            : 'border-green-700 bg-green-700 text-white'
        }`}>
          {open ? 'إخفاء' : 'عرض'}
          <svg aria-hidden viewBox="0 0 20 20" className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 8l5 5 5-5" />
          </svg>
        </span>
      </button>
      {mounted && (
        <div id={`${id}-body`} hidden={!open} className="px-3 sm:px-5 pt-4 pb-5">
          {children}
        </div>
      )}
    </section>
  )
}
