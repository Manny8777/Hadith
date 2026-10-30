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
  if (!state.ready) throw new Error('not-downloaded')
  return state.dataDir
}

worker({
  async init() {
    return PGlite.create({
      dataDir: 'opfs-ahp://' + (await dataDir()),
      extensions: { pg_trgm, unaccent },
      // As node-pg returns them on the server: bigint and numeric as strings
      parsers: { 20: v => v, 1700: v => v },
      relaxedDurability: true,
    })
  },
})
