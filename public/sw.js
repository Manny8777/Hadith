// The installed app's service worker (registered by app/components/InstallApp.tsx).
//
// Online, pages always come from the network: the site is a live database. With no network, a page
// opens the offline reader (/offline, app/offline/), which shows the page asked for from the copy of
// the database the reader downloaded to the device; until that copy exists it offers the download.
// To open without a connection the reader's page and its scripts, styles and fonts are kept here.
const SHELL_CACHE = 'aljami-shell-v2'
const STATIC_CACHE = 'aljami-static-v2'
const KEEP = [SHELL_CACHE, STATIC_CACHE]
const OFFLINE_NOTICE = '/offline.html'
const SHELL = '/offline'
const STATIC_LIMIT = 400

// Fixed files the reader needs besides what its page links to
const SHELL_FILES = [
  OFFLINE_NOTICE, '/icons/icon-192.png', '/manifest.webmanifest',
  '/offline/worker.mjs', '/offline/sqlite/index.mjs', '/offline/sqlite/sqlite3.wasm',
]

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

// The reader's page, everything it links to (/_next/static/…), the fonts its styles use, and the
// database worker with SQLite's WebAssembly build
async function cacheShell() {
  const res = await fetch(SHELL, { cache: 'no-store' })
  if (!res.ok) return
  const html = await res.clone().text()
  const shell = await caches.open(SHELL_CACHE)
  await shell.put(SHELL, res)
  await Promise.all(SHELL_FILES.map(u => fetch(u, { cache: 'no-cache' }).then(r => r.ok && shell.put(u, r)).catch(() => {})))

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
    event.respondWith(
      fetch(req).catch(async () =>
        (await caches.match(SHELL, { cacheName: SHELL_CACHE })) || caches.match(OFFLINE_NOTICE)),
    )
    return
  }

  // Build files never change under one name: the network fills the cache, the cache answers offline
  if (isStatic(url)) {
    event.respondWith((async () => {
      const cached = await caches.match(req)
      if (cached && url.pathname.startsWith('/_next/static/')) return cached
      try {
        const res = await fetch(req)
        if (res.ok) {
          const c = await caches.open(url.pathname.startsWith('/offline/') ? SHELL_CACHE : STATIC_CACHE)
          await c.put(req, res.clone())
          if (url.pathname.startsWith('/_next/static/')) trim(c)
        }
        return res
      } catch (e) {
        if (cached) return cached
        throw e
      }
    })())
  }
})
