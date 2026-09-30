'use client'

import { useState } from 'react'

export default function LoginForm({ next, expired }: { next: string; expired: boolean }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [message, setMessage] = useState(expired ? 'انتهت صلاحية الرابط أو استُعمل من قبل؛ اطلب رابطًا جديدًا.' : '')
  const [devLink, setDevLink] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState('sending'); setMessage('')
    const res = await fetch('/api/auth/request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, next }),
    }).catch(() => null)
    const data = await res?.json().catch(() => ({})) ?? {}
    if (res?.ok && data.ok) { setState('sent'); setDevLink(data.devLink ?? null) }
    else { setState('error'); setMessage(data.error || 'تعذّر الإرسال، حاول بعد قليل') }
  }

  if (state === 'sent') {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900 leading-relaxed">
        أرسلنا رابط الدخول إلى <b dir="ltr">{email}</b>. افتح بريدك واضغط الرابط؛ وهو صالحٌ ربع ساعة ويُستعمل مرةً واحدة.
        {devLink && <p className="mt-2 text-xs">بيئة التطوير (لا خدمة بريد): <a href={devLink} className="underline break-all">{devLink}</a></p>}
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor="login-email" className="block text-sm font-medium text-gray-700">البريد الإلكتروني</label>
      <input id="login-email" type="email" required dir="ltr" autoComplete="email" value={email}
        onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
        className="w-full rounded-lg border border-border-warm bg-surface px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-700" />
      <button type="submit" disabled={state === 'sending'}
        className="w-full rounded-lg bg-green-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-900 disabled:opacity-60">
        {state === 'sending' ? 'جارٍ الإرسال…' : 'أرسل رابط الدخول'}
      </button>
      {message && <p className="text-sm text-red-700">{message}</p>}
    </form>
  )
}
