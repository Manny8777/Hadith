'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/useLibrary'

export default function NewCollection() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="rounded-xl border-2 border-dashed border-border hover:border-green-600 text-green-800 p-5 text-sm sm:text-[1.2rem] font-semibold min-h-[7rem]">
        + مجموعة جديدة
      </button>
    )
  }
  return (
    <form className="ui-card rounded-xl p-4 space-y-2 text-sm sm:text-[1.15rem]" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setErr('')
      try {
        const { id } = await api<{ id: number }>('/api/library', 'POST', { title, description })
        router.push(`/library/${id}`)
      } catch (e) { setErr((e as Error).message); setBusy(false) }
    }}>
      <input autoFocus value={title} onChange={e => setTitle(e.target.value)} maxLength={160} required
        placeholder="عنوان المجموعة، مثل: أحاديث النية — بحث الماجستير"
        className="w-full rounded-lg border border-border bg-white px-3 py-2 focus:outline-none focus:border-green-600" />
      <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} rows={2}
        placeholder="وصف (اختياري): موضوع البحث، المنهج…"
        className="w-full rounded-lg border border-border bg-white px-3 py-2 focus:outline-none focus:border-green-600 resize-y" />
      <div className="flex gap-2 items-center">
        <button type="submit" disabled={busy || !title.trim()} className="rounded-lg bg-green-800 text-white px-4 py-2 disabled:opacity-50">إنشاء</button>
        <button type="button" onClick={() => setOpen(false)} className="text-gray-500 px-2">إلغاء</button>
        {err && <span className="text-red-600 text-xs">{err}</span>}
      </div>
    </form>
  )
}
