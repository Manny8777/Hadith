'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

// Counts a page view (first load and each client-side navigation) for the /admin statistics.
// sendBeacon queues it without delaying anything; no cookies, nothing stored in the browser.
export default function Analytics() {
  const pathname = usePathname()
  useEffect(() => {
    if (!pathname || pathname.startsWith('/admin')) return
    const data = JSON.stringify({ p: pathname, r: document.referrer })
    try {
      if (!navigator.sendBeacon?.('/api/track', new Blob([data], { type: 'application/json' }))) {
        fetch('/api/track', { method: 'POST', body: data, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {})
      }
    } catch { /* never let statistics break a page */ }
  }, [pathname])
  return null
}
