// db/load_matn_hadith.js
//
// Loads the original app's matn comparisons into `matn_comparison_hadith`, keyed the way the original
// keys them (master = HADITH id — see db/schema_matn_comparison_hadith.sql for how that was established).
//
//   node db/load_matn_hadith.js [file.jsonl.gz] [labels.json]
//     defaults: legacy-audit/harness/matn_hadith_export.jsonl.gz
//               legacy-audit/harness/matn_comparison_labels.json
//
// Idempotent: rows already present are skipped (ON CONFLICT DO NOTHING), so re-running after a partial
// load simply continues. 8 M rows is a lot to hold in memory, so the file is streamed.

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const readline = require('readline')
const dbenv = require('./dbenv')
const { Pool } = require('pg')

const ROOT = path.join(__dirname, '..')
const DEFAULT_ROWS = path.join(ROOT, 'legacy-audit', 'harness', 'matn_hadith_export.jsonl.gz')
const DEFAULT_LABELS = path.join(ROOT, 'legacy-audit', 'harness', 'matn_comparison_labels.json')
const BATCH = 5000
const MAX_HADITH_ID = 341616

async function main() {
  const rowsFile = process.argv[2] || DEFAULT_ROWS
  const labelsFile = process.argv[3] || DEFAULT_LABELS
  for (const f of [rowsFile, labelsFile]) {
    if (!fs.existsSync(f)) { console.error(`missing input: ${f}`); process.exit(1) }
  }

  const pool = new Pool({ connectionString: dbenv.url(), ssl: { rejectUnauthorized: false }, max: 2 })
  const client = await pool.connect()

  // 1) the label enum
  const labels = JSON.parse(fs.readFileSync(labelsFile, 'utf8'))
  const labelEntries = Object.entries(labels)
  await client.query(`CREATE TABLE IF NOT EXISTS matn_comparison_labels (
      id smallint PRIMARY KEY, phrase text NOT NULL)`)
  for (const [id, phrase] of labelEntries) {
    await client.query(
      `INSERT INTO matn_comparison_labels (id, phrase) VALUES ($1,$2)
       ON CONFLICT (id) DO UPDATE SET phrase = EXCLUDED.phrase`, [Number(id), phrase])
  }
  console.log(`labels loaded: ${labelEntries.length}`)

  // 2) the rows
  await client.query(`CREATE TABLE IF NOT EXISTS matn_comparison_hadith (
      master_hadith_id integer NOT NULL, slave_hadith_id integer NOT NULL,
      match_sort smallint NOT NULL DEFAULT 0, label_id smallint REFERENCES matn_comparison_labels(id),
      PRIMARY KEY (master_hadith_id, slave_hadith_id),
      CONSTRAINT matn_cmp_hadith_positive CHECK (master_hadith_id > 0 AND slave_hadith_id > 0))`)

  let batch = [], read = 0, inserted = 0, rejected = 0
  const flush = async () => {
    if (!batch.length) return
    const placeholders = batch.map((_, i) => `($${i * 4 + 1},$${i * 4 + 2},$${i * 4 + 3},$${i * 4 + 4})`).join(',')
    const params = batch.flatMap((r) => [r.m, r.s, r.k, r.d])
    const res = await client.query(
      `INSERT INTO matn_comparison_hadith (master_hadith_id, slave_hadith_id, match_sort, label_id)
       VALUES ${placeholders} ON CONFLICT DO NOTHING`, params)
    inserted += res.rowCount
    batch = []
  }

  const input = rowsFile.endsWith('.gz') ? fs.createReadStream(rowsFile).pipe(zlib.createGunzip()) : fs.createReadStream(rowsFile)
  const rl = readline.createInterface({ input, crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line.trim()) continue
    let r
    try { r = JSON.parse(line) } catch { continue }
    read++
    if (!Number.isInteger(r.m) || !Number.isInteger(r.s) ||
        r.m <= 0 || r.s <= 0 || r.m > MAX_HADITH_ID || r.s > MAX_HADITH_ID) {
      rejected++
      continue
    }
    batch.push(r)
    if (batch.length >= BATCH) {
      await flush()
      if (read % 250000 === 0) process.stdout.write(`  ${read.toLocaleString()} read, ${inserted.toLocaleString()} inserted\r`)
    }
  }
  await flush()

  const { rows } = await client.query(
    `SELECT count(*)::int rows, count(DISTINCT master_hadith_id)::int masters,
            count(DISTINCT slave_hadith_id)::int slaves FROM matn_comparison_hadith`)
  console.log(`\nread ${read.toLocaleString()} | inserted ${inserted.toLocaleString()} | already present ${(read - inserted - rejected).toLocaleString()} | rejected invalid IDs ${rejected.toLocaleString()}`)
  console.log(`matn_comparison_hadith now: ${rows[0].rows.toLocaleString()} rows, ${rows[0].masters.toLocaleString()} masters, ${rows[0].slaves.toLocaleString()} slaves`)

  client.release()
  await pool.end()
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
