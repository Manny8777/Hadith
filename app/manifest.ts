import type { MetadataRoute } from 'next'

// The installed app (Android's "Install app", iOS's "Add to Home Screen"): /manifest.webmanifest.
// Icons from scripts/make-app-icons.mjs; the service worker is public/sw.js (InstallApp registers it).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'الجامع — موسوعة الحديث النبوي الشريف',
    short_name: 'الجامع',
    description: 'أداةٌ للباحث في السنة النبوية: كتب السنة كما هي في مصادرها، بأسانيدها ومتونها ورواتها.',
    lang: 'ar',
    dir: 'rtl',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#FAF6EC',
    theme_color: '#0F3D2E',
    categories: ['education', 'books', 'reference'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'البحث', url: '/search', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'الكتب', url: '/books', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'الرواة', url: '/narrators', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  }
}
