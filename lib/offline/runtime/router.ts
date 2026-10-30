// The offline app's router: the address bar is the state; links and router.push() change it with
// history.pushState, and the app renders the page the new address names.
export interface Location { pathname: string; search: string; searchParams: URLSearchParams; params: Record<string, string | string[]> }

let current: Location = { pathname: '/', search: '', searchParams: new URLSearchParams(), params: {} }
const listeners = new Set<() => void>()
let refreshCount = 0

function read(params: Record<string, string | string[]> = {}): Location {
  return { pathname: location.pathname, search: location.search, searchParams: new URLSearchParams(location.search), params }
}

export const router = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } },
  snapshot: () => current,
  refreshKey: () => refreshCount,
  /** Set by the app once it knows which route (and so which params) the address matches */
  setParams(params: Record<string, string | string[]>) { current = { ...current, params } },
  sync() { current = read(current.params); listeners.forEach(l => l()) },
  navigate(href: string, opts: { replace?: boolean } = {}) {
    const u = new URL(href, location.href)
    if (u.origin !== location.origin) { location.href = u.href; return }
    if (opts.replace) history.replaceState(null, '', u.pathname + u.search + u.hash)
    else history.pushState(null, '', u.pathname + u.search + u.hash)
    current = read()
    listeners.forEach(l => l())
    if (!u.hash) window.scrollTo(0, 0)
  },
  refresh() { refreshCount++; current = { ...current }; listeners.forEach(l => l()) },
}

if (typeof window !== 'undefined') {
  current = read()
  window.addEventListener('popstate', () => router.sync())
}
