// Migrate narrator criticism/grading data from NounsScientistsSays + NounsScientists
// NounsScientistsSays: f0=ID, f1=RawyID, f2=NScientistID, f3=Say, f4=SaySort
// NounsScientists: f0=ID, f1=ScientistID, f2=RelaterID, f3=ScientistName, f4=RelaterName
// JOIN: NounsScientistsSays.NScientistID (f2) = NounsScientists.ID (f0)

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});

const DATA = String.raw`C:\HadithProg\railway\extract\data`;

async function run() {
  const client = await pool.connect();
  try {
    // Apply schema
    const schema = fs.readFileSync(
      path.join(__dirname, 'schema_narrator_criticism.sql'), 'utf8');
    await client.query(schema);
    console.log('Schema applied.');

    // Load NounsScientists to build lookup: ID -> {scientistNounId, scientistName}
    console.log('Loading NounsScientists...');
    const scientists = JSON.parse(fs.readFileSync(
      path.join(DATA, 'NounsScientists.json'), 'utf8'));

    // Build ID -> scientist info map
    // f0=ID, f1=ScientistID(narrator ID of scholar), f2=RelaterID, f3=ScientistName
    const sciMap = {};
    for (const s of scientists) {
      sciMap[s.f0] = {
        scientistNounId: s.f1,  // ScientistID = narrator ID of scholar in Nouns table
        scientistName: s.f3     // ScientistName
      };
    }
    console.log(`Built scientist map: ${Object.keys(sciMap).length} entries`);

    // Load NounsScientistsSays
    console.log('Loading NounsScientistsSays...');
    const says = JSON.parse(fs.readFileSync(
      path.join(DATA, 'NounsScientistsSays.json'), 'utf8'));
    console.log(`NounsScientistsSays: ${says.length} rows`);

    // Clear existing
    await client.query('TRUNCATE narrator_criticism RESTART IDENTITY');
    console.log('Cleared narrator_criticism table.');

    // Batch insert
    const BATCH = 500;
    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < says.length; i += BATCH) {
      const batch = says.slice(i, i + BATCH);
      const values = [];
      const params = [];
      let pi = 1;

      for (const row of batch) {
        const rawyId = row.f1;          // narrator being graded
        const nScientistId = row.f2;    // NounsScientists.ID
        const sayText = row.f3;         // grading text
        const saySort = row.f4 || 0;    // sort order

        const sci = sciMap[nScientistId];
        if (!sci) {
          skipped++;
          continue;
        }

        values.push(`($${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++})`);
        params.push(rawyId, sci.scientistNounId, sci.scientistName, sayText, saySort);
      }

      if (values.length > 0) {
        await client.query(
          `INSERT INTO narrator_criticism (narrator_id, scientist_noun_id, scientist_name, say_text, say_sort)
           VALUES ${values.join(',')}`,
          params
        );
        inserted += values.length;
      }

      if ((i / BATCH) % 20 === 0) {
        console.log(`  Progress: ${inserted} inserted, ${skipped} skipped (${i + batch.length}/${says.length})`);
      }
    }

    console.log(`\nDone: ${inserted} rows inserted, ${skipped} skipped (no scientist found)`);

    // Verify
    const { rows: sample } = await client.query(
      `SELECT narrator_id, scientist_name, LEFT(say_text, 80) as say_preview, say_sort
       FROM narrator_criticism WHERE narrator_id = 822 ORDER BY say_sort LIMIT 10`);
    console.log('\nSample for narrator 822 (أنس بن مالك):');
    sample.forEach(r => console.log(`  [${r.say_sort}] ${r.scientist_name}: ${r.say_preview}`));

    const { rows: cnt } = await client.query(
      'SELECT COUNT(*) as total, COUNT(DISTINCT narrator_id) as narrators FROM narrator_criticism');
    console.log(`\nTotal: ${cnt[0].total} criticism records for ${cnt[0].narrators} narrators`);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
