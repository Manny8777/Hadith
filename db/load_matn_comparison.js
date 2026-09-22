// db/load_matn_comparison.js
//
// Loads the ORIGINAL app's matn-comparison rows into `matn_comparison`.
//
// Source of the JSONL: legacy-audit/harness/export_matn_comparison.py, which dumps the original
// app's own tables `HMatnComparison1..33`:
//     {"m": MasterMatnID, "s": SlaveMatnID, "k": MatchSort, "d": Comment, "t": shard}
// `MasterMatnID` is the compound-matn id (the id space of `takhrij.compound_matn_id`), `SlaveMatnID`
// is a hadith main id. Shards 1-2 are the ones keyed in that space; shards 3+ use a different
// master space and are not loaded here (see the exporter's docstring).
//
// Idempotent: rows that already exist keep their current values (ON CONFLICT DO NOTHING), so this
// can be re-run and can be layered on top of a partially populated table.
//
// Run:  node db/load_matn_comparison.js [path/to/export.jsonl.gz]
//       node db/load_matn_comparison.js --dry-run

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const readline = require('readline')
const { Pool } = require('pg')

const BATCH = 5000

function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
  const m = env.match(/^\s*DATABASE_URL\s*=\s*"?([^"\r\n]+)"?\s*$/m)
  if (!m) throw new Error('DATABASE_URL not found')
  return m[1]
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const file = args.find((a) => !a.startsWith('--')) ||
    path.join(__dirname, '..', 'legacy-audit', 'harness', 'matn_comparison_export.jsonl.gz')

  if (!fs.existsSync(file)) {
    console.error('export file not found: ' + file)
    process.exit(1)
  }

  const pool = new Pool({ connectionString: connectionString(), ssl: { rejectUnauthorized: false }, max: 2 })
  const client = await pool.connect()
  let read = 0, batch = [], inserted = 0, skipped = 0
  const masters = new Set()

  const flush = async () => {
    if (!batch.length) return
    const values = batch
    const cols = '(master_compound_id, slave_hadith_id, description, match_sort)'
    const params = []
    const tuples = values.map((r, i) => {
      const b = i * 4
      params.push(r.m, r.s, r.d, r.k)
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4})`
    })
    if (!dryRun) {
      const res = await client.query(
        `INSERT INTO matn_comparison ${cols} VALUES ${tuples.join(',')}
         ON CONFLICT (master_compound_id, slave_hadith_id) DO NOTHING`,
        params
      )
      inserted += res.rowCount
      skipped += values.length - res.rowCount
    }
    batch = []
  }

  const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line.trim()) continue
    let rec
    try { rec = JSON.parse(line) } catch { continue }
    read++
    const m = Number(rec.m), s = Number(rec.s)
    if (!(m > 0) || !(s > 0)) continue
    masters.add(m)
    batch.push({ m, s, d: rec.d ?? null, k: rec.k ?? null })
    if (batch.length >= BATCH) {
      await flush()
      if (read % 100000 === 0) process.stdout.write(`  ... ${read.toLocaleString()} read, ${inserted.toLocaleString()} inserted\r`)
    }
  }
  await flush()

  const { rows } = await client.query(
    `SELECT count(*)::int AS rows, count(DISTINCT master_compound_id)::int AS masters FROM matn_comparison`
  )
  console.log(`\nread ${read.toLocaleString()} rows from ${path.basename(file)}`)
  console.log(`masters seen in file: ${masters.size.toLocaleString()}`)
  console.log(`${dryRun ? '(dry run) would insert' : 'inserted'}: ${inserted.toLocaleString()}`)
  console.log(`already present (conflict): ${skipped.toLocaleString()}`)
  console.log(`matn_comparison now: ${rows[0].rows.toLocaleString()} rows, ${rows[0].masters.toLocaleString()} masters`)

  client.release()
  await pool.end()
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
