'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Token { id: number; name: string; created_at: string; last_used_at: string | null }

export default function TokenManager({ tokens }: { tokens: Token[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [fresh, setFresh] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const res = await fetch('/api/account/tokens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error || 'تعذّر الإنشاء'); return }
    setFresh(data.token); setName(''); router.refresh()
  }

  async function revoke(id: number) {
    if (!confirm('إلغاء هذا الرمز؟ ستتوقف أي أداة تستعمله.')) return
    await fetch(`/api/account/tokens?id=${id}`, { method: 'DELETE' })
    router.refresh()
  }

  const date = (s: string | null) => s ? new Date(s).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

  return (
    <div className="space-y-4">
      {fresh && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-900 mb-2">انسخ الرمز الآن؛ لن يُعرض مرةً أخرى:</p>
          <div className="flex items-center gap-2">
            <code dir="ltr" className="flex-1 min-w-0 break-all rounded bg-white border border-amber-200 px-2 py-1.5 text-xs">{fresh}</code>
            <button type="button" onClick={() => { navigator.clipboard.writeText(fresh); setCopied(true) }}
              className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white">{copied ? 'نُسخ' : 'نسخ'}</button>
          </div>
          <p className="mt-2 text-xs text-amber-900/80">مثال (Claude Code):</p>
          <code dir="ltr" className="block mt-1 break-all rounded bg-white border border-amber-200 px-2 py-1.5 text-xs">
            claude mcp add --transport http hadith https://hadith.dev/mcp --header &quot;Authorization: Bearer {fresh}&quot;
          </code>
        </div>
      )}

      <form onSubmit={create} className="flex gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="اسم الرمز (مثلًا: حاسوب المكتب)"
          className="flex-1 min-w-0 rounded-lg border border-border-warm bg-surface px-3 py-2 text-sm" />
        <button type="submit" className="shrink-0 rounded-lg bg-green-800 px-4 py-2 text-sm font-semibold text-white hover:bg-green-900">رمز جديد</button>
      </form>
      {error && <p className="text-sm text-red-700">{error}</p>}

      {tokens.length > 0 ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {tokens.map(t => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="font-medium text-gray-800 flex-1 min-w-0 truncate">{t.name}</span>
              <span className="text-xs text-gray-400">أُنشئ {date(t.created_at)} · آخر استعمال {date(t.last_used_at)}</span>
              <button type="button" onClick={() => revoke(t.id)} className="text-xs text-red-700 hover:underline">إلغاء</button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-gray-500">لا رموز بعد.</p>}
    </div>
  )
}
