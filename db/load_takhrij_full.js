// load_takhrij_full.js — restore every takhrij membership the original holds.
//
// Problem: `takhrij` is keyed PRIMARY KEY (hadith_id), which allows one row per hadith. A hadith
// that appears in several groups therefore keeps only one of them: the table holds 273,698 rows
// where the original's HTakhreeg holds 281,541 rows (280,259 distinct (hadith, group, matn)
// memberships). Measured with the column differ: every migrated row exists in the original
// (web-only = 0) and 6,606 legacy rows (6,561 distinct memberships) are absent. Truncated groups:
// 105860 675->664, 105903 434->429, 110212 347->345, 110213 308->301, 107884 304->300.
//
// Fix: drop that primary key, key the table on (hadith_id, group_id, compound_matn_id), keep an
// index on hadith_id for the routes that filter by it, then insert every legacy row with
// ON CONFLICT DO NOTHING. Result should be 280,259 rows: the original's distinct memberships.
// The original also holds 1,282 rows that duplicate another row exactly; no key can represent
// them and they are deliberately not inserted (see db/legacy-column-repairs.md).
//
// Usage: node db/load_takhrij_full.js [jsonl] [--apply]
const fs = require('fs');
const { Client } = require('pg');
const d = require('./dbenv.js');

const SRC = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : 'legacy-audit/harness/cmp/work/takhrij_full.jsonl';
const APPLY = process.argv.includes('--apply');
const BATCH = 3000;

const INT = (v) => (v === '' || v === null || v === undefined ? null : parseInt(v, 10));
const TXT = (v) => (v === '' || v === null || v === undefined ? null : v);
const BOOL = (v) => (v === '' || v === null || v === undefined ? null : parseInt(v, 10) !== 0);

(async () => {
  const rows = fs.readFileSync(SRC, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  console.log('source rows: %d from %s', rows.length, SRC);

  const c = new Client({ connectionString: d.url(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  const before = (await c.query('SELECT count(*)::int n, count(DISTINCT group_id)::int g FROM takhrij')).rows[0];
  const distinct = new Set(rows.map((r) => r.HadithMainID + '|' + r.GroupID + '|' + r.CompoundMatnID));
  console.log('before: takhrij rows=%d groups=%d | source distinct memberships=%d',
    before.n, before.g, distinct.size);
  if (!APPLY) {
    console.log('dry run - pass --apply to (drop the hadith_id primary key and) insert');
    await c.end();
    return;
  }

  await c.query('BEGIN');
  await c.query('CREATE TEMP TABLE m (hadith_id int, group_id int, compound_matn_id int, book_id int,'
    + ' pivot_rawy text, pivot_id int, sand_rawy text, matn_length int, is_story boolean)');
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const vals = [];
    const params = [];
    chunk.forEach((r, j) => {
      const o = j * 9;
      vals.push('($' + (o + 1) + ',$' + (o + 2) + ',$' + (o + 3) + ',$' + (o + 4) + ',$' + (o + 5)
        + ',$' + (o + 6) + ',$' + (o + 7) + ',$' + (o + 8) + ',$' + (o + 9) + ')');
      params.push(INT(r.HadithMainID), INT(r.GroupID), INT(r.CompoundMatnID), INT(r.BookID),
        TXT(r.PivotRawy), INT(r.PivotID), TXT(r.SandRawy), INT(r.MatnLength), BOOL(r.IsStory));
    });
    await c.query('INSERT INTO m VALUES ' + vals.join(','), params);
  }
  console.log('temp rows: %d', (await c.query('SELECT count(*)::int n FROM m')).rows[0].n);

  // the primary key is the defect: one row per hadith cannot hold a hadith in several groups
  await c.query('ALTER TABLE takhrij DROP CONSTRAINT IF EXISTS takhrij_pkey');
  await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS takhrij_membership_key
                   ON takhrij (hadith_id, group_id, compound_matn_id)`);
  await c.query('CREATE INDEX IF NOT EXISTS idx_takhrij_hadith ON takhrij (hadith_id)');

  const ins = await c.query(
    `INSERT INTO takhrij (hadith_id, group_id, compound_matn_id, book_id, pivot_rawy, pivot_id,
                          sand_rawy, matn_length, is_story)
     SELECT DISTINCT ON (hadith_id, group_id, compound_matn_id)
            hadith_id, group_id, compound_matn_id, book_id, pivot_rawy, pivot_id,
            sand_rawy, matn_length, is_story
       FROM m
     ON CONFLICT DO NOTHING`);
  await c.query('COMMIT');
  const after = (await c.query('SELECT count(*)::int n, count(DISTINCT group_id)::int g FROM takhrij')).rows[0];
  console.log('inserted rows: %d', ins.rowCount);
  console.log('after: takhrij rows=%d (target %d) groups=%d', after.n, distinct.size, after.g);
  await c.end();
})().catch((e) => { console.error('ERR ' + e.message); process.exit(1); });
