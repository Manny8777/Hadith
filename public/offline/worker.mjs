// The offline download's worker (started by lib/offline/client.ts).
//
// The database is the site's own PostgreSQL database as a PGlite data directory, published as gzip
// chunks plus manifest.json (scripts/offline/pack-pglite.mjs, served through /api/offline/files/…).
// The manifest lists every file of the data directory in order; the chunks are those files' bytes,
// one after another. Chunks are fetched a few ahead into OPFS (the browser's private file system)
// under staging/, and unpacked in order straight into the layout PGlite's "opfs-ahp" file system
// reads: <dir>/data/<file> plus <dir>/state.txt, the file tree, written last. Each unpacked chunk is
// recorded, so an interrupted download picks up at the next one. The database itself is opened by
// public/offline/pg-worker.mjs.
const STATE_FILE = 'offline-state.json'
const STAGING = 'staging'
const PARALLEL = 3
const AHEAD = 6

let abort = null

const post = (msg) => self.postMessage(msg)
const root = () => navigator.storage.getDirectory()
const dataDirName = (version) => `aljami-pg-${version}`

async function readState() {
  try {
    const fh = await (await root()).getFileHandle(STATE_FILE)
    const state = JSON.parse(await (await fh.getFile()).text())
    // A copy from the earlier offline reader (SQLite, no data directory) counts as nothing: the
    // download replaces it, removing its files
    return state?.manifest?.engine === 'pglite' && state.dataDir ? state : null
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

async function stagedSize(dir, chunk) {
  try { return (await (await dir.getFileHandle(chunk.name)).getFile()).size } catch { return -1 }
}

async function status() {
  const state = await readState()
  let staged = 0
  let stagedBytes = 0
  if (state?.manifest && !state.ready) {
    staged = state.importedChunks ?? 0
    stagedBytes = state.manifest.chunks.slice(0, staged).reduce((s, c) => s + c.gzSize, 0)
  }
  let quota = null
  try { quota = await navigator.storage.estimate() } catch {}
  return {
    ready: !!state?.ready,
    version: state?.manifest?.version ?? null,
    dataDir: state?.ready ? state.dataDir : null,
    manifest: state?.manifest ? { ...state.manifest, entries: undefined } : null,
    importedChunks: state?.importedChunks ?? 0,
    staged,
    stagedBytes,
    quota: quota ? { usage: quota.usage ?? 0, quota: quota.quota ?? 0 } : null,
  }
}

async function saveChunk(dir, chunk, base, signal, onBytes) {
  const res = await fetch(base + encodeURIComponent(chunk.name), { signal, cache: 'no-store' })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${chunk.name}`)
  // Written under a temporary name and renamed when complete, so the importer never reads half a chunk
  const fh = await dir.getFileHandle(chunk.name + '.part', { create: true })
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
  await fh.move(chunk.name)
}

// Where chunk i starts: which file of the data directory, and how far into it
function chunkStart(manifest, files, i) {
  let raw = 0
  for (let k = 0; k < i; k++) raw += manifest.chunks[k].size
  let f = 0
  while (f < files.length && raw >= files[f].size) { raw -= files[f].size; f++ }
  return { f, at: raw }
}

// The file tree PGlite's opfs-ahp file system keeps in state.txt
function ahpState(entries) {
  const now = Date.now()
  const root = { type: 'directory', lastModified: now, mode: 0o40700, children: {} }
  let n = 0
  for (const e of entries) {
    const parts = e.path.split('/').filter(Boolean)
    let dir = root
    for (const p of parts.slice(0, -1)) dir = dir.children[p]
    const name = parts[parts.length - 1]
    dir.children[name] = e.dir
      // Fixed modes: PostgreSQL needs to enter its folders and read its files, whatever the manifest says
      ? { type: 'directory', lastModified: now, mode: 0o40700, children: {} }
      : { type: 'file', lastModified: now, mode: 0o100600, backingFilename: `f${(n++).toString(36)}` }
  }
  return { root, pool: [] }
}

async function download({ base }) {
  if (abort) return
  abort = new AbortController()
  const { signal } = abort
  try {
    const res = await fetch(base + 'manifest.json', { cache: 'no-store', signal })
    if (!res.ok) throw new Error(`manifest: HTTP ${res.status}`)
    const manifest = await res.json()
    if (manifest.engine !== 'pglite') throw new Error('manifest: unsupported edition')

    const r = await root()
    let state = await readState()
    if (!state || state.manifest?.version !== manifest.version || state.manifest?.sha256 !== manifest.sha256) {
      // A new edition (or a first download): start clean, removing any earlier edition
      for await (const name of r.keys()) await r.removeEntry(name, { recursive: true }).catch(() => {})
      state = { manifest, ready: false, importedChunks: 0, dataDir: dataDirName(manifest.version) }
      await writeState(state)
    }
    if (state.ready) { post({ type: 'done', status: await status() }); return }

    // Ask the browser to keep the data (installed apps are normally granted this)
    let persisted = false
    try { persisted = await navigator.storage.persist() } catch {}

    const chunks = manifest.chunks
    const files = manifest.entries.filter(e => !e.dir)
    const written = chunks.slice(0, state.importedChunks).reduce((s, c) => s + c.size, 0)

    // Room check: what is left to unpack, plus the chunks waiting their turn
    try {
      const est = await navigator.storage.estimate()
      const need = manifest.dbSize - written + AHEAD * 30e6 + 200e6
      const free = (est.quota ?? 0) - (est.usage ?? 0)
      if (est.quota && need > free) {
        post({ type: 'error', code: 'space', need, free, status: await status() })
        return
      }
    } catch {}

    const dbDir = await r.getDirectoryHandle(state.dataDir, { create: true })
    const dataAh = await dbDir.getDirectoryHandle('data', { create: true })
    const staging = await r.getDirectoryHandle(STAGING, { create: true })

    // 1) Fetch chunks, a few ahead of the unpacking
    const total = manifest.downloadSize
    let have = chunks.slice(0, state.importedChunks).reduce((s, c) => s + c.gzSize, 0)
    const fetched = new Map() // chunk index → promise, settled when the chunk is staged
    let lastReport = 0
    let phase = 'download'
    let unpacked = written
    const report = (n) => {
      have += n
      const now = Date.now()
      if (now - lastReport > 250) {
        lastReport = now
        post(phase === 'download'
          ? { type: 'progress', phase, done: have, total, persisted }
          : { type: 'progress', phase, done: unpacked, total: manifest.dbSize, persisted })
      }
    }
    let next = state.importedChunks
    let slots = PARALLEL
    const waiters = []
    const fetchChunk = async (i) => {
      const c = chunks[i]
      if (await stagedSize(staging, c) === c.gzSize) { report(c.gzSize); return }
      for (let attempt = 1; ; attempt++) {
        try { await saveChunk(staging, c, base, signal, report); return }
        catch (e) {
          if (signal.aborted || attempt >= 4) throw e
          await new Promise(r => setTimeout(r, 2000 * attempt))
        }
      }
    }
    // Starts fetches while there are free slots and the unpacking is not too far behind
    let importing = state.importedChunks
    const pump = () => {
      while (slots > 0 && next < chunks.length && next < importing + AHEAD) {
        const i = next++
        slots--
        const p = fetchChunk(i).finally(() => { slots++; pump() })
        p.catch(() => {})
        fetched.set(i, p)
      }
    }
    pump()

    // 2) Unpack each chunk, in order, into the data directory's files
    let { f, at } = chunkStart(manifest, files, state.importedChunks)
    let h = null
    const openFile = async () => {
      const fh = await dataAh.getFileHandle(`f${f.toString(36)}`, { create: true })
      h = await fh.createSyncAccessHandle()
      if (at === 0) h.truncate(0)
    }
    const closeFile = () => { if (h) { h.flush(); h.close(); h = null } }
    try {
      for (let i = state.importedChunks; i < chunks.length; i++) {
        importing = i
        pump()
        await fetched.get(i)
        fetched.delete(i)
        const file = await (await staging.getFileHandle(chunks[i].name)).getFile()
        const reader = file.stream().pipeThrough(new DecompressionStream('gzip')).getReader()
        let got = 0
        for (;;) {
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
          const { done, value } = await reader.read()
          if (done) break
          got += value.byteLength
          let off = 0
          while (off < value.byteLength) {
            while (f < files.length && at >= files[f].size) { closeFile(); f++; at = 0 }
            if (f >= files.length) throw new Error(`${chunks[i].name}: more data than the manifest lists`)
            if (!h) await openFile()
            const n = Math.min(value.byteLength - off, files[f].size - at)
            h.write(value.subarray(off, off + n), { at })
            at += n
            off += n
            unpacked += n
          }
          report(0)
        }
        if (got !== chunks[i].size) throw new Error(`${chunks[i].name}: unpacked ${got} bytes, expected ${chunks[i].size}`)
        h?.flush()
        state = { ...state, importedChunks: i + 1 }
        await writeState(state)
        await staging.removeEntry(chunks[i].name).catch(() => {})
        if (i + 1 >= next && next >= chunks.length) phase = 'import'
      }
    } finally {
      closeFile()
    }

    // 3) Empty files, then the file tree: from here PGlite can open the directory
    for (const [k, e] of files.entries()) if (e.size === 0) await dataAh.getFileHandle(`f${k.toString(36)}`, { create: true })
    const sfh = await dbDir.getFileHandle('state.txt', { create: true })
    const sh = await sfh.createSyncAccessHandle()
    try {
      sh.truncate(0)
      sh.write(new TextEncoder().encode(JSON.stringify(ahpState(manifest.entries))), { at: 0 })
      sh.flush()
    } finally {
      sh.close()
    }
    state = { ...state, ready: true, completedAt: new Date().toISOString() }
    await writeState(state)
    await r.removeEntry(STAGING, { recursive: true }).catch(() => {})
    post({ type: 'done', status: await status() })
  } catch (e) {
    const paused = signal.aborted || e?.name === 'AbortError'
    abort.abort() // stops the fetches still running
    if (paused) {
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
  const r = await root()
  for await (const name of r.keys()) await r.removeEntry(name, { recursive: true }).catch(() => {})
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
      default:
        post({ type: 'reply', id: msg.id, error: 'unknown message ' + msg.type })
    }
  } catch (e) {
    post({ type: 'reply', id: msg.id, error: String(e?.message || e) })
  }
}
