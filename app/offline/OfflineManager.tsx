'use client'

// «الجامع دون إنترنت»: the download screen. One button fetches the whole encyclopedia (every book,
// commentary, narrator biography, isnad and the Quran) onto the device; the bar shows the download
// and then the unpacking, and a cut connection resumes from the last finished part.
import { useEffect, useState } from 'react'
import {
  fetchOfflineManifest, formatBytes, offlineSupported, pauseOfflineDownload, refreshOfflineStatus,
  removeOfflineData, startOfflineDownload, useOfflineState, type OfflineManifest,
} from '@/lib/offline/client'

const pct = (done: number, total: number) => (total > 0 ? Math.min(100, Math.floor((done / total) * 100)) : 0)
const ar = (n: number) => n.toLocaleString('ar-EG')

function eta(seconds: number) {
  if (!isFinite(seconds) || seconds <= 0) return ''
  if (seconds < 90) return 'أقل من دقيقتين'
  const m = Math.round(seconds / 60)
  if (m < 60) return `نحو ${ar(m)} دقيقة`
  const h = Math.floor(m / 60)
  return `نحو ${ar(h)} ساعة${m % 60 >= 10 ? ` و${ar(m % 60)} دقيقة` : ''}`
}

export default function OfflineManager({ compact = false }: { compact?: boolean }) {
  const s = useOfflineState()
  const [manifest, setManifest] = useState<OfflineManifest | null>(null)
  const [online, setOnline] = useState(true)
  const [confirmRemove, setConfirmRemove] = useState(false)

  useEffect(() => {
    refreshOfflineStatus()
    setOnline(navigator.onLine)
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    if (navigator.onLine) fetchOfflineManifest().then(setManifest)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  if (s.phase === 'unsupported' || (typeof window !== 'undefined' && !offlineSupported())) {
    return (
      <Card>
        <p className="font-bold text-green-900">هذا المتصفح لا يدعم العمل دون إنترنت</p>
        <p className="text-sm text-muted mt-1">جرّب Chrome أو Edge أو Safari بإصدار حديث، وثبّت الجامع كتطبيق.</p>
      </Card>
    )
  }

  const m = manifest ?? s.status?.manifest ?? null
  const ready = s.status?.ready
  const update = ready && manifest && s.status?.manifest && (manifest.version !== s.status.version || manifest.sha256 !== s.status.manifest.sha256)
  const busy = s.phase === 'download' || s.phase === 'import'
  const remaining = s.phase === 'download' && s.speed > 0 ? (s.total - s.done) / s.speed : NaN

  return (
    <Card>
      {ready && !busy ? (
        <>
          <div className="flex items-center gap-3">
            <Check />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-green-900">الجامع محفوظ على جهازك</p>
              <p className="text-sm text-muted">
                يعمل الموقع كله دون إنترنت بكل صفحاته وأدواته، عدا تسجيل الدخول والمكتبة الشخصية.
                {s.status?.version && <> إصدار البيانات {s.status.version}.</>}
              </p>
            </div>
          </div>
          {update && (
            <div className="mt-3 rounded-xl bg-primary-soft p-3 text-sm">
              <p className="font-bold text-green-900">إصدار أحدث من البيانات متاح ({manifest!.version})</p>
              <button type="button" onClick={startOfflineDownload} className={btn + ' mt-2'}>
                تحديث ({formatBytes(manifest!.downloadSize)})
              </button>
            </div>
          )}
          {!compact && (
            <div className="mt-4 flex flex-wrap gap-2 items-center">
              {!confirmRemove ? (
                <button type="button" onClick={() => setConfirmRemove(true)} className="text-sm text-muted underline underline-offset-2">
                  حذف البيانات من الجهاز
                </button>
              ) : (
                <>
                  <span className="text-sm">حذف {m ? formatBytes(m.dbSize) : 'البيانات'} من الجهاز؟</span>
                  <button type="button" onClick={() => { setConfirmRemove(false); removeOfflineData() }} className="text-sm font-bold text-red-700 underline">حذف</button>
                  <button type="button" onClick={() => setConfirmRemove(false)} className="text-sm underline">إلغاء</button>
                </>
              )}
            </div>
          )}
        </>
      ) : busy ? (
        <>
          <Steps at={s.phase === 'download' ? 0 : 1} />
          <p className="font-bold text-green-900 mt-3">
            {s.phase === 'download' ? 'جارٍ تحميل الجامع…' : 'جارٍ تجهيز البيانات على الجهاز…'}
          </p>
          <div className="mt-3 h-3 rounded-full bg-surface-sunken overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct(s.done, s.total)}>
            <div className="h-full ml-auto bg-primary transition-[width] duration-300" style={{ width: `${pct(s.done, s.total)}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-x-4 text-sm text-muted">
            <span>{ar(pct(s.done, s.total))}٪ — {formatBytes(s.done)} من {formatBytes(s.total)}</span>
            {s.phase === 'download' && s.speed > 0 && <span>{formatBytes(s.speed)}/ث · {eta(remaining)}</span>}
            {s.phase === 'import' && <span>الخطوة الأخيرة، لا تُغلق التطبيق</span>}
          </div>
          <p className="text-xs text-muted mt-3">أبقِ الصفحة مفتوحة. إن انقطع الاتصال يكمل من حيث توقّف.</p>
          {s.phase === 'download' && (
            <button type="button" onClick={pauseOfflineDownload} className={btnOutline + ' mt-3'}>إيقاف مؤقت</button>
          )}
        </>
      ) : (
        <>
          <p className="font-bold text-green-900">استخدم الجامع دون إنترنت</p>
          <p className="text-sm text-muted mt-1">الموقع كله بكل صفحاته وأدواته على جهازك، يعمل بلا اتصال.</p>
          <ol className="mt-3 space-y-1.5 text-sm">
            <li><b>١.</b> اضغط «تحميل»{m && <> ({formatBytes(m.downloadSize)}، ويُفضَّل عبر Wi-Fi)</>}.</li>
            <li><b>٢.</b> أبقِ الصفحة مفتوحة حتى يكتمل الشريط. إن انقطع الاتصال يكمل من حيث توقّف.</li>
            <li><b>٣.</b> افتح الجامع متى شئت، ولو دون إنترنت.</li>
          </ol>
          {s.phase === 'paused' && s.status && s.status.staged > 0 && (
            <p className="text-sm mt-2">تمّ تحميل {formatBytes(s.status.stagedBytes)} من قبل، ويكمل التحميل من حيث توقّف.</p>
          )}
          {s.error && (
            <p className="text-sm mt-2 text-red-700">
              {s.error.code === 'space'
                ? `لا توجد مساحة كافية على الجهاز: يلزم نحو ${formatBytes(s.error.need ?? 0)}، والمتاح ${formatBytes(Math.max(0, s.error.free ?? 0))}.`
                : s.error.code === 'busy'
                  ? 'البيانات مفتوحة في نافذة أخرى من الجامع. أغلق النوافذ الأخرى ثم أعد المحاولة.'
                  : `تعذّر التحميل${online ? '' : ' (لا يوجد اتصال)'}. أعد المحاولة، وسيكمل من حيث توقّف.`}
            </p>
          )}
          <button type="button" onClick={startOfflineDownload} disabled={!online || (!m && !s.status?.manifest)}
            className={btn + ' mt-3 disabled:opacity-50'}>
            <DownloadIcon /> {s.phase === 'paused' || s.status?.staged ? 'متابعة التحميل' : 'تحميل للعمل دون إنترنت'}
          </button>
          {!online && <p className="text-xs text-muted mt-2">يلزم اتصال بالإنترنت للتحميل.</p>}
          {online && !m && s.phase !== 'checking' && <p className="text-xs text-muted mt-2">بيانات التحميل غير متاحة الآن.</p>}
        </>
      )}
    </Card>
  )
}

const btn = 'inline-flex items-center gap-2 rounded-full bg-primary text-on-dark font-bold px-5 py-2.5 text-sm'
const btnOutline = 'inline-flex items-center gap-2 rounded-full border border-primary text-primary font-bold px-4 py-2 text-sm'

// Where the download is: تحميل → تجهيز → جاهز
const Steps = ({ at }: { at: number }) => (
  <ol className="flex items-center gap-2 text-xs font-bold" aria-label="مراحل التحميل">
    {['تحميل', 'تجهيز', 'جاهز'].map((label, i) => (
      <li key={label} className="flex items-center gap-2" aria-current={i === at ? 'step' : undefined}>
        {i > 0 && <span className={'w-6 h-px ' + (i <= at ? 'bg-primary' : 'bg-border')} />}
        <span className={'w-6 h-6 rounded-full flex items-center justify-center ' + (i < at ? 'bg-primary text-on-dark' : i === at ? 'border-2 border-primary text-primary' : 'border border-border text-muted')}>
          {i < at ? '✓' : ar(i + 1)}
        </span>
        <span className={i === at ? 'text-green-900' : 'text-muted'}>{label}</span>
      </li>
    ))}
  </ol>
)

const Card = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5 font-sans shadow-sm">{children}</div>
)

const Check = () => (
  <span className="shrink-0 w-10 h-10 rounded-full bg-primary text-on-dark flex items-center justify-center" aria-hidden="true">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
  </span>
)

const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
  </svg>
)
