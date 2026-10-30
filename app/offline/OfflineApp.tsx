'use client'

// The offline app. With no connection, the service worker answers every page with /offline, and
// this reads the address the reader asked for (/hadith/123, /narrators/network, /search?q=…). Once
// the encyclopedia is on the device it loads the offline build of the site (public/offline/app,
// built by scripts/offline/build-offline-app.mjs), which renders that very page with the site's own
// code against the device's copy of the database. /offline itself is the download screen.
import { useEffect, useRef, useState } from 'react'
import OfflineManager from './OfflineManager'
import { refreshOfflineStatus, useOfflineState } from '@/lib/offline/client'

declare global {
  interface Window { __OFFLINE_TARGET?: string }
}

const APP = '/offline/app/app.js'
const APP_CSS = '/offline/app/app.css'

export default function OfflineApp() {
  const [target, setTarget] = useState<string | null>(null)
  const offline = useOfflineState()

  useEffect(() => {
    // The address asked for (captured before Next.js rewrote the bar to /offline)
    const t = window.__OFFLINE_TARGET || location.pathname + location.search
    setTarget(t.replace(/\/+$/, '') || '/')
    refreshOfflineStatus()
  }, [])

  if (!target) return <Loading />
  const online = typeof navigator !== 'undefined' && navigator.onLine
  if (target === '/offline' || target.startsWith('/offline?')) {
    return (
      <div className="max-w-4xl mx-auto font-sans">
        <OfflineBar online={online} />
        <OfflineManager />
      </div>
    )
  }
  if (!offline.status && offline.phase !== 'unsupported' && offline.phase !== 'error') return <Loading />
  if (!offline.status?.ready) return <NotDownloaded />
  return (
    <>
      <OfflineBar online={online} />
      <Site />
    </>
  )
}

function Site() {
  const el = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!document.querySelector(`link[href="${APP_CSS}"]`)) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = APP_CSS
      document.head.appendChild(link)
    }
    let live = true
    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ APP).then(
      (m: { mount: (el: HTMLElement) => void }) => { if (live && el.current) m.mount(el.current) },
      e => live && setError(String(e?.message || e)),
    )
    return () => { live = false }
  }, [])
  if (error) {
    return (
      <Panel>
        <p className="font-bold text-green-900">تعذّر فتح النسخة المحفوظة</p>
        <p className="text-sm text-muted mt-1">{error}</p>
      </Panel>
    )
  }
  return <div ref={el}><Loading /></div>
}

function OfflineBar({ online }: { online: boolean }) {
  if (online) return null
  return (
    <div className="mb-4 rounded-xl bg-surface-sunken border border-border px-3 py-2 text-sm font-sans flex items-center gap-2">
      <span className="w-2 h-2 rounded-full bg-accent-gold" /> لا يوجد اتصال — تقرأ من النسخة المحفوظة على جهازك.
    </div>
  )
}

const Panel = ({ children }: { children: React.ReactNode }) => <div className="rounded-2xl border border-border bg-surface p-4 font-sans">{children}</div>
const Loading = () => (
  <div className="flex justify-center py-16" aria-label="جارٍ التحميل">
    <span className="w-8 h-8 rounded-full border-4 border-border border-t-primary animate-spin" />
  </div>
)
const NotDownloaded = () => (
  <div className="max-w-4xl mx-auto space-y-4 font-sans">
    <Panel>
      <p className="font-bold text-green-900">لا يوجد اتصال بالإنترنت</p>
      <p className="text-sm text-muted mt-1">لم تُحمَّل نسخة الجامع على هذا الجهاز بعد. عند عودة الاتصال حمّلها لتعمل دون إنترنت.</p>
    </Panel>
    <OfflineManager />
  </div>
)
