// load_narrator_relations_full.js — restore the relations the migration filtered out.
//
// Problem: `narrator_relations` holds 7,989 rows; the original's NounsRelations holds 19,951 rows
// (11,518 distinct (first, second, type) keys). Every migrated row exists in the original
// (web-only = 0) and **the missing rows are exactly the ones whose SecondRawyID = 0**: the original
// has 6,100 of them and 6,100 rows are absent. The migration also dropped SayID, so a relation
// cannot be traced to the saying that evidences it.
//
// Fix: insert the legacy rows that are absent (ON CONFLICT DO NOTHING adds exactly those 6,100 -
// a second_id of 0 never joins to a narrator, so the teachers/students lists are unaffected), and
// add legacy_say_id so each relation can be traced back to its saying.
//
// Deliberately NOT restored: the original's remaining same-key rows (13,851 positive-second rows
// collapse to 7,989 distinct keys). Inserting them would repeat names in
// app/api/narrator/[id]/route.ts, which selects without DISTINCT.
//
// Usage: node db/load_narrator_relations_full.js [jsonl] [--apply]
const fs = require('fs');
const { Client } = require('pg');
const d = require('./dbenv.js');

const SRC = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : 'legacy-audit/harness/cmp/work/narrator_relations_full.jsonl';
const APPLY = process.argv.includes('--apply');
const BATCH = 4000;

(async () => {
  const rows = fs.readFileSync(SRC, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  console.log('source rows: %d from %s', rows.length, SRC);
  const c = new Client({ connectionString: d.url(), ssl: { rejectUnauthorized: false } });
  await c.connect();

  const before = (await c.query('SELECT count(*)::int n FROM narrator_relations')).rows[0];
  const zeroSecond = rows.filter((r) => r.SecondRawyID === '0').length;
  console.log('before: rows=%d | source rows=%d (second_id=0: %d)', before.n, rows.length, zeroSecond);

  await c.query('BEGIN');
  await c.query('ALTER TABLE narrator_relations ADD COLUMN IF NOT EXISTS legacy_say_id integer');
  await c.query('CREATE TEMP TABLE m (first_id int, second_id int, relation_type int, say_id int, is_sheikh boolean)');
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const vals = [];
    const params = [];
    chunk.forEach((r, j) => {
      const o = j * 5;
      vals.push('($' + (o + 1) + ',$' + (o + 2) + ',$' + (o + 3) + ',$' + (o + 4) + ',$' + (o + 5) + ')');
      params.push(parseInt(r.FirstRawyID, 10), parseInt(r.SecondRawyID, 10),
        parseInt(r.RelationType, 10), parseInt(r.SayID, 10), parseInt(r.IsShiekh, 10) !== 0);
    });
    await c.query('INSERT INTO m VALUES ' + vals.join(','), params);
  }
  console.log('temp rows: %d', (await c.query('SELECT count(*)::int n FROM m')).rows[0].n);

  const ins = await c.query(
    `INSERT INTO narrator_relations (first_id, second_id, relation_type, is_sheikh, legacy_say_id)
     SELECT DISTINCT ON (first_id, second_id, relation_type)
            first_id, second_id, relation_type, is_sheikh, say_id
       FROM m ORDER BY first_id, second_id, relation_type, say_id
     ON CONFLICT DO NOTHING`);

  // provenance for the rows that were already there: min(say_id) for the same key
  const upd = await c.query(
    `UPDATE narrator_relations nr SET legacy_say_id = mm.say_id
       FROM (SELECT first_id, second_id, relation_type, min(say_id) AS say_id
               FROM m GROUP BY 1, 2, 3) mm
      WHERE nr.legacy_say_id IS NULL
        AND nr.first_id = mm.first_id AND nr.second_id = mm.second_id
        AND nr.relation_type = mm.relation_type`);

  if (!APPLY) {
    await c.query('ROLLBACK');
    console.log('dry run: would insert %d rows, would set legacy_say_id on %d rows', ins.rowCount, upd.rowCount);
  } else {
    await c.query('COMMIT');
    const after = (await c.query(
      `SELECT count(*)::int n,
              count(*) FILTER (WHERE second_id = 0)::int zero_second,
              count(*) FILTER (WHERE legacy_say_id IS NOT NULL)::int with_say
         FROM narrator_relations`)).rows[0];
    console.log('after: rows=%d (target %d) | second_id=0 rows=%d (original %d) | legacy_say_id set=%d',
      after.n, rows.length, after.zero_second, zeroSecond, after.with_say);
  }
  await c.end();
})().catch((e) => { console.error('ERR ' + e.message); process.exit(1); });
