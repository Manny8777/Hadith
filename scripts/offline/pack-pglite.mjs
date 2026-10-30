// Packs a PGlite data directory (built by build-pglite-db.mjs) for download: every file and folder
// of the data directory, one after another, cut into independent gzip chunks of about 27 MB, and a
// manifest listing the entries in order. The app (public/offline/worker.mjs) streams the chunks back
// into the layout PGlite's OPFS file system reads ("opfs-ahp": state.txt + data/<file>).
//
//   node scripts/offline/pack-pglite.mjs <pgdata dir> <out dir> <version>
import { PGlite } from '@electric-sql/pglite'
import { createReadStream, mkdirSync, readdirSync, rmSync, statSync, writeFileSync, createWriteStream } from 'node:fs'
import { join, relative } from 'node:path'
import { createGzip } from 'node:zlib'
import { createHash } from 'node:crypto'

const [src, out, version] = process.argv.slice(2)
if (!src || !out || !version) { console.error('usage: pack-pglite.mjs <pgdata> <out> <version>'); process.exit(1) }
mkdirSync(out, { recursive: true })

// A clean shutdown first, and only the write-ahead log segments from the last checkpoint to the
// current one: the others, older ones and ones set aside for reuse, are 16 MB each the database
// will not read (it makes new ones as it needs them)
{
  const db = await PGlite.create({ dataDir: src })
  await db.exec('CHECKPOINT')
  const { redo, cur } = (await db.query('SELECT pg_walfile_name(redo_lsn) AS redo, pg_walfile_name(pg_current_wal_insert_lsn()) AS cur FROM pg_control_checkpoint()')).rows[0]
  await db.close()
  for (const f of readdirSync(join(src, 'pg_wal'))) if (/^[0-9A-F]{24}$/.test(f) && (f < redo || f > cur)) rmSync(join(src, 'pg_wal', f))
}

const SKIP = /^(postmaster\.pid|postmaster\.opts|\.s\.PGSQL.*)$/
const entries = []
;(function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    if (SKIP.test(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    const path = '/' + relative(src, p).split('\\').join('/')
    // Modes as PostgreSQL wants them, whatever the build machine had (Windows reports no execute bit)
    if (st.isDirectory()) { entries.push({ path, dir: true, mode: 0o40700 }); walk(p) }
    else entries.push({ path, size: st.size, mode: 0o100600 })
  }
})(src)

const TARGET = 27_000_000
const chunks = []
let gz = null, outFile = null, written = 0, raw = 0
const sha = createHash('sha256')

function openChunk() {
  const name = `aljami-pg-${version}.part${String(chunks.length).padStart(3, '0')}.gz`
  outFile = createWriteStream(join(out, name))
  gz = createGzip({ level: 6 })
  gz.pipe(outFile)
  written = 0
  gz.on('data', b => { written += b.length })
  chunks.push({ name, size: 0, gzSize: 0 })
}
async function closeChunk() {
  const c = chunks[chunks.length - 1]
  await new Promise(r => { outFile.on('close', r); gz.end() })
  c.size = raw - chunks.slice(0, -1).reduce((s, x) => s + x.size, 0)
  c.gzSize = statSync(join(out, c.name)).size
  gz = null
}
async function write(buf) {
  if (!gz) openChunk()
  sha.update(buf)
  raw += buf.length
  if (!gz.write(buf)) await new Promise(r => gz.once('drain', r))
  if (written >= TARGET - 2_000_000) await closeChunk()
}

for (const e of entries) {
  if (e.dir || !e.size) continue
  for await (const buf of createReadStream(join(src, e.path), { highWaterMark: 1 << 20 })) await write(buf)
}
if (gz) await closeChunk()

const manifest = {
  version, format: 2, engine: 'pglite', pglite: '0.5.13',
  dbSize: raw, sha256: sha.digest('hex'),
  downloadSize: chunks.reduce((s, c) => s + c.gzSize, 0),
  entries, chunks,
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest))
console.log(`${entries.length} entries, ${(raw / 1e9).toFixed(2)} GB, ${chunks.length} chunks, ${(manifest.downloadSize / 1e9).toFixed(2)} GB to download`)
