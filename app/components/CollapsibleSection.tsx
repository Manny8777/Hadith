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
    <section id={id} className="mb-4 scroll-mt-header">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-body`}
        onClick={() => { setOpen(o => !o); setMounted(true) }}
        className="ui-section-head !mb-0 w-full text-right cursor-pointer rounded-lg py-2 hover:bg-surface-sunken/60 transition-colors"
      >
        <h2 className="ui-section-head-title">{label}</h2>
        {sub && <span className="ui-section-head-sub">{sub}</span>}
        <span className="ui-section-head-rule" />
        <span aria-hidden className={`text-gray-400 text-sm transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {mounted && (
        <div id={`${id}-body`} hidden={!open} className="pt-3 pb-4">
          {children}
        </div>
      )}
    </section>
  )
}
