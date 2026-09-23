const { Pool } = require('pg');
const fs = require('fs');
const DB = require('./dbenv.js').url();
const p = new Pool({ connectionString: DB, ssl: { rejectUnauthorized: false } });

async function run() {
  // 1. Apply schema changes
  console.log('Applying schema...');
  await p.query(fs.readFileSync('db/schema_narrators_v2.sql', 'utf8'));
  console.log('Schema applied.');

  // 2. Load Nouns.json
  console.log('Loading Nouns.json...');
  const nouns = JSON.parse(fs.readFileSync(String.raw`C:\HadithProg\railway\extract\data_named\Nouns.json`, 'utf8'));
  console.log(`Loaded ${nouns.length} records.`);

  // 3. Update in batches
  const BATCH = 500;
  let updated = 0;
  for (let i = 0; i < nouns.length; i += BATCH) {
    const batch = nouns.slice(i, i + BATCH);
    await Promise.all(batch.map(r => p.query(
      `UPDATE narrators SET
        laqab        = $1,
        nasab        = $2,
        living_city  = $3,
        selat_karaba = $4,
        journey_city = $5,
        mazhb        = $6,
        esm_shuhra   = $7,
        birth_year   = CASE WHEN birth_year = '' OR birth_year IS NULL THEN $8 ELSE birth_year END,
        is_companion = ($9 = 1)
       WHERE id = $10`,
      [
        r.Laqab        || '',
        r.Nasab        || '',
        r.LivingCity   || '',
        r.SelatKaraba  || '',
        r.JourneyCity  || '',
        r.Mazhb        || '',
        r.EsmShuhra    || '',
        r.BirthYear    || '',
        r.TabaqaNum,
        r.ID
      ]
    )));
    updated += batch.length;
    if (updated % 5000 === 0) console.log(`  Updated ${updated}/${nouns.length}...`);
  }
  console.log(`Done. Updated ${updated} narrators.`);

  // 4. Verify narrator 822
  const check = await p.query(`SELECT id, name, laqab, nasab, living_city, selat_karaba, journey_city, birth_year, is_companion FROM narrators WHERE id = 822`);
  console.log('\nNarrator 822 after update:');
  console.log(JSON.stringify(check.rows[0], null, 2));

  await p.end();
}
run().catch(e => { console.error(e.message); p.end(); process.exit(1); });
