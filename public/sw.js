// The installed app's service worker (registered by app/components/InstallApp.tsx). The site is a
// live database, so nothing is cached for reading: pages always come from the network, and only
// when there is no network does a page open the small offline notice instead of the browser's error.
const CACHE = 'aljami-v1'
const OFFLINE = '/offline.html'

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll([OFFLINE, '/icons/icon-192.png'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)))
})
