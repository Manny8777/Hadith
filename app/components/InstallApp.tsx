'use client'

// Installing the site as an app. Android (and desktop Chrome/Edge) offer a real install prompt: the
// browser's `beforeinstallprompt` event is kept and replayed when the reader taps «تثبيت التطبيق».
// iOS has no prompt — Safari installs from Share → «إضافة إلى الشاشة الرئيسية» — so there the button
// opens those steps instead. Nothing is shown once the site runs as the installed app.
//
// <InstallApp /> (in the layout) registers the service worker, shows a small dismissible bar on
// phones, and holds the iOS steps sheet; <InstallButton /> is the same action for menus and links.
import { useEffect, useState, useSyncExternalStore } from 'react'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
type Mode = 'prompt' | 'ios' | 'none'

// One store for the whole page: the kept prompt, whether the iOS sheet is open
let deferred: InstallPromptEvent | null = null
let iosSheet = false
let installed = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as InstallPromptEvent; emit() })
  window.addEventListener('appinstalled', () => { deferred = null; installed = true; emit() })
}

const standalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)
const isIos = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1))

const snapshot = (): Mode => {
  if (installed || standalone()) return 'none'
  if (deferred) return 'prompt'
  return isIos() ? 'ios' : 'none'
}
const useMode = () => useSyncExternalStore(subscribe, snapshot, () => 'none' as Mode)
const useSheet = () => useSyncExternalStore(subscribe, () => iosSheet, () => false)

async function install() {
  if (deferred) {
    const e = deferred
    deferred = null
    emit()
    await e.prompt()
    await e.userChoice.catch(() => null)
  } else if (isIos()) {
    iosSheet = true
    emit()
  }
}
const closeSheet = () => { iosSheet = false; emit() }

/** «تثبيت التطبيق» — renders nothing where the site cannot be installed or already is */
export function InstallButton({ className, label = 'تثبيت التطبيق' }: { className?: string; label?: string }) {
  const mode = useMode()
  if (mode === 'none') return null
  return (
    <button type="button" onClick={install} className={className}>
      <DownloadIcon /> {label}
    </button>
  )
}

const DISMISS_KEY = 'install-bar-dismissed'
const DISMISS_DAYS = 30

export default function InstallApp() {
  const mode = useMode()
  const sheet = useSheet()
  const [bar, setBar] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  // The bar comes up after a few seconds, unless closed in the last 30 days
  useEffect(() => {
    if (mode === 'none') { setBar(false); return }
    let dismissed = 0
    try { dismissed = Number(localStorage.getItem(DISMISS_KEY)) || 0 } catch {}
    if (Date.now() - dismissed < DISMISS_DAYS * 864e5) return
    const t = setTimeout(() => setBar(true), 6000)
    return () => clearTimeout(t)
  }, [mode])

  const dismiss = () => {
    setBar(false)
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
  }

  return (
    <>
      {bar && mode !== 'none' && (
        <div
          role="dialog"
          aria-label="تثبيت التطبيق"
          className="min-[960px]:hidden fixed inset-x-3 z-[60] flex items-center gap-3 rounded-2xl bg-[#0F3D2E] text-[#F8F1E4] shadow-2xl border border-[#C9A96B]/40 p-3 font-sans"
          style={{ bottom: 'calc(12px + env(safe-area-inset-bottom))' }}
        >
          <img src="/icons/icon-192.png" alt="" width={44} height={44} className="rounded-xl shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold leading-snug">ثبّت الجامع على هاتفك</p>
            <p className="text-xs opacity-75 leading-snug">يفتح كتطبيق، من الشاشة الرئيسية</p>
          </div>
          <button type="button" onClick={() => { setBar(false); install() }}
            className="shrink-0 rounded-full bg-[#C9A96B] text-[#13261b] text-sm font-bold px-4 py-2">
            تثبيت
          </button>
          <button type="button" onClick={dismiss} aria-label="إغلاق" className="shrink-0 w-8 h-8 rounded-full text-[#F8F1E4]/70 hover:text-[#F8F1E4]">✕</button>
        </div>
      )}

      {sheet && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-3" onClick={closeSheet}>
          <div role="dialog" aria-label="تثبيت التطبيق على iPhone" onClick={e => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-surface text-ink shadow-2xl p-5 font-sans"
            style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="flex items-center gap-3 mb-4">
              <img src="/icons/icon-192.png" alt="" width={48} height={48} className="rounded-xl" />
              <div>
                <p className="font-bold text-green-900">تثبيت الجامع على iPhone وiPad</p>
                <p className="text-xs text-muted">من متصفح Safari</p>
              </div>
            </div>
            <ol className="space-y-3 text-sm">
              <li className="flex items-center gap-3">
                <Step n={1} />
                <span>اضغط زر المشاركة <ShareIcon /> في شريط المتصفح</span>
              </li>
              <li className="flex items-center gap-3">
                <Step n={2} />
                <span>اختر «إضافة إلى الشاشة الرئيسية» <AddIcon /></span>
              </li>
              <li className="flex items-center gap-3">
                <Step n={3} />
                <span>اضغط «إضافة» — يظهر الجامع بين تطبيقاتك</span>
              </li>
            </ol>
            <button type="button" onClick={closeSheet}
              className="mt-5 w-full rounded-full bg-[#0F3D2E] text-[#F8F1E4] font-bold py-2.5">
              حسنًا
            </button>
          </div>
        </div>
      )}
    </>
  )
}

const Step = ({ n }: { n: number }) => (
  <span className="shrink-0 w-7 h-7 rounded-full bg-[#C9A96B]/25 text-green-900 font-bold flex items-center justify-center">
    {n.toLocaleString('ar-EG')}
  </span>
)

const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="inline-block align-[-3px]">
    <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
  </svg>
)
const ShareIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0A84FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="مشاركة" className="inline-block align-[-3px] mx-0.5">
    <path d="M12 15V3M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
)
const AddIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="inline-block align-[-3px] mx-0.5">
    <rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8M8 12h8" />
  </svg>
)
