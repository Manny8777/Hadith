const { Client } = require('pg');
const client = new Client({ connectionString: require('./db/dbenv.js').url() });

const tables = [
  'narrator_relations', 'narrator_biography', 'narrator_grading', 
  'narrator_grading_terms', 'narrator_criticism', 'narrators',
  'narrator_scientists', 'hadith_judgments'
];

async function run() {
  await client.connect();
  for (const t of tables) {
    const cols = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='${t}' ORDER BY ordinal_position;`
    );
    const count = await client.query(`SELECT COUNT(*) FROM ${t};`);
    console.log(`\n=== ${t} (${count.rows[0].count} rows) ===`);
    cols.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));
    const sample = await client.query(`SELECT * FROM ${t} LIMIT 2;`);
    console.log('SAMPLE:', JSON.stringify(sample.rows));
  }
  await client.end();
}
run().catch(e => { console.error(e.message); process.exit(1); });
