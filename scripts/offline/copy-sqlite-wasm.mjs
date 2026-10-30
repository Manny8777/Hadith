// Copies SQLite's WebAssembly build into public/offline/sqlite/ so the offline worker
// (public/offline/worker.mjs) can load it as plain static files, outside the bundler.
// Runs before `next dev` and `next build` (predev / prebuild in package.json).
import { cpSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const dist = join(dirname(require.resolve('@sqlite.org/sqlite-wasm/package.json')), 'dist')
const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'offline', 'sqlite')
mkdirSync(out, { recursive: true })
for (const f of ['index.mjs', 'sqlite3.wasm']) cpSync(join(dist, f), join(out, f))
