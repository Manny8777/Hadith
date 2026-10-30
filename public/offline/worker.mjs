// The offline database's worker (started by lib/offline/client.ts).
//
// Downloading: the database is published as gzip chunks plus manifest.json (built by
// scripts/offline/build_offline_db.py, served through /api/offline/files/…). Each chunk is first
// saved as-is into OPFS (the browser's private file system) under staging/, so an interrupted
// download picks up at the next missing chunk. Once every chunk is there they are decompressed, in
// order, into one SQLite file in SQLite's OPFS pool ("opfs-sahpool" VFS, which needs no special
// server headers); each staged chunk is deleted as soon as it has been copied, so the space needed
// stays close to the database's own size.
//
// Reading: { type: 'query', sql, params } → rows as objects. The database is opened read-only.
import sqlite3InitModule from '/offline/sqlite/index.mjs'

const DB_NAME = '/aljami.sqlite'
const STATE_FILE = 'offline-state.json'
const STAGING = 'staging'
const PARALLEL = 3

let sqlite3 = null
let pool = null
let db = null
let abort = null

const post = (msg) => self.postMessage(msg)

async function root() {
  return navigator.storage.getDirectory()
}

async function readState() {
  try {
    const fh = await (await root()).getFileHandle(STATE_FILE)
    return JSON.parse(await (await fh.getFile()).text())
  } catch {
    return null
  }
}

async function writeState(state) {
  const fh = await (await root()).getFileHandle(STATE_FILE, { create: true })
  const h = await fh.createSyncAccessHandle()
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(state))
    h.truncate(0)
    h.write(bytes, { at: 0 })
    h.flush()
  } finally {
    h.close()
  }
}

async function stagingDir(create = true) {
  return (await root()).getDirectoryHandle(STAGING, { create })
}

// One opening at a time: two calls racing here would each take the pool's files and lock each other out
let poolPromise = null
function getPool() {
  if (pool) return Promise.resolve(pool)
  poolPromise ??= openPool().finally(() => { poolPromise = null })
  return poolPromise
}

async function openPool() {
  if (!sqlite3) sqlite3 = await sqlite3InitModule()
  // The page before this one may still hold the files for a moment while it closes: wait for it
  for (let attempt = 1; ; attempt++) {
    try {
      pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'aljami-pool', initialCapacity: 4, forceReinitIfPreviouslyFailed: true })
      return pool
    } catch (e) {
      if (attempt >= 12) throw e
      await new Promise(r => setTimeout(r, 250 * attempt))
    }
  }
}

function closeDb() {
  if (db) {
    try { db.close() } catch {}
    db = null
  }
}

let dbPromise = null
function openDb() {
  if (db) return Promise.resolve(db)
  dbPromise ??= (async () => {
    const p = await getPool()
    if (!p.getFileNames().includes(DB_NAME)) throw new Error('not-downloaded')
    db = new p.OpfsSAHPoolDb(DB_NAME)
    db.exec('PRAGMA query_only = 1; PRAGMA cache_size = -16000;')
    return db
  })().finally(() => { dbPromise = null })
  return dbPromise
}

async function status() {
  const state = await readState()
  let staged = 0
  let stagedBytes = 0
  if (state?.manifest && !state.ready) {
    try {
      const dir = await stagingDir(false)
      for (const c of state.manifest.chunks) {
        try {
          const f = await (await dir.getFileHandle(c.name)).getFile()
          if (f.size === c.gzSize) { staged++; stagedBytes += f.size }
        } catch {}
      }
    } catch {}
  }
  let quota = null
  try { quota = await navigator.storage.estimate() } catch {}
  return {
    ready: !!state?.ready,
    version: state?.manifest?.version ?? null,
    manifest: state?.manifest ?? null,
    importedChunks: state?.importedChunks ?? 0,
    staged,
    stagedBytes,
    quota: quota ? { usage: quota.usage ?? 0, quota: quota.quota ?? 0 } : null,
  }
}

async function saveChunk(dir, chunk, base, signal, onBytes) {
  const res = await fetch(base + encodeURIComponent(chunk.name), { signal, cache: 'no-store' })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${chunk.name}`)
  // Written under its own name: a chunk cut short is shorter than gzSize and is fetched again
  const fh = await dir.getFileHandle(chunk.name, { create: true })
  const h = await fh.createSyncAccessHandle()
  let at = 0
  try {
    h.truncate(0)
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      h.write(value, { at })
      at += value.byteLength
      onBytes(value.byteLength)
    }
    h.flush()
  } finally {
    h.close()
  }
  if (at !== chunk.gzSize) {
    onBytes(-at)
    throw new Error(`${chunk.name}: got ${at} bytes, expected ${chunk.gzSize}`)
  }
}

async function download({ base }) {
  if (abort) return
  abort = new AbortController()
  const { signal } = abort
  try {
    const res = await fetch(base + 'manifest.json', { cache: 'no-store', signal })
    if (!res.ok) throw new Error(`manifest: HTTP ${res.status}`)
    const manifest = await res.json()

    let state = await readState()
    const dir = await stagingDir()
    if (!state || state.manifest?.version !== manifest.version || state.manifest?.sha256 !== manifest.sha256) {
      // A new edition (or a first download): start clean
      closeDb()
      const p = await getPool()
      if (p.getFileNames().includes(DB_NAME)) p.unlink(DB_NAME)
      for await (const name of dir.keys()) await dir.removeEntry(name).catch(() => {})
      state = { manifest, ready: false, importedChunks: 0 }
      await writeState(state)
    }
    if (state.ready) { post({ type: 'done', status: await status() }); return }

    // Ask the browser to keep the data (installed apps are normally granted this)
    let persisted = false
    try { persisted = await navigator.storage.persist() } catch {}

    // Room check. The staged chunks are deleted as the database is written, so at the end the
    // space used is about the database's own size; chunks already staged count as space in hand.
    try {
      const est = await navigator.storage.estimate()
      const { stagedBytes } = await status()
      const need = manifest.dbSize + 200e6 - stagedBytes
      const free = (est.quota ?? 0) - (est.usage ?? 0)
      if (est.quota && need > free) {
        post({ type: 'error', code: 'space', need, free, status: await status() })
        return
      }
    } catch {}

    // 1) Download the chunks not yet staged (the ones already imported are not needed again)
    const total = manifest.downloadSize
    let have = 0
    const todo = []
    for (const [i, c] of manifest.chunks.entries()) {
      if (i < state.importedChunks) { have += c.gzSize; continue }
      let ok = false
      try { ok = (await (await dir.getFileHandle(c.name)).getFile()).size === c.gzSize } catch {}
      if (ok) have += c.gzSize
      else todo.push(c)
    }
    let last = 0
    const report = (n) => {
      have += n
      const now = Date.now()
      if (now - last > 250) { last = now; post({ type: 'progress', phase: 'download', done: have, total, persisted }) }
    }
    report(0)
    let next = 0
    const workers = Array.from({ length: Math.min(PARALLEL, todo.length) }, async () => {
      while (next < todo.length) {
        const c = todo[next++]
        for (let attempt = 1; ; attempt++) {
          try {
            await saveChunk(dir, c, base, signal, report)
            break
          } catch (e) {
            if (signal.aborted || attempt >= 4) throw e
            await new Promise(r => setTimeout(r, 2000 * attempt))
          }
        }
      }
    })
    await Promise.all(workers)
    post({ type: 'progress', phase: 'download', done: total, total, persisted })

    // 2) Join the chunks into the database
    closeDb()
    const p = await getPool()
    const chunks = manifest.chunks
    let i = 0
    let written = 0
    let reader = null
    let lastReport = 0
    await p.importDb(DB_NAME, async () => {
      for (;;) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        if (!reader) {
          if (i >= chunks.length) return undefined
          const file = await (await dir.getFileHandle(chunks[i].name)).getFile()
          reader = file.stream().pipeThrough(new DecompressionStream('gzip')).getReader()
        }
        const { done, value } = await reader.read()
        if (done) {
          reader = null
          await dir.removeEntry(chunks[i].name).catch(() => {})
          i++
          continue
        }
        written += value.byteLength
        const now = Date.now()
        if (now - lastReport > 250) { lastReport = now; post({ type: 'progress', phase: 'import', done: written, total: manifest.dbSize, persisted }) }
        return value
      }
    })
    state = { manifest, ready: true, importedChunks: chunks.length, completedAt: new Date().toISOString() }
    await writeState(state)
    await (await root()).removeEntry(STAGING, { recursive: true }).catch(() => {})
    await openDb()
    post({ type: 'done', status: await status() })
  } catch (e) {
    if (signal.aborted || e?.name === 'AbortError') {
      // An interrupted import loses the chunks already copied: let the next run fetch them again
      post({ type: 'paused', status: await status() })
    } else {
      post({ type: 'error', code: 'failed', message: String(e?.message || e), status: await status() })
    }
  } finally {
    abort = null
  }
}

async function remove() {
  abort?.abort()
  closeDb()
  try {
    const p = await getPool()
    await p.wipeFiles()
  } catch {}
  const r = await root()
  await r.removeEntry(STAGING, { recursive: true }).catch(() => {})
  await r.removeEntry(STATE_FILE).catch(() => {})
}

self.onmessage = async (ev) => {
  const msg = ev.data
  try {
    switch (msg.type) {
      case 'status':
        post({ type: 'reply', id: msg.id, result: await status() })
        break
      case 'download':
        post({ type: 'reply', id: msg.id, result: true })
        await download(msg)
        break
      case 'pause':
        abort?.abort()
        post({ type: 'reply', id: msg.id, result: true })
        break
      case 'remove':
        await remove()
        post({ type: 'reply', id: msg.id, result: await status() })
        break
      case 'query': {
        const d = await openDb()
        const rows = d.exec({ sql: msg.sql, bind: msg.params ?? [], rowMode: 'object', returnValue: 'resultRows' })
        post({ type: 'reply', id: msg.id, result: rows })
        break
      }
      default:
        post({ type: 'reply', id: msg.id, error: 'unknown message ' + msg.type })
    }
  } catch (e) {
    post({ type: 'reply', id: msg.id, error: String(e?.message || e) })
  }
}
