const { Client } = require('pg');
const client = new Client({ connectionString: require('./db/dbenv.js').url() });

async function run() {
  await client.connect();

  // Distinct scientist_ids in hadith_judgments
  const sciIds = await client.query(`SELECT COUNT(DISTINCT scientist_id) FROM hadith_judgments`);
  console.log('Distinct scientist_ids in hadith_judgments:', sciIds.rows[0].count);

  // Do those scientist_ids exist in narrators?
  const matchCount = await client.query(`
    SELECT COUNT(DISTINCT hj.scientist_id) as matched
    FROM hadith_judgments hj
    JOIN narrators n ON n.id = hj.scientist_id
  `);
  console.log('scientist_ids that exist in narrators:', matchCount.rows[0].matched);

  // Sample scientist names from narrators
  console.log('\nSample scientist names (from narrators where id in hadith_judgments):');
  const sciSample = await client.query(`
    SELECT DISTINCT n.id, n.name, n.abb_name 
    FROM hadith_judgments hj 
    JOIN narrators n ON n.id = hj.scientist_id 
    LIMIT 8
  `);
  sciSample.rows.forEach(r => console.log(JSON.stringify(r)));

  // narrator_criticism: does garh_label = narrator_grading.text for matching say_id?
  // Check a few rows where garh_label is not null
  console.log('\nnarrator_criticism with garh_label (checking GarhLinks mapping):');
  const withGarh = await client.query(`
    SELECT nc.narrator_id, nc.say_id, nc.garh_label, ng.id as grading_id, ng.text as grading_text
    FROM narrator_criticism nc
    LEFT JOIN narrator_grading ng ON ng.text = nc.garh_label
    WHERE nc.garh_label IS NOT NULL
    LIMIT 5
  `);
  withGarh.rows.forEach(r => console.log(JSON.stringify(r)));

  // How many narrator_criticism rows have a non-null garh_label?
  const garhCount = await client.query(`SELECT COUNT(*) FROM narrator_criticism WHERE garh_label IS NOT NULL`);
  console.log('\nnarrator_criticism rows with garh_label NOT NULL:', garhCount.rows[0].count);
  
  // How many NounsGarhLinks exist conceptually? Check narrator_criticism rows that have both say_id and garh_label
  const linkableCount = await client.query(`SELECT COUNT(*) FROM narrator_criticism WHERE garh_label IS NOT NULL AND say_id IS NOT NULL`);
  console.log('narrator_criticism rows with both say_id AND garh_label:', linkableCount.rows[0].count);

  await client.end();
}
run().catch(e => { console.error(e.message); process.exit(1); });
