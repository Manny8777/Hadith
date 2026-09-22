// db/dump_keys.js — write the existing keys of a table as TSV, for the legacy-diff step.
//
//   node db/dump_keys.js <table> <col>[,<col>...] [outfile]
//
// Used by legacy-audit/harness/export_missing.py to work out which legacy rows are NOT yet in
// Postgres, so only those are exported and loaded (small, verifiable, idempotent).

const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
  const m = env.match(/^\s*DATABASE_URL\s*=\s*"?([^"\r\n]+)"?\s*$/m)
  if (!m) throw new Error('DATABASE_URL not found')
  return m[1]
}

async function main() {
  const [table, cols, outArg] = process.argv.slice(2)
  if (!table || !cols) {
    console.error('usage: node db/dump_keys.js <table> <col>[,<col>...] [outfile]')
    process.exit(1)
  }
  const colList = cols.split(',').map((c) => c.trim())
  const out = outArg || path.join(process.env.TEMP || process.env.TMPDIR || '.', `keys_${table}.tsv`)

  const pool = new Pool({ connectionString: connectionString(), ssl: { rejectUnauthorized: false }, max: 1 })
  const client = await pool.connect()
  const { rows } = await client.query(`SELECT ${colList.join(', ')} FROM ${table}`)
  const stream = fs.createWriteStream(out, { encoding: 'utf8' })
  for (const r of rows) stream.write(colList.map((c) => (r[c] === null ? '' : String(r[c]))).join('\t') + '\n')
  await new Promise((res) => stream.end(res))
  console.log(`${rows.length} keys (${colList.join(',')}) from ${table} -> ${out}`)
  client.release()
  await pool.end()
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
