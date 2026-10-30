// The installed app's service worker (registered by app/components/InstallApp.tsx).
//
// Online, pages always come from the network: the site is a live database. With no network, a page
// opens the offline app (/offline, app/offline/), which renders the page asked for with the site's
// own code from the copy of the database the reader downloaded to the device; until that copy exists
// it offers the download. To open without a connection, the offline app's page, its build
// (/offline/app/), PostgreSQL's WebAssembly build (/offline/pglite/), scripts, styles and fonts are
// kept here.
const SHELL_CACHE = 'aljami-shell-v3'
const STATIC_CACHE = 'aljami-static-v3'
const KEEP = [SHELL_CACHE, STATIC_CACHE]
const OFFLINE_NOTICE = '/offline.html'
const SHELL = '/offline'
const STATIC_LIMIT = 400
const NAV_TIMEOUT = 4000

let lastRefresh = 0
function refreshShell() {
  if (Date.now() - lastRefresh < 3600e3) return
  lastRefresh = Date.now()
  return cacheShell().catch(() => {})
}

// Whether the encyclopedia is on the device (written by public/offline/worker.mjs)
async function downloaded() {
  try {
    const fh = await (await navigator.storage.getDirectory()).getFileHandle('offline-state.json')
    return !!JSON.parse(await (await fh.getFile()).text()).ready
  } catch {
    return false
  }
}

// Fixed files the reader needs besides what its page links to
const SHELL_FILES = [
  OFFLINE_NOTICE, '/icons/icon-192.png', '/manifest.webmanifest',
  '/offline/worker.mjs', '/offline/pg-worker.mjs',
]
// Lists of the offline build's files, written by scripts/offline/build-offline-app.mjs and
// scripts/offline/copy-offline-assets.mjs
const FILE_LISTS = ['/offline/app/files.json', '/offline/pglite/files.json']

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(c => c.addAll([OFFLINE_NOTICE, '/icons/icon-192.png']))
      .then(() => cacheShell().catch(() => {}))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', event => {
  if (event.data?.type === 'cache-offline-shell') event.waitUntil(cacheShell().catch(() => {}))
})

// The offline app's page, everything it links to (/_next/static/…), the fonts its styles use, the
// offline build of the site and the database's workers with PostgreSQL's WebAssembly build
async function cacheShell() {
  const res = await fetch(SHELL, { cache: 'no-store' })
  if (!res.ok) return
  const html = await res.clone().text()
  const shell = await caches.open(SHELL_CACHE)
  await shell.put(SHELL, res)
  await Promise.all(SHELL_FILES.map(u => fetch(u, { cache: 'no-cache' }).then(r => r.ok && shell.put(u, r)).catch(() => {})))
  // The build's files are named by content hash (PGlite's by version): fetched once each. Files a
  // newer build no longer lists are dropped.
  const listed = new Set(SHELL_FILES.concat(SHELL, FILE_LISTS))
  for (const list of FILE_LISTS) {
    const r = await fetch(list, { cache: 'no-store' }).catch(() => null)
    if (!r?.ok) continue
    const files = await r.clone().json()
    await shell.put(list, r)
    files.forEach(u => listed.add(u))
    const todo = []
    for (const u of files) if (!(await shell.match(u)) || !/\/(c|a)\//.test(u)) todo.push(u)
    let i = 0
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (i < todo.length) {
        const u = todo[i++]
        await fetch(u, { cache: 'no-cache' }).then(f => f.ok && shell.put(u, f)).catch(() => {})
      }
    }))
  }
  for (const req of await shell.keys()) {
    const p = new URL(req.url).pathname
    if (!listed.has(p) && p !== OFFLINE_NOTICE && !p.startsWith('/icons/') && p !== '/manifest.webmanifest') await shell.delete(req)
  }

  const assets = new Set([...html.matchAll(/["'(](\/(?:_next\/static|assets|icons)\/[^"'()\s\\]+)/g)].map(m => m[1]))
  const statics = await caches.open(STATIC_CACHE)
  await Promise.all([...assets].map(async u => {
    if (await statics.match(u)) return
    const r = await fetch(u).catch(() => null)
    if (!r?.ok) return
    if (u.endsWith('.css')) {
      const css = await r.clone().text()
      for (const m of css.matchAll(/url\((['"]?)(\/(?:fonts|_next\/static\/media)\/[^)'"]+)\1\)/g)) {
        if (!(await statics.match(m[2]))) await fetch(m[2]).then(f => f.ok && statics.put(m[2], f)).catch(() => {})
      }
    }
    await statics.put(u, r)
  }))
}

const isStatic = url => /^\/(_next\/static|fonts|offline|assets|icons)\//.test(url.pathname)

async function trim(cache) {
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - STATIC_LIMIT; i++) await cache.delete(keys[i])
}

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const offline = async () => (await caches.match(SHELL, { cacheName: SHELL_CACHE })) || caches.match(OFFLINE_NOTICE)
      const net = fetch(req)
      // A page that loads from the network means a working connection: a good moment to bring the
      // offline build up to date (at most hourly)
      event.waitUntil(net.then(r => { if (r.ok) return refreshShell() }).catch(() => {}))
      // With the encyclopedia on the device, a connection that hangs (weak signal, a Wi-Fi login
      // page) does not keep the reader waiting: after a few seconds the page opens from the device
      if (await downloaded()) {
        const late = new Promise(r => setTimeout(() => r(null), NAV_TIMEOUT))
        const res = await Promise.race([net.catch(() => null), late])
        return res || offline()
      }
      return net.catch(offline)
    })())
    return
  }

  // Build files never change under one name: the network fills the cache, the cache answers. The
  // offline build and PGlite are kept current by cacheShell(), not here: a refresh per file would,
  // on a connection that hangs, tie up every connection the browser has.
  if (isStatic(url)) {
    event.respondWith((async () => {
      const cached = await caches.match(req)
      if (cached) return cached
      const res = await fetch(req)
      if (res.ok) {
        const c = await caches.open(url.pathname.startsWith('/offline/') ? SHELL_CACHE : STATIC_CACHE)
        await c.put(req, res.clone())
        if (url.pathname.startsWith('/_next/static/')) trim(c)
      }
      return res
    })())
  }
})
