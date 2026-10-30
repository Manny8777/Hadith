// The device's copy of the database: real PostgreSQL (PGlite) on the browser's private file system,
// in the directory public/offline/worker.mjs unpacked it into, run in this worker; pages talk to it
// through PGliteWorker (lib/offline/runtime/entry-browser.tsx).
import { PGlite } from '/offline/pglite/index.js'
import { worker } from '/offline/pglite/worker/index.js'
import { pg_trgm } from '/offline/pglite/contrib/pg_trgm.js'
import { unaccent } from '/offline/pglite/contrib/unaccent.js'

async function dataDir() {
  const fh = await (await navigator.storage.getDirectory()).getFileHandle('offline-state.json')
  const state = JSON.parse(await (await fh.getFile()).text())
  if (!state.ready || !state.dataDir || state.manifest?.engine !== 'pglite') throw new Error('not-downloaded')
  return state.dataDir
}

// The page before this one may still hold the database's files for a moment while it closes
// (only one open handle per file is allowed): wait until they are free
async function whenFree(dir) {
  const root = await navigator.storage.getDirectory()
  for (let attempt = 1; ; attempt++) {
    try {
      const fh = await (await root.getDirectoryHandle(dir)).getFileHandle('state.txt')
      const h = await fh.createSyncAccessHandle()
      h.close()
      return
    } catch (e) {
      if (e?.name !== 'NoModificationAllowedError' || attempt >= 40) return
      await new Promise(r => setTimeout(r, 250))
    }
  }
}

worker({
  async init() {
    const dir = await dataDir()
    await whenFree(dir)
    return PGlite.create({
      dataDir: 'opfs-ahp://' + dir,
      extensions: { pg_trgm, unaccent },
      // As node-pg returns them on the server: bigint and numeric as strings
      parsers: { 20: v => v, 1700: v => v },
      relaxedDurability: true,
    })
  },
})
