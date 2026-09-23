#!/usr/bin/env node
/**
 * Add hadith_judgments.legacy_say_id and populate it from the map produced by
 * db/legacy_judgment_map.py, so a saying can be joined to the legacy tables that carry its source
 * (hadith_judgment_hits / hadith_judgment_links, both keyed on the legacy SayID).
 *
 * Refuses to write unless the positional hypothesis (row id = legacy hit index) is confirmed against
 * the live rows, so it cannot silently mis-attribute sources.
 *
 * Usage: node db/add_judgment_legacy_say_id.js [map.tsv]
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const dbenv = require(path.join(__dirname, 'dbenv.js'));

const MAP = process.argv[2] || 'judgment_map.tsv';
const SAMPLE_STEP = 397;   // ~600 spread rows out of 236,933
const BATCH = 10000;

(async () => {
  const ids = [], says = [], hadiths = [];
  for (const line of fs.readFileSync(MAP, 'utf8').split('\n')) {
    if (!line) continue;
    const [id, say, hadith] = line.split('\t');
    ids.push(+id); says.push(+say); hadiths.push(+hadith);
  }
  console.log(`map rows: ${ids.length}`);

  const client = new Client({ connectionString: dbenv.url(), ssl: { rejectUnauthorized: false } });
  await client.connect();

  const sample = [];
  for (let k = 0; k < ids.length; k += SAMPLE_STEP) sample.push(k);
  const { rows } = await client.query('SELECT id, hadith_id FROM hadith_judgments WHERE id = ANY($1::int[])', [sample.map(k => ids[k])]);
  const byId = new Map(rows.map(r => [r.id, r.hadith_id]));
  let agree = 0, checked = 0;
  for (const k of sample) {
    const app = byId.get(ids[k]);
    if (app === undefined) continue;
    checked++;
    if (app === hadiths[k]) agree++;
  }
  console.log(`positional check: ${agree}/${checked} agree`);
  if (checked === 0 || agree / checked < 0.995) {
    console.log('ABORT: mapping hypothesis not confirmed; nothing written');
    await client.end();
    process.exit(1);
  }

  await client.query('ALTER TABLE hadith_judgments ADD COLUMN IF NOT EXISTS legacy_say_id INTEGER');
  let updated = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const r = await client.query(
      `UPDATE hadith_judgments j SET legacy_say_id = m.say_id
       FROM unnest($1::int[], $2::int[]) AS m(id, say_id) WHERE j.id = m.id`,
      [ids.slice(i, i + BATCH), says.slice(i, i + BATCH)]
    );
    updated += r.rowCount;
  }
  await client.query('CREATE INDEX IF NOT EXISTS idx_judgment_legacy_say ON hadith_judgments(legacy_say_id)');
  const cov = await client.query('SELECT COUNT(*)::int total, COUNT(legacy_say_id)::int mapped FROM hadith_judgments');
  console.log(`updated rows: ${updated} | coverage: ${JSON.stringify(cov.rows[0])}`);
  await client.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
