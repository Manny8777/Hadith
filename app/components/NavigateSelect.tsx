'use client'

import type { ReactNode } from 'react'

// A <select> for server pages: choosing an option sets `param` on `href` and navigates.
// Server components can't pass onChange handlers, so this carries the interactivity.
export default function NavigateSelect({
  href,
  param,
  defaultValue,
  className,
  children,
}: {
  href: string
  param: string
  defaultValue?: string | number | null
  className?: string
  children: ReactNode
}) {
  return (
    <select
      defaultValue={defaultValue == null ? '' : String(defaultValue)}
      className={className}
      onChange={e => {
        const url = new URL(href, window.location.origin)
        if (e.target.value) url.searchParams.set(param, e.target.value)
        else url.searchParams.delete(param)
        window.location.href = url.pathname + url.search
      }}
    >
      {children}
    </select>
  )
}
