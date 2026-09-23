// fix_service_next_prev.js — restore hadith_service_content.next_id / prev_id from the original.
//
// Why: the migrated columns do not hold the legacy values. Measured with the column differ
// (legacy-audit/harness/cmp, case svc_item7_next_id / svc_item7_prev_id):
//   next_id: only 3,380 of 600,575 rows matched the original's NextParagraphID
//   prev_id: 265,993 matched, and the original's 264,591/264,592 zero values were gone
//   (pg kept only 1,922 zeros), with the values shifted by one row.
// Everything else in that table is exact (part_num, page_num, book_id, left_value) keyed on
// MainID <-> id, both measured UNIQUE at 600,575, so id === legacy MainID and the original's
// column is directly assignable.
//
// Source of truth: the original's own columns, exported by
//   legacy-audit/harness/cmp/export_service_links.py -> legacy-audit/harness/cmp/work/svc_next_prev.jsonl
//
// Usage: node db/fix_service_next_prev.js [path-to-jsonl] [--apply]
//   dry run (default) reports what would change; --apply performs the update.
const fs = require('fs');
const { Client } = require('pg');
const d = require('./dbenv.js');

const SRC = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : 'legacy-audit/harness/cmp/work/svc_next_prev.jsonl';
const APPLY = process.argv.includes('--apply');
const BATCH = 5000;

(async () => {
  if (!fs.existsSync(SRC)) {
    console.error('source not found: ' + SRC + '\nrun: bash legacy-audit/harness/cmp/run.sh legacy-audit/harness/cmp/export_service_links.py');
    process.exit(2);
  }
  const rows = fs.readFileSync(SRC, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  console.log('source rows: ' + rows.length);

  const c = new Client({ connectionString: d.url(), ssl: { rejectUnauthorized: false } });
  await c.connect();

  const before = (await c.query(
    `SELECT count(*)::int n,
            count(*) FILTER (WHERE next_id = 0)::int next_zero,
            count(*) FILTER (WHERE prev_id = 0)::int prev_zero
       FROM hadith_service_content`)).rows[0];
  console.log('before: rows=%d next_zero=%d prev_zero=%d', before.n, before.next_zero, before.prev_zero);

  // the temp table must be created INSIDE the transaction: with ON COMMIT DROP and no
  // explicit transaction, autocommit drops it immediately after the statement.
  await c.query('BEGIN');
  await c.query('CREATE TEMP TABLE m (main_id int PRIMARY KEY, next_id bigint, prev_id bigint) ON COMMIT DROP');
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const vals = [];
    const params = [];
    chunk.forEach((r, j) => {
      vals.push('($' + (j * 3 + 1) + ',$' + (j * 3 + 2) + ',$' + (j * 3 + 3) + ')');
      params.push(r.main_id, r.next_id, r.prev_id);
    });
    await c.query('INSERT INTO m (main_id, next_id, prev_id) VALUES ' + vals.join(','), params);
  }
  const loaded = (await c.query('SELECT count(*)::int n FROM m')).rows[0].n;
  console.log('temp rows loaded: ' + loaded);

  // every destination row must be covered by the map, or the update would leave stale values
  const orphan = (await c.query(
    `SELECT count(*)::int n FROM hadith_service_content s
      WHERE NOT EXISTS (SELECT 1 FROM m WHERE m.main_id = s.id)`)).rows[0].n;
  if (orphan !== 0) {
    await c.query('ROLLBACK');
    console.error('ABORT: ' + orphan + ' destination row(s) have no source row; no update applied');
    process.exit(1);
  }

  const would = (await c.query(
    `SELECT count(*) FILTER (WHERE s.next_id IS DISTINCT FROM m.next_id)::int n,
            count(*) FILTER (WHERE s.prev_id IS DISTINCT FROM m.prev_id)::int p
       FROM hadith_service_content s JOIN m ON m.main_id = s.id`)).rows[0];
  console.log('rows that would change: next_id=%d prev_id=%d', would.n, would.p);

  if (!APPLY) {
    await c.query('ROLLBACK');
    console.log('dry run - nothing written (pass --apply to update)');
  } else {
    await c.query(
      `UPDATE hadith_service_content s SET next_id = m.next_id, prev_id = m.prev_id
         FROM m WHERE m.main_id = s.id`);
    await c.query('COMMIT');
    const after = (await c.query(
      `SELECT count(*)::int n,
              count(*) FILTER (WHERE next_id = 0)::int next_zero,
              count(*) FILTER (WHERE prev_id = 0)::int prev_zero,
              count(*) FILTER (WHERE next_id = m.next_id AND prev_id = m.prev_id)::int exact
         FROM hadith_service_content, m WHERE m.main_id = hadith_service_content.id`)).rows[0];
    console.log('after: rows=%d next_zero=%d prev_zero=%d exact_both=%d',
      after.n, after.next_zero, after.prev_zero, after.exact);
  }
  await c.end();
})().catch((e) => { console.error('ERR ' + e.message); process.exit(1); });
