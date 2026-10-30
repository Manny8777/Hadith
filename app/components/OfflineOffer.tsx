'use client'

// In the installed app: the offer to download the encyclopedia for use without internet, and while
// it downloads, a small progress pill on every page (tapping it opens /offline with the details).
// Once the data is on the device, it asks the service worker to refresh its copy of the offline
// reader, so the reader matches the site after each release.
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { canPrompt, installApp } from './InstallApp'
import {
  fetchOfflineManifest, formatBytes, offlineSupported, refreshOfflineStatus, startOfflineDownload,
  useOfflineState, type OfflineManifest,
} from '@/lib/offline/client'

const DISMISS_KEY = 'offline-offer-dismissed'
const DISMISS_DAYS = 14

const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export default function OfflineOffer() {
  const s = useOfflineState()
  const pathname = usePathname()
  const [eligible, setEligible] = useState(false)
  const [offer, setOffer] = useState(false)
  const [manifest, setManifest] = useState<OfflineManifest | null>(null)

  useEffect(() => {
    if (!offlineSupported()) return
    let started = false
    try { started = !!localStorage.getItem('offline-ready') || !!localStorage.getItem('offline-started') } catch {}
    if (!standalone() && !started) return
    setEligible(true)
    refreshOfflineStatus().then(status => {
      if (status?.ready) {
        // Bring the offline build up to date, unless this page itself came from the device
        if (pathname !== '/offline' && !('__OFFLINE_TARGET' in window)) navigator.serviceWorker?.ready.then(r => r.active?.postMessage({ type: 'cache-offline-shell' })).catch(() => {})
        return
      }
      let dismissed = 0
      try { dismissed = Number(localStorage.getItem(DISMISS_KEY)) || 0 } catch {}
      if (Date.now() - dismissed < DISMISS_DAYS * 864e5 && !status?.staged) return
      if (navigator.onLine) fetchOfflineManifest().then(m => { if (m) { setManifest(m); setTimeout(() => setOffer(true), 3000) } })
    })
  }, [])

  if (!eligible || pathname === '/offline') return null
  const busy = s.phase === 'download' || s.phase === 'import'

  if (busy) {
    const p = s.total > 0 ? Math.floor((s.done / s.total) * 100) : 0
    return (
      <a href="/offline" aria-label="تقدّم التحميل للعمل دون إنترنت"
        className="fixed z-[60] left-3 rounded-full bg-[#0F3D2E] text-[#F8F1E4] shadow-xl border border-[#C9A96B]/40 pl-4 pr-2 py-2 flex items-center gap-2 font-sans text-sm"
        style={{ bottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
        <Ring p={p} />
        {s.phase === 'download' ? 'تحميل الجامع' : 'تجهيز البيانات'} {p.toLocaleString('ar-EG')}٪
      </a>
    )
  }

  if (!offer || s.status?.ready) return null
  const resuming = (s.status?.staged ?? 0) > 0
  const dismiss = () => {
    setOffer(false)
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
  }
  const start = () => {
    setOffer(false)
    try { localStorage.setItem('offline-started', '1') } catch {}
    if (canPrompt()) installApp()
    startOfflineDownload()
  }

  return (
    <div role="dialog" aria-label="استخدم الجامع دون إنترنت"
      className="fixed inset-x-3 sm:inset-x-auto sm:left-4 sm:w-[420px] z-[60] rounded-2xl bg-[#0F3D2E] text-[#F8F1E4] shadow-2xl border border-[#C9A96B]/40 p-4 font-sans"
      style={{ bottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
      <p className="font-bold">{resuming ? 'أكمل تحميل الجامع' : 'استخدم الجامع دون إنترنت'}</p>
      <p className="text-xs opacity-80 leading-relaxed mt-1">
        {resuming
          ? `تمّ تحميل ${formatBytes(s.status!.stagedBytes)}، ويكمل من حيث توقّف.`
          : 'حمّل الموسوعة كاملة على جهازك مرة واحدة، فيعمل الموقع كله بلا اتصال.'}
        {manifest && <> حجم التحميل {formatBytes(manifest.downloadSize)} (يُفضَّل عبر Wi-Fi).</>}
      </p>
      <div className="flex items-center gap-2 mt-3">
        <button type="button" onClick={start} className="rounded-full bg-[#C9A96B] text-[#13261b] text-sm font-bold px-4 py-2">
          {resuming ? 'متابعة التحميل' : 'تثبيت الجامع'}
        </button>
        <a href="/offline" className="text-sm underline underline-offset-2 opacity-90">التفاصيل</a>
        <button type="button" onClick={dismiss} className="mr-auto text-sm opacity-70 hover:opacity-100">ليس الآن</button>
      </div>
    </div>
  )
}

const Ring = ({ p }: { p: number }) => (
  <svg width="22" height="22" viewBox="0 0 36 36" aria-hidden="true">
    <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="5" />
    <circle cx="18" cy="18" r="15" fill="none" stroke="#C9A96B" strokeWidth="5" strokeLinecap="round"
      strokeDasharray={`${(p / 100) * 94.2} 94.2`} transform="rotate(-90 18 18)" />
  </svg>
)
