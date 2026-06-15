// Add say_id + garh_label columns to narrator_criticism, then re-populate from source
// Sources: NounsScientistsSays + NounsGarhLinks → NounsGarh (grade text per saying)

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
    // 1. Add columns (idempotent)
    await client.query(`
      ALTER TABLE narrator_criticism
        ADD COLUMN IF NOT EXISTS say_id INTEGER,
        ADD COLUMN IF NOT EXISTS garh_label TEXT
    `);
    console.log('Columns added.');

    // 2. Build NounsGarh: ID → grade text
    console.log('Loading NounsGarh...');
    const nounsGarh = JSON.parse(fs.readFileSync(path.join(DATA, 'NounsGarh.json'), 'utf8'));
    const garhMap = {};
    for (const g of nounsGarh) {
      garhMap[g.f0] = { text: g.f1, isTaqreeb: g.f3 };
    }
    console.log(`NounsGarh: ${Object.keys(garhMap).length} grade labels`);

    // 3. Build NounsGarhLinks: SayID → grade text (prefer IsTaqreeb label)
    console.log('Loading NounsGarhLinks...');
    const garhLinks = JSON.parse(fs.readFileSync(path.join(DATA, 'NounsGarhLinks.json'), 'utf8'));
    const sayGradeMap = {};
    for (const link of garhLinks) {
      const sayId = link.f2;
      const garh = garhMap[link.f1];
      if (!garh) continue;
      if (!sayGradeMap[sayId] || garh.isTaqreeb) {
        sayGradeMap[sayId] = garh.text;
      }
    }
    console.log(`NounsGarhLinks: ${garhLinks.length} links → ${Object.keys(sayGradeMap).length} graded says`);

    // 4. Build NounsScientists map: ID → { nounId, name }
    console.log('Loading NounsScientists...');
    const scientists = JSON.parse(fs.readFileSync(path.join(DATA, 'NounsScientists.json'), 'utf8'));
    const sciMap = {};
    for (const s of scientists) {
      sciMap[s.f0] = { nounId: s.f1, name: s.f3 };
    }
    console.log(`NounsScientists: ${Object.keys(sciMap).length} entries`);

    // 5. Load NounsScientistsSays
    // f0=ID, f1=RawyID, f2=NScientistID, f3=Say, f4=SaySort
    console.log('Loading NounsScientistsSays...');
    const says = JSON.parse(fs.readFileSync(path.join(DATA, 'NounsScientistsSays.json'), 'utf8'));
    console.log(`NounsScientistsSays: ${says.length} rows`);

    // 6. Re-insert with say_id and garh_label
    await client.query('TRUNCATE narrator_criticism RESTART IDENTITY');
    console.log('Cleared narrator_criticism for re-migration.');

    const BATCH = 500;
    let inserted = 0, skipped = 0, graded = 0;

    for (let i = 0; i < says.length; i += BATCH) {
      const batch = says.slice(i, i + BATCH);
      const values = [];
      const params = [];
      let pi = 1;

      for (const row of batch) {
        const sayId = row.f0;
        const rawyId = row.f1;
        const nScientistId = row.f2;
        const sayText = row.f3;
        const saySort = row.f4 || 0;

        const sci = sciMap[nScientistId];
        if (!sci) { skipped++; continue; }

        const garhLabel = sayGradeMap[sayId] || null;
        if (garhLabel) graded++;

        values.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++})`);
        params.push(rawyId, sci.nounId, sci.name, sayText, saySort, sayId, garhLabel);
      }

      if (values.length > 0) {
        await client.query(
          `INSERT INTO narrator_criticism
             (narrator_id, scientist_noun_id, scientist_name, say_text, say_sort, say_id, garh_label)
           VALUES ${values.join(',')}`,
          params
        );
        inserted += values.length;
      }

      if ((i / BATCH) % 40 === 0) {
        process.stdout.write(`\r  ${inserted} inserted, ${graded} graded (${Math.round(100*i/says.length)}%)`);
      }
    }

    console.log(`\nDone: ${inserted} rows, ${graded} with grade labels, ${skipped} skipped`);

    // Stats
    const { rows: stats } = await client.query(`
      SELECT COUNT(*) as total, COUNT(garh_label) as with_grade,
             ROUND(100.0 * COUNT(garh_label) / COUNT(*), 1) as pct
      FROM narrator_criticism
    `);
    console.log(`Grade coverage: ${stats[0].with_grade}/${stats[0].total} (${stats[0].pct}%)`);

    // Sample
    const { rows: sample } = await client.query(`
      SELECT scientist_name, garh_label, LEFT(say_text, 80) as say_preview
      FROM narrator_criticism WHERE narrator_id = 822
      ORDER BY say_sort LIMIT 8
    `);
    console.log('\nSample for narrator 822 (أنس بن مالك):');
    sample.forEach(r => console.log(`  [${r.garh_label || '—'}] ${r.scientist_name}: ${r.say_preview}`));

    await client.query('CREATE INDEX IF NOT EXISTS idx_narrator_criticism_say ON narrator_criticism(say_id)');
    console.log('\nIndex on say_id created.');

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
