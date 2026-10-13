'use client'
// Sign-in by email: we send a 6-digit code and a link. The code is typed here, in this same window —
// the way that works when this window is an AI assistant's connection window (the link would open in
// the default browser instead). The link is there for a reader on the site itself.
import { useState } from 'react'

export default function LoginForm({ next, expired }: { next: string; expired: boolean }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'checking' | 'error'>('idle')
  const [message, setMessage] = useState(expired ? 'انتهت صلاحية الرابط أو استُعمل من قبل؛ اطلب رمزًا جديدًا.' : '')
  const [dev, setDev] = useState<{ link?: string; code?: string } | null>(null)

  async function send(e?: React.FormEvent) {
    e?.preventDefault()
    setState('sending'); setMessage('')
    const res = await fetch('/api/auth/request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, next }),
    }).catch(() => null)
    const data = await res?.json().catch(() => ({})) ?? {}
    if (res?.ok && data.ok) { setState('sent'); setDev(data.devLink ? { link: data.devLink, code: data.devCode } : null) }
    else { setState('error'); setMessage(data.error || 'تعذّر الإرسال، حاول بعد قليل') }
  }

  async function check(e: React.FormEvent) {
    e.preventDefault()
    setState('checking'); setMessage('')
    const res = await fetch('/api/auth/code', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    }).catch(() => null)
    const data = await res?.json().catch(() => ({})) ?? {}
    if (res?.ok && data.ok) { window.location.href = data.next || '/library'; return }
    setState('sent'); setMessage(data.error || 'تعذّر التحقق، حاول مرة أخرى')
  }

  if (state === 'sent' || state === 'checking') {
    return (
      <form onSubmit={check} className="space-y-3">
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900 leading-relaxed">
          أرسلنا إلى <b dir="ltr">{email}</b> رمزًا من ٦ أرقام. <b>اكتبه هنا</b> — في هذه الصفحة نفسها.
          <span className="block text-xs text-green-800/80 mt-1">في الرسالة رابطٌ أيضًا، لكن إن كنت تربط الجامع بمساعدك الذكي فاكتب الرمز هنا؛ فالرابط يُفتح في متصفح آخر.</span>
        </div>
        <label htmlFor="login-code" className="block text-sm font-medium text-gray-700">رمز الدخول</label>
        <input id="login-code" inputMode="numeric" autoComplete="one-time-code" autoFocus required dir="ltr" maxLength={7}
          value={code} onChange={e => setCode(e.target.value)} placeholder="123456"
          className="w-full rounded-lg border border-border-warm bg-surface px-3 py-3 text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-green-700" />
        <button type="submit" disabled={state === 'checking'}
          className="w-full rounded-lg bg-green-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-900 disabled:opacity-60">
          {state === 'checking' ? 'جارٍ التحقق…' : 'دخول'}
        </button>
        {message && <p className="text-sm text-red-700">{message}</p>}
        <p className="text-xs text-gray-500">
          لم تصلك الرسالة؟ انظر في «الرسائل غير المرغوبة»، أو{' '}
          <button type="button" onClick={() => send()} className="text-green-700 underline">أرسل رمزًا جديدًا</button>
          {' '}أو <button type="button" onClick={() => { setState('idle'); setCode(''); setMessage('') }} className="text-green-700 underline">غيّر البريد</button>.
        </p>
        {dev && <p className="text-xs">بيئة التطوير (لا خدمة بريد): الرمز <b dir="ltr">{dev.code}</b> · <a href={dev.link} className="underline break-all">الرابط</a></p>}
      </form>
    )
  }

  return (
    <form onSubmit={send} className="space-y-3">
      <label htmlFor="login-email" className="block text-sm font-medium text-gray-700">البريد الإلكتروني</label>
      <input id="login-email" type="email" required dir="ltr" autoComplete="email" value={email}
        onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
        className="w-full rounded-lg border border-border-warm bg-surface px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-700" />
      <button type="submit" disabled={state === 'sending'}
        className="w-full rounded-lg bg-green-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-900 disabled:opacity-60">
        {state === 'sending' ? 'جارٍ الإرسال…' : 'أرسل رمز الدخول'}
      </button>
      {message && <p className="text-sm text-red-700">{message}</p>}
    </form>
  )
}
