// Builds the offline database: the site's PostgreSQL database as a PGlite data directory (PostgreSQL
// compiled to WebAssembly, the same engine the app runs on the device), from the output of
// pgdump_to_sql.py. Then the indexes in offline-indexes.sql, which only the device needs (it has one
// slow core where the server has many), and fresh planner statistics.
//
//   node scripts/offline/build-pglite-db.mjs <pgdump_to_sql.py output> <new data dir>
//
// About 20 minutes; the data directory comes to about 5.5 GB.
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { unaccent } from '@electric-sql/pglite/contrib/unaccent'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const [src, dir] = process.argv.slice(2)
if (!src || !dir) { console.error('usage: build-pglite-db.mjs <sql dir> <data dir>'); process.exit(1) }
if (existsSync(join(dir, 'PG_VERSION'))) { console.error(`${dir} already holds a database`); process.exit(1) }
const here = dirname(fileURLToPath(import.meta.url))
const t0 = Date.now()
const secs = () => ((Date.now() - t0) / 1000).toFixed(0) + 's'
const statements = file => readFileSync(file, 'utf8').split(/;\s*\n/).filter(s => s.replace(/--[^\n]*/g, '').trim())

const db = await PGlite.create({ dataDir: dir, extensions: { pg_trgm, unaccent } })
console.log((await db.query('SELECT version()')).rows[0].version)
await db.exec(readFileSync(join(src, 'pre.sql'), 'utf8'))
console.log('schema', secs())

for (const f of JSON.parse(readFileSync(join(src, 'files.json'), 'utf8'))) {
  const blob = new Blob([readFileSync(join(src, 'data', f.file))])
  await db.query(`${f.copy} FROM '/dev/blob'`, [], { blob })
  process.stdout.write('.')
}
console.log('\ndata', secs())

let failed = 0
for (const stmt of [...statements(join(src, 'post.sql')), ...statements(join(here, 'offline-indexes.sql'))]) {
  const ts = Date.now()
  try { await db.exec(stmt) } catch (e) { failed++; console.log('FAILED', stmt.slice(0, 100).replace(/\s+/g, ' '), '—', e.message) }
  if (Date.now() - ts > 30000) console.log(`  ${((Date.now() - ts) / 1000).toFixed(0)}s`, stmt.slice(0, 90).replace(/\s+/g, ' '))
}
console.log('indexes', secs())
await db.exec('VACUUM ANALYZE')
await db.exec('CHECKPOINT')
console.log('done', secs(), failed ? `(${failed} failed)` : '')
await db.close()
process.exit(failed ? 1 : 0)
