'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function UnlockForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const res = await fetch('/api/admin/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }).catch(() => null)
    const data = await res?.json().catch(() => ({})) ?? {}
    setBusy(false)
    if (res?.ok) { setPassword(''); router.refresh() } else setError(data.error || 'تعذّر الفتح')
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor="admin-pass" className="block text-sm font-medium text-gray-700">كلمة المرور</label>
      <input id="admin-pass" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} dir="ltr"
        className="w-full rounded-lg border border-border-warm bg-surface px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-700" />
      <button type="submit" disabled={busy} className="w-full rounded-lg bg-green-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-900 disabled:opacity-60">
        {busy ? '…' : 'فتح الإحصاءات'}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  )
}
