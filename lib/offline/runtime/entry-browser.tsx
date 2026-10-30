// The offline app in the browser. With no connection the service worker answers every page with
// /offline, which loads this: it opens the device's copy of the database (PGlite, real Postgres),
// then renders the site's own page for the address in the bar, exactly as the server would, and
// keeps doing so as the reader follows links. /api/… calls from the pages' client components are
// answered by the site's own route handlers, here.
import { createRoot } from 'react-dom/client'
import { createElement, Fragment, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
// @ts-expect-error served as a static file (public/offline/pglite), not bundled
import { PGliteWorker } from '/offline/pglite/worker/index.js'
import { setOfflineRunner } from './shims/db'
import { withQueryCache } from './cache'
import { router } from './router'
import { renderPage, handleApi, matchPage, type Rendered } from './core'
import { NumberingProvider } from '@/lib/numberingContext'
import { NumeralProvider } from '@/lib/numeralContext'

declare global { interface Window { __OFFLINE_TARGET?: string } }

const pg = new PGliteWorker(new Worker('/offline/pg-worker.mjs', { type: 'module' }))
setOfflineRunner(withQueryCache(async (text, params) => {
  const r = await pg.query(text, params ?? [])
  return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length, fields: r.fields }
}))

// The pages' client components call /api/…: answer from here
const netFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url, location.href)
  if (url.origin === location.origin && url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/offline/')) {
    try {
      const res = await handleApi(url, init ?? (input instanceof Request ? { method: input.method, headers: input.headers } : undefined))
      if (res) return res
    } catch (e) {
      console.error('offline api', url.pathname, e)
      return Response.json({ error: 'offline' }, { status: 500 })
    }
  }
  return netFetch(input, init)
}

// Links: pages the offline app has open in place; everything else is an ordinary navigation
document.addEventListener('click', e => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  const a = (e.target as HTMLElement | null)?.closest?.('a')
  if (!a || !a.href || (a.target && a.target !== '_self') || a.hasAttribute('download')) return
  const u = new URL(a.href)
  if (u.origin !== location.origin || u.pathname.startsWith('/api/')) return
  if (u.pathname === location.pathname && u.search === location.search && u.hash) return
  if (!matchPage(u.pathname)) return
  e.preventDefault()
  router.navigate(u.pathname + u.search + u.hash, { replace: a.hasAttribute('data-replace') })
}, true)

// Forms that GET a page (search boxes): handled the same way
document.addEventListener('submit', e => {
  const f = e.target as HTMLFormElement
  if (e.defaultPrevented || (f.method && f.method.toLowerCase() !== 'get') || !f.action) return
  const u = new URL(f.action, location.href)
  if (u.origin !== location.origin || !matchPage(u.pathname)) return
  e.preventDefault()
  const q = new URLSearchParams(new FormData(f) as unknown as Record<string, string>)
  router.navigate(u.pathname + '?' + q.toString())
}, true)

function App() {
  const loc = useSyncExternalStore(router.subscribe, router.snapshot, router.snapshot)
  const key = useSyncExternalStore(router.subscribe, router.refreshKey, router.refreshKey)
  const [state, setState] = useState<{ href: string; r: Rendered | null; error: string | null; loading: boolean }>({ href: '', r: null, error: null, loading: true })

  useEffect(() => {
    let live = true
    const href = loc.pathname + loc.search
    setState(s => ({ ...s, loading: true }))
    renderPage(loc.pathname, loc.searchParams).then(r => {
      if (!live) return
      if (r.kind === 'redirect') { router.navigate(r.url, { replace: true }); return }
      if (r.kind === 'page') { router.setParams(r.params); if (r.title) document.title = r.title }
      setState({ href, r, error: null, loading: false })
    }, e => live && setState({ href, r: null, error: String(e?.message || e), loading: false }))
    return () => { live = false }
  }, [loc.pathname, loc.search, key])

  let body: ReactNode
  if (state.error) body = <Notice title="تعذّر عرض الصفحة من النسخة المحفوظة" text={state.error} />
  else if (!state.r) body = <Spinner />
  else if (state.r.kind === 'page') body = createElement(Fragment, { key: state.href }, state.r.node)
  else if (state.r.kind === 'notfound') body = <Notice title="الصفحة غير موجودة" text="" />
  else body = <Notice title="هذه الصفحة تحتاج إلى اتصال" text="تسجيل الدخول والمكتبة الشخصية تعمل مع الاتصال فقط." />

  return (
    <NumberingProvider>
      <NumeralProvider>
        {state.loading && state.r && <div className="fixed top-0 inset-x-0 h-0.5 z-[80] bg-accent-gold animate-pulse" />}
        {body}
      </NumeralProvider>
    </NumberingProvider>
  )
}

const Spinner = () => (
  <div className="flex justify-center py-16" aria-label="جارٍ التحميل">
    <span className="w-8 h-8 rounded-full border-4 border-border border-t-primary animate-spin" />
  </div>
)
const Notice = ({ title, text }: { title: string; text: string }) => (
  <div className="rounded-2xl border border-border bg-surface p-4 font-sans">
    <p className="font-bold text-green-900">{title}</p>
    {text && <p className="text-sm text-muted mt-1">{text}</p>}
  </div>
)

export function mount(el: HTMLElement) {
  const target = window.__OFFLINE_TARGET
  if (target && target !== location.pathname + location.search) history.replaceState(null, '', target)
  router.sync()
  createRoot(el).render(<App />)
}
