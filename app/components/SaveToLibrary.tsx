'use client'
// «☆ حفظ»: put a hadith, narrator, search or comparison into one or more of the reader's collections
// (signed in), or — signed out, for a hadith — keep it in this browser as before, with a word that
// signing in keeps it across devices.
import { useEffect, useRef, useState } from 'react'
import Link from '@/app/components/Link'
import { api, savedState, setSavedCache, useMe } from '@/lib/useLibrary'

const LOCAL_KEY = 'hadith_collection'
const localGet = (): number[] => { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]') } catch { return [] } }
const localSet = (ids: number[]) => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(ids)) } catch {} }

interface Props {
  kind: 'hadith' | 'narrator' | 'search' | 'compare'
  itemRef: string
  label?: string
  className?: string
}
type Col = { id: number; title: string; has: boolean }

const BTN = 'text-xs font-sans px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap'
const ON = 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
const OFF = 'bg-white text-gray-600 border-gray-200 hover:border-green-300 hover:text-green-800'

export default function SaveToLibrary({ kind, itemRef, label, className = '' }: Props) {
  const me = useMe()
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [cols, setCols] = useState<Col[] | null>(null)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [localSaved, setLocalSaved] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (me) savedState(kind, itemRef).then(s => setCount(s.n))
    else if (me === null && kind === 'hadith') setLocalSaved(localGet().includes(Number(itemRef)))
  }, [me, kind, itemRef])

  // close on a click outside
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [open])

  if (me === undefined) return null

  if (me === null) {
    if (kind !== 'hadith') {
      return <Link href={`/login?next=${encodeURIComponent(typeof location === 'undefined' ? '/' : location.pathname + location.search)}`} className={`${BTN} ${OFF} ${className}`} title="سجّل الدخول لتحفظ في مكتبتك">☆ حفظ</Link>
    }
    const toggle = () => {
      const ids = localGet(), id = Number(itemRef)
      const next = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
      localSet(next); setLocalSaved(next.includes(id))
    }
    return (
      <button type="button" onClick={toggle} className={`${BTN} ${localSaved ? ON : OFF} ${className}`}
        title={localSaved ? 'محفوظ في هذا المتصفح — سجّل الدخول ليُحفظ في حسابك ومجموعاتك' : 'حفظ في هذا المتصفح (سجّل الدخول لتنظيمها في مجموعات)'}>
        {localSaved ? '★ محفوظ' : '☆ حفظ'}
      </button>
    )
  }

  async function load() {
    const s = await api<{ collections: Col[] }>(`/api/library/state?kind=${kind}&ref=${encodeURIComponent(itemRef)}`)
    setCols(s.collections)
  }
  async function toggleIn(c: Col) {
    setBusy(true); setErr('')
    try {
      if (c.has) await api(`/api/library/collections/${c.id}/items?kind=${kind}&ref=${encodeURIComponent(itemRef)}`, 'DELETE')
      else await api(`/api/library/collections/${c.id}/items`, 'POST', { kind, ref: itemRef, label })
      const next = (cols ?? []).map(x => x.id === c.id ? { ...x, has: !x.has } : x)
      setCols(next)
      const n = next.filter(x => x.has).length
      setCount(n); setSavedCache(kind, itemRef, { n, noted: false })
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  async function createAndAdd() {
    if (!title.trim()) return
    setBusy(true); setErr('')
    try {
      const { id } = await api<{ id: number }>('/api/library', 'POST', { title })
      await api(`/api/library/collections/${id}/items`, 'POST', { kind, ref: itemRef, label })
      setTitle('')
      await load()
      setCount(c => c + 1)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div ref={box} className={`relative inline-block ${className}`}>
      <button type="button" onClick={() => { const o = !open; setOpen(o); if (o) load() }}
        className={`${BTN} ${count ? ON : OFF}`} aria-expanded={open}
        title={count ? `في ${count} من مجموعاتك` : 'حفظ في مكتبتك'}>
        {count ? `★ محفوظ${count > 1 ? ` (${count})` : ''}` : '☆ حفظ'}
      </button>
      {open && (
        <div className="absolute z-40 mt-1 end-0 w-72 sm:w-96 max-w-[85vw] rounded-xl border border-border bg-surface shadow-xl p-3 font-sans text-sm sm:text-[1.2rem]" dir="rtl">
          <p className="text-xs sm:text-[1.05rem] font-bold text-gray-500 mb-2">احفظ في مجموعة</p>
          {cols === null ? <p className="text-xs text-gray-400 py-2">…</p> : (
            <div className="max-h-56 overflow-y-auto space-y-0.5 mb-2">
              {cols.length === 0 && <p className="text-xs text-gray-400 py-1">لا مجموعات بعد — أنشئ أولاها:</p>}
              {cols.map(c => (
                <label key={c.id} className="flex items-center gap-2 px-1.5 py-1.5 rounded hover:bg-surface-sunken/60 cursor-pointer">
                  <input type="checkbox" checked={c.has} disabled={busy} onChange={() => toggleIn(c)} className="accent-green-700" />
                  <span className="truncate">{c.title}</span>
                </label>
              ))}
            </div>
          )}
          <form onSubmit={e => { e.preventDefault(); createAndAdd() }} className="flex gap-1.5">
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="مجموعة جديدة…" maxLength={160}
              className="flex-1 min-w-0 rounded-lg border border-border bg-white px-2 py-1.5 text-sm sm:text-[1.15rem] focus:outline-none focus:border-green-600" />
            <button type="submit" disabled={busy || !title.trim()} className="rounded-lg bg-green-800 text-white px-3 text-xs sm:text-[1.05rem] disabled:opacity-40">إضافة</button>
          </form>
          {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
          <Link href="/library" className="block text-xs sm:text-[1.05rem] text-green-700 hover:underline mt-2">مكتبتي ←</Link>
        </div>
      )}
    </div>
  )
}
