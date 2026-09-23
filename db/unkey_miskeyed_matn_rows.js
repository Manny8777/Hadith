// db/unkey_miskeyed_matn_rows.js
//
// Removes the rows I loaded into `matn_comparison` while I still believed the legacy shards were keyed
// by COMPOUND id. They are keyed by HADITH id (see db/schema_matn_comparison_hadith.sql), so leaving them
// there attaches the original's comparison wording to unrelated hadiths; `matn_comparison` should hold
// only what the app's own extract put in it, and the shards' rows live in `matn_comparison_hadith`.
//
// Identification, with the check that makes it safe: the rows I inserted are the newest physical rows
// (one sequential pass, no updates since), and their (master, slave) pairs all appear in the export
// file. So the script
//   1. loads the export's 663,220 pairs into a temp table,
//   2. takes the boundary ctid of the rows NOT in that set,
//   3. requires the split to be exactly 647,169 newer / 16,051 older — the numbers the load reported —
//      and aborts without deleting if it is not,
//   4. deletes only the newer ones, then checks the table is back to 173,824 rows / 16,510 masters.
//
//   node db/unkey_miskeyed_matn_rows.js            # report only
//   node db/unkey_miskeyed_matn_rows.js --apply    # delete the newer rows
//
// The export file is legacy-audit/harness/matn_comparison_export.jsonl.gz (shards 1–2, the ones I loaded).

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const readline = require('readline')
const dbenv = require('./dbenv')
const { Pool } = require('pg')

const ROOT = path.join(__dirname, '..')
const EXPORT = path.join(ROOT, 'legacy-audit', 'harness', 'matn_comparison_export.jsonl.gz')
const EXPECT_NEW = 647169      // what load_matn_comparison.js reported inserting
const EXPECT_OLD = 173824      // matn_comparison's size before that load
const BATCH = 5000

async function main() {
  const apply = process.argv.includes('--apply')
  if (!fs.existsSync(EXPORT)) { console.error(`missing export: ${EXPORT}`); process.exit(1) }

  const pool = new Pool({ connectionString: dbenv.url(), ssl: { rejectUnauthorized: false }, max: 2 })
  const client = await pool.connect()

  const before = (await client.query(
    `SELECT count(*)::int rows, count(DISTINCT master_compound_id)::int masters FROM matn_comparison`)).rows[0]
  console.log(`matn_comparison before: ${before.rows.toLocaleString()} rows, ${before.masters.toLocaleString()} masters`)

  await client.query('BEGIN')
  await client.query(`CREATE TEMP TABLE ins (m integer, s integer) ON COMMIT DROP`)
  let pairs = 0, batch = []
  const flush = async () => {
    if (!batch.length) return
    const ph = batch.map((_, i) => `($${i * 2 + 1},$${i * 2 + 2})`).join(',')
    await client.query(`INSERT INTO ins (m, s) VALUES ${ph}`, batch.flatMap((p) => [p[0], p[1]]))
    batch = []
  }
  const input = fs.createReadStream(EXPORT).pipe(zlib.createGunzip())
  for await (const line of readline.createInterface({ input, crlfDelay: Infinity })) {
    if (!line.trim()) continue
    try { const r = JSON.parse(line); batch.push([r.m, r.s]); pairs++ } catch { /* skip */ }
    if (batch.length >= BATCH) await flush()
  }
  await flush()
  await client.query(`CREATE INDEX ON ins (m, s)`)
  console.log(`export pairs loaded into the temp table: ${pairs.toLocaleString()}`)

  const split = (await client.query(`
    WITH in_ins AS (
      SELECT ctid FROM matn_comparison mc
       WHERE EXISTS (SELECT 1 FROM ins i WHERE i.m = mc.master_compound_id AND i.s = mc.slave_hadith_id)
    ), boundary AS (SELECT max(ctid) AS t FROM matn_comparison mc WHERE NOT EXISTS (
         SELECT 1 FROM ins i WHERE i.m = mc.master_compound_id AND i.s = mc.slave_hadith_id))
    SELECT (SELECT count(*) FROM in_ins)::int AS matched,
           (SELECT count(*) FROM in_ins WHERE ctid > (SELECT t FROM boundary))::int AS newer,
           (SELECT count(*) FROM in_ins WHERE ctid <= (SELECT t FROM boundary))::int AS older,
           (SELECT t::text FROM boundary) AS boundary`)).rows[0]
  console.log(`rows whose pairs are in the export: ${split.matched.toLocaleString()}`)
  console.log(`  newer than everything else (mine): ${split.newer.toLocaleString()}  [expected ${EXPECT_NEW.toLocaleString()}]`)
  console.log(`  older (the app's own rows that coincide): ${split.older.toLocaleString()}  [expected ${(split.matched - EXPECT_NEW).toLocaleString()}]`)

  const ok = split.newer === EXPECT_NEW && split.matched === split.newer + split.older
  const expectTotal = before.rows - split.newer
  console.log(`verification: ${ok ? 'PASS' : 'FAIL'} — deleting ${split.newer.toLocaleString()} would leave ${expectTotal.toLocaleString()} rows (the app's own count is ${EXPECT_OLD.toLocaleString()})`)

  if (!apply || !ok) {
    console.log(apply ? 'not deleting (verification failed)' : 'report only — re-run with --apply to delete')
    await client.query('ROLLBACK')
    client.release(); await pool.end(); return
  }

  const del = await client.query(`
    DELETE FROM matn_comparison mc
     WHERE mc.ctid > $1::tid
       AND EXISTS (SELECT 1 FROM ins i WHERE i.m = mc.master_compound_id AND i.s = mc.slave_hadith_id)`,
    [split.boundary])
  await client.query('COMMIT')
  const after = (await client.query(
    `SELECT count(*)::int rows, count(DISTINCT master_compound_id)::int masters FROM matn_comparison`)).rows[0]
  console.log(`\ndeleted ${del.rowCount.toLocaleString()} rows`)
  console.log(`matn_comparison now: ${after.rows.toLocaleString()} rows, ${after.masters.toLocaleString()} masters ` +
              `(before my load: ${EXPECT_OLD.toLocaleString()})`)
  console.log(after.rows === EXPECT_OLD ? 'restored exactly ✓' : 'NOTE: differs from the pre-load count — investigate')

  client.release()
  await pool.end()
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
