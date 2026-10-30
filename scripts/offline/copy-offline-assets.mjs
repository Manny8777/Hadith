// Copies the offline app's runtime files out of node_modules into public/offline/, so they are
// served as plain static files (outside the bundler, which can't follow their wasm/data URLs):
//   public/offline/pglite/  PGlite, PostgreSQL in WebAssembly (the device's copy of the database)
// Runs before `next dev` and `next build` (predev / prebuild in package.json).
import { cpSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const pub = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'offline')

rmSync(join(pub, 'sqlite'), { recursive: true, force: true }) // the first offline edition's engine

// PGlite: the core, its worker, the opfs-ahp file system, and the two extensions the site uses
const pglite = dirname(require.resolve('@electric-sql/pglite'))
const out = join(pub, 'pglite')
rmSync(out, { recursive: true, force: true })
const keep = f => !f.endsWith('.map') && !f.endsWith('.cjs') && !f.endsWith('.d.ts') && !f.endsWith('.d.cts') &&
  (!f.endsWith('.tar.gz') || f === 'pg_trgm.tar.gz' || f === 'unaccent.tar.gz')
cpSync(pglite, out, {
  recursive: true,
  filter: src => {
    const rel = src.slice(pglite.length + 1)
    if (!rel) return true
    if (rel.startsWith('contrib/')) return /^contrib\/(pg_trgm|unaccent)\.js$/.test(rel)
    return keep(rel)
  },
})
// The list the service worker caches for opening without a connection (public/sw.js)
const files = []
;(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else files.push('/offline/pglite/' + p.slice(out.length + 1).split('\\').join('/'))
  }
})(out)
writeFileSync(join(out, 'files.json'), JSON.stringify(files))
console.log('offline assets:', files.length, 'files in public/offline/pglite')
