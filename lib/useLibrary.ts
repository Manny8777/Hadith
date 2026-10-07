'use client'
// Client side of the research library: who is signed in (one request per page), and the saved state
// of items, batched — a page of 20 results makes one request, not 20.
import { useEffect, useState } from 'react'

export type Me = { email: string } | null

let mePromise: Promise<Me> | null = null
export function fetchMe(): Promise<Me> {
  mePromise ??= fetch('/api/auth/me').then(r => r.json()).then(d => d.user ?? null).catch(() => null)
  return mePromise
}
/** undefined while loading, null when signed out */
export function useMe(): Me | undefined {
  const [me, setMe] = useState<Me | undefined>(undefined)
  useEffect(() => { let on = true; fetchMe().then(m => { if (on) setMe(m) }); return () => { on = false } }, [])
  return me
}

type Saved = { n: number; noted: boolean }
const pending = new Map<string, Set<string>>()               // kind → refs waiting
const waiters = new Map<string, ((s: Saved) => void)[]>()   // kind:ref → callbacks
const cache = new Map<string, Saved>()
let timer: ReturnType<typeof setTimeout> | null = null

function flush() {
  timer = null
  for (const [kind, refs] of pending) {
    pending.delete(kind)
    const list = [...refs]
    fetch(`/api/library/state?kind=${kind}&refs=${encodeURIComponent(list.join(','))}`)
      .then(r => r.ok ? r.json() : { saved: {} })
      .then(d => {
        for (const ref of list) {
          const s: Saved = d.saved?.[ref] ?? { n: 0, noted: false }
          cache.set(`${kind}:${ref}`, s)
          for (const cb of waiters.get(`${kind}:${ref}`) ?? []) cb(s)
          waiters.delete(`${kind}:${ref}`)
        }
      }).catch(() => {})
  }
}

export function savedState(kind: string, ref: string): Promise<Saved> {
  const key = `${kind}:${ref}`
  const hit = cache.get(key)
  if (hit) return Promise.resolve(hit)
  return new Promise(resolve => {
    waiters.set(key, [...(waiters.get(key) ?? []), resolve])
    if (!pending.has(kind)) pending.set(kind, new Set())
    pending.get(kind)!.add(ref)
    timer ??= setTimeout(flush, 30)
  })
}
export const setSavedCache = (kind: string, ref: string, s: Saved) => cache.set(`${kind}:${ref}`, s)

export async function api<T = Record<string, unknown>>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'تعذّر الحفظ')
  return d as T
}
