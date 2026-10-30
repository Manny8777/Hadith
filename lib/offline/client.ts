'use client'

// The page side of the offline database: one worker (public/offline/worker.mjs) per page, and a
// small store the download screen, the progress pill and the offline reader all read from.
import { useSyncExternalStore } from 'react'

export const OFFLINE_FILES = '/api/offline/files/'

export interface OfflineManifest {
  version: string
  dbSize: number
  downloadSize: number
  chunks: { name: string; size: number; gzSize: number }[]
}

export interface OfflineStatus {
  ready: boolean
  version: string | null
  manifest: OfflineManifest | null
  staged: number
  stagedBytes: number
  quota: { usage: number; quota: number } | null
}

export type OfflinePhase = 'idle' | 'checking' | 'download' | 'import' | 'paused' | 'done' | 'error' | 'unsupported'

export interface OfflineState {
  phase: OfflinePhase
  status: OfflineStatus | null
  done: number
  total: number
  /** bytes per second over the last few seconds of the download */
  speed: number
  persisted: boolean
  error: { code: 'space' | 'failed' | 'busy'; message?: string; need?: number; free?: number } | null
}

let state: OfflineState = { phase: 'idle', status: null, done: 0, total: 0, speed: 0, persisted: false, error: null }
const listeners = new Set<() => void>()
const set = (patch: Partial<OfflineState>) => {
  state = { ...state, ...patch }
  listeners.forEach(l => l())
}

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
const samples: { t: number; b: number }[] = []

export function offlineSupported(): boolean {
  return typeof window !== 'undefined' &&
    'storage' in navigator && typeof navigator.storage.getDirectory === 'function' &&
    typeof Worker !== 'undefined' && typeof DecompressionStream !== 'undefined'
}

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker('/offline/worker.mjs', { type: 'module' })
  // Let go of the database files at once when leaving, so the next page can open them
  window.addEventListener('pagehide', e => { if (!e.persisted) { worker?.terminate(); worker = null } })
  worker.onmessage = (ev: MessageEvent) => {
    const m = ev.data
    if (m.type === 'reply') {
      const p = pending.get(m.id)
      pending.delete(m.id)
      if (!p) return
      if (m.error) p.reject(new Error(m.error))
      else p.resolve(m.result)
      return
    }
    if (m.type === 'progress') {
      const now = Date.now()
      if (m.phase === 'download') {
        samples.push({ t: now, b: m.done })
        while (samples.length > 2 && now - samples[0].t > 5000) samples.shift()
      }
      const first = samples[0]
      const speed = m.phase === 'download' && first && now > first.t ? ((m.done - first.b) * 1000) / (now - first.t) : 0
      set({ phase: m.phase, done: m.done, total: m.total, speed, persisted: m.persisted, error: null })
    } else if (m.type === 'done') {
      samples.length = 0
      set({ phase: 'done', status: m.status, error: null })
      notifyServiceWorker()
    } else if (m.type === 'paused') {
      samples.length = 0
      set({ phase: 'paused', status: m.status })
    } else if (m.type === 'error') {
      samples.length = 0
      const busy = /lock|NoModificationAllowed|InvalidState|access handle/i.test(m.message || '')
      set({
        phase: 'error',
        status: m.status ?? state.status,
        error: { code: busy ? 'busy' : m.code, message: m.message, need: m.need, free: m.free },
      })
    }
  }
  worker.onerror = () => set({ phase: 'error', error: { code: 'failed', message: 'worker failed to start' } })
  return worker
}

function call<T>(type: string, extra: Record<string, unknown> = {}): Promise<T> {
  const id = ++seq
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    getWorker().postMessage({ type, id, ...extra })
  })
}

/** Reads what is on the device. Safe to call often; only the first call starts the worker. */
export async function refreshOfflineStatus(): Promise<OfflineStatus | null> {
  if (!offlineSupported()) { set({ phase: 'unsupported' }); return null }
  if (state.phase === 'download' || state.phase === 'import') return state.status
  if (state.phase === 'idle') set({ phase: 'checking' })
  try {
    const status = await call<OfflineStatus>('status')
    set({
      status,
      phase: status.ready ? 'done' : state.phase === 'error' ? 'error' : status.staged > 0 ? 'paused' : 'idle',
    })
    return status
  } catch (e) {
    set({ phase: 'error', error: { code: 'busy', message: String((e as Error).message) } })
    return null
  }
}

export async function fetchOfflineManifest(): Promise<OfflineManifest | null> {
  try {
    const res = await fetch(OFFLINE_FILES + 'manifest.json', { cache: 'no-store' })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

export function startOfflineDownload() {
  if (state.phase === 'download' || state.phase === 'import') return
  samples.length = 0
  try { localStorage.setItem('offline-started', '1') } catch {}
  set({ phase: 'download', error: null })
  cacheOfflineShell()
  call('download', { base: OFFLINE_FILES }).catch(() => {})
}

export function pauseOfflineDownload() {
  call('pause').catch(() => {})
}

export async function removeOfflineData() {
  const status = await call<OfflineStatus>('remove')
  set({ phase: 'idle', status, done: 0, total: 0, error: null })
  notifyServiceWorker()
}

export function offlineQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return call<T[]>('query', { sql, params })
}

export function useOfflineState(): OfflineState {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => { listeners.delete(l) } },
    () => state,
    () => state,
  )
}

// The service worker keeps a copy of the offline reader (/offline and its scripts) so it can open
// without a connection, and needs to know whether the database is on the device.
function cacheOfflineShell() {
  navigator.serviceWorker?.controller?.postMessage({ type: 'cache-offline-shell' })
}
function notifyServiceWorker() {
  navigator.serviceWorker?.controller?.postMessage({ type: 'cache-offline-shell' })
  try { localStorage.setItem('offline-ready', state.status?.ready ? '1' : '') } catch {}
}

export const formatBytes = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} غيغابايت`
  if (n >= 1e6) return `${(n / 1e6).toLocaleString('ar-EG', { maximumFractionDigits: 0 })} ميغابايت`
  return `${Math.round(n / 1e3).toLocaleString('ar-EG')} كيلوبايت`
}
