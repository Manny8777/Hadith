// db/verify_matn_comparison_hadith.js
//
// Read-only verification for the valid matn comparison export and the loaded table.
// The legacy source contains 238 distinct invalid placeholder/corrupt keys; those are
// intentionally excluded by export_matn_hadith.py and must not be inserted as hadith IDs.

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const readline = require('readline')
const dbenv = require('./dbenv')
const { Pool } = require('pg')

const ROOT = path.join(__dirname, '..')
const DEFAULT_ROWS = path.join(ROOT, 'legacy-audit', 'harness', 'matn_hadith_export.jsonl.gz')
const DEFAULT_META = path.join(ROOT, 'legacy-audit', 'harness', 'matn_hadith_export.meta.json')
const MAX_HADITH_ID = 341616

async function scanExport(file) {
  const seen = new Set()
  let rows = 0
  let duplicates = 0
  let invalid = 0
  const input = file.endsWith('.gz')
    ? fs.createReadStream(file).pipe(zlib.createGunzip())
    : fs.createReadStream(file)
  const rl = readline.createInterface({ input, crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line.trim()) continue
    const row = JSON.parse(line)
    rows++
    const master = Number(row.m)
    const slave = Number(row.s)
    if (!Number.isInteger(master) || !Number.isInteger(slave) ||
        master <= 0 || slave <= 0 || master > MAX_HADITH_ID || slave > MAX_HADITH_ID) {
      invalid++
      continue
    }
    const key = master + ':' + slave
    if (seen.has(key)) duplicates++
    else seen.add(key)
  }
  return { rows, validUnique: seen.size, duplicates, invalid }
}

async function main() {
  const rowsFile = process.argv[2] || DEFAULT_ROWS
  const metaFile = process.argv[3] || DEFAULT_META
  if (!fs.existsSync(rowsFile) || !fs.existsSync(metaFile)) {
    throw new Error('export or metadata file is missing')
  }

  const exportScan = await scanExport(rowsFile)
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'))
  const pool = new Pool({
    connectionString: dbenv.url(),
    ssl: { rejectUnauthorized: false },
    max: 1,
  })
  const client = await pool.connect()
  try {
    const db = await client.query(
      `SELECT
          count(*)::int AS rows,
          count(DISTINCT master_hadith_id)::int AS masters,
          count(DISTINCT slave_hadith_id)::int AS slaves,
          count(*) FILTER (
            WHERE master_hadith_id <= 0 OR slave_hadith_id <= 0
          )::int AS nonpositive,
          count(*) FILTER (
            WHERE master_hadith_id > $1 OR slave_hadith_id > $1
          )::int AS out_of_range
       FROM matn_comparison_hadith`,
      [MAX_HADITH_ID]
    )
    const labels = await client.query(
      'SELECT count(*)::int AS count, count(*) FILTER (WHERE phrase IS NULL)::int AS null_phrases FROM matn_comparison_labels'
    )
    const result = {
      export: exportScan,
      metadata_kept: Number(meta.kept),
      database: db.rows[0],
      labels: labels.rows[0],
      verdict: exportScan.validUnique === Number(db.rows[0].rows) &&
        Number(db.rows[0].nonpositive) === 0 &&
        Number(db.rows[0].out_of_range) === 0 &&
        Number(db.rows[0].rows) === Number(meta.kept)
        ? 'PASS'
        : 'FAIL',
      note: 'The 238 source-distinct rejects are invalid placeholders/corrupt IDs, not missing hadith pairs.',
    }
    console.log(JSON.stringify(result, null, 2))
    if (result.verdict !== 'PASS') process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error('FAILED:', error.message)
  process.exitCode = 1
})
