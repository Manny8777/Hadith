import type { Metadata } from 'next'
import OfflineApp from './OfflineApp'

// «الجامع دون إنترنت»: the download screen, and the reader the service worker opens for any page
// when there is no connection (public/sw.js). Static, so the worker can keep a copy of it.
export const dynamic = 'force-static'

export const metadata: Metadata = {
  title: 'الجامع دون إنترنت',
  description: 'حمّل موسوعة الحديث كاملة على جهازك لتعمل دون اتصال بالإنترنت.',
}

// Opened in place of another page (/hadith/123 …), Next.js resets the address bar to /offline when
// it starts; this keeps the address that was asked for, for OfflineApp to show and restore.
const KEEP_TARGET = `window.__OFFLINE_TARGET=location.pathname+location.search`

export default function OfflinePage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: KEEP_TARGET }} />
      <OfflineApp />
    </>
  )
}
