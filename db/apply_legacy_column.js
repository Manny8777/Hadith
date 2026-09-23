// apply_legacy_column.js — rewrite one Postgres column from the original app's own column.
//
// Use when the column differ (legacy-audit/harness/cmp) reports that a migrated column does not
// hold the original's values, and the rest of the table checks out (so the row key is proven).
//
//   node db/apply_legacy_column.js <pg_table> <pg_key_col> <pg_column> <jsonl> [--apply]
//
// Source jsonl comes from harness/cmp/export_column.py: one {"k": <legacy key>, "v": <trimmed value>}
// per legacy row. Blank values are written as NULL. Dry run by default; --apply writes.
// Safety: aborts without writing if the map does not cover every destination row, or if the
// key is not unique on either side (a non-unique key would silently fan out the update).
const fs = require('fs');
const { Client } = require('pg');
const d = require('./dbenv.js');

const [, , PG_TABLE, PG_KEY, PG_COL, SRC, ...flags] = process.argv;
const APPLY = flags.includes('--apply');
const BATCH = 5000;

if (!PG_TABLE || !PG_KEY || !PG_COL || !SRC) {
  console.error('usage: node db/apply_legacy_column.js <pg_table> <pg_key_col> <pg_column> <jsonl> [--apply]');
  process.exit(2);
}

(async () => {
  const rows = fs.readFileSync(SRC, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  console.log('source rows: %d from %s', rows.length, SRC);
  const keys = new Set(rows.map((r) => String(r.k)));
  if (keys.size !== rows.length) {
    console.error('ABORT: source key is not unique (%d rows, %d distinct)', rows.length, keys.size);
    process.exit(1);
  }

  const c = new Client({ connectionString: d.url(), ssl: { rejectUnauthorized: false } });
  await c.connect();

  const dup = (await c.query(
    `SELECT count(*)::int n FROM (SELECT ${PG_KEY} FROM ${PG_TABLE}
       GROUP BY 1 HAVING count(*) > 1) t`)).rows[0].n;
  if (dup !== 0) {
    console.error('ABORT: %s.%s is not unique on the destination', PG_TABLE, PG_KEY);
    process.exit(1);
  }

  await c.query('BEGIN');
  // no ON COMMIT DROP here: this driver's transaction handling drops it before the UPDATE runs.
  // A temp table dies with the session, which is exactly the lifetime we want.
  await c.query(`CREATE TEMP TABLE m (k text PRIMARY KEY, v text)`);
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const vals = [];
    const params = [];
    chunk.forEach((r, j) => {
      vals.push('($' + (j * 2 + 1) + ',$' + (j * 2 + 2) + ')');
      params.push(String(r.k), r.v ? r.v : null);
    });
    await c.query('INSERT INTO m (k, v) VALUES ' + vals.join(','), params);
  }
  const loaded = (await c.query('SELECT count(*)::int n FROM m')).rows[0].n;

  const orphan = (await c.query(
    `SELECT count(*)::int n FROM ${PG_TABLE} t
      WHERE NOT EXISTS (SELECT 1 FROM m WHERE m.k = t.${PG_KEY}::text)`)).rows[0].n;
  if (orphan !== 0) {
    await c.query('ROLLBACK');
    console.error('ABORT: %d destination row(s) are not covered by the source map; nothing written', orphan);
    process.exit(1);
  }

  const would = (await c.query(
    `SELECT count(*) FILTER (WHERE t.${PG_COL} IS DISTINCT FROM m.v)::int changes,
            count(*) FILTER (WHERE m.v IS NOT NULL)::int non_empty,
            count(*) FILTER (WHERE t.${PG_COL} IS NOT NULL AND (m.v IS NULL OR m.v = ''))::int to_clear
       FROM ${PG_TABLE} t JOIN m ON m.k = t.${PG_KEY}::text`)).rows[0];
  console.log('temp rows=%d | would change=%d | source non-empty=%d | currently set but blank in source=%d',
    loaded, would.changes, would.non_empty, would.to_clear);

  if (!APPLY) {
    await c.query('ROLLBACK');
    console.log('dry run - nothing written (pass --apply)');
  } else {
    await c.query(`UPDATE ${PG_TABLE} t SET ${PG_COL} = NULLIF(m.v, '')
                     FROM m WHERE m.k = t.${PG_KEY}::text`);
    await c.query('COMMIT');
    const after = (await c.query(
      `SELECT count(*) FILTER (WHERE t.${PG_COL} IS NOT NULL)::int non_null,
              count(*) FILTER (WHERE t.${PG_COL} IS NOT NULL
                               AND t.${PG_COL} IS DISTINCT FROM NULLIF(m.v,''))::int mismatched
         FROM ${PG_TABLE} t JOIN m ON m.k = t.${PG_KEY}::text`)).rows[0];
    console.log('after: non-null=%d mismatched=%d', after.non_null, after.mismatched);
  }
  await c.end();
})().catch((e) => { console.error('ERR ' + e.message); process.exit(1); });
