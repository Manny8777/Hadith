// db/load_generic.js — load a JSONL(.gz) file into a table, idempotently.
//
//   node db/load_generic.js <table> <file.jsonl[.gz]> [--dry-run] [--batch 5000]
//
// Columns are taken from the file's first record, so the exporter's JSON keys must match the table's
// column names. Rows that already exist are left untouched (bare ON CONFLICT DO NOTHING), which makes
// re-running safe and lets a partially migrated table simply gain the rows it was missing.
//
// Used with legacy-audit/harness/export_missing.py to close the legacy↔web data gaps.

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const readline = require('readline')
const { Pool } = require('pg')

function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
  const m = env.match(/^\s*DATABASE_URL\s*=\s*"?([^"\r\n]+)"?\s*$/m)
  if (!m) throw new Error('DATABASE_URL not found')
  return m[1]
}

async function main() {
  const args = process.argv.slice(2)
  const flags = args.filter((a) => a.startsWith('--'))
  const [table, file] = args.filter((a) => !a.startsWith('--'))
  const dryRun = flags.includes('--dry-run')
  const batchSize = Number((flags.find((f) => f.startsWith('--batch')) || '').split('=')[1]) || 5000

  if (!table || !file || !fs.existsSync(file)) {
    console.error('usage: node db/load_generic.js <table> <file.jsonl[.gz]> [--dry-run] [--batch=N]')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: connectionString(), ssl: { rejectUnauthorized: false }, max: 2 })
  const client = await pool.connect()

  let cols = null
  let read = 0, inserted = 0, skipped = 0
  let batch = []

  const flush = async () => {
    if (!batch.length || !cols) { batch = []; return }
    const tuples = batch.map((_, i) =>
      '(' + cols.map((__, j) => `$${i * cols.length + j + 1}`).join(',') + ')')
    const params = batch.flatMap((r) => cols.map((c) => r[c] ?? null))
    if (!dryRun) {
      const res = await client.query(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES ${tuples.join(',')} ON CONFLICT DO NOTHING`,
        params
      )
      inserted += res.rowCount
      skipped += batch.length - res.rowCount
    }
    batch = []
  }

  const input = file.endsWith('.gz')
    ? fs.createReadStream(file).pipe(zlib.createGunzip())
    : fs.createReadStream(file)
  const rl = readline.createInterface({ input, crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line.trim()) continue
    let rec
    try { rec = JSON.parse(line) } catch { continue }
    if (!cols) cols = Object.keys(rec)
    read++
    batch.push(rec)
    if (batch.length >= batchSize) {
      await flush()
      if (read % 20000 === 0) process.stdout.write(`  ... ${read.toLocaleString()} read, ${inserted.toLocaleString()} inserted\r`)
    }
  }
  await flush()

  const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${table}`)
  console.log(`\n${dryRun ? '(dry run) ' : ''}read ${read.toLocaleString()} rows from ${path.basename(file)}`)
  console.log(`columns: ${cols ? cols.join(', ') : '(none)'}`)
  console.log(`${dryRun ? 'would insert' : 'inserted'}: ${inserted.toLocaleString()}   already present: ${skipped.toLocaleString()}`)
  console.log(`${table} now holds ${rows[0].n.toLocaleString()} rows`)

  client.release()
  await pool.end()
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
