const { Client } = require('pg');
const client = new Client({ connectionString: require('./db/dbenv.js').url() });

async function run() {
  await client.connect();

  console.log('narrator_books columns:');
  const cols = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='narrator_books' ORDER BY ordinal_position`);
  cols.rows.forEach(r => console.log(r.column_name, '|', r.data_type));
  const count = await client.query(`SELECT COUNT(*) FROM narrator_books`);
  console.log('Count:', count.rows[0].count);
  const sample = await client.query(`SELECT * FROM narrator_books LIMIT 5`);
  sample.rows.forEach(r => console.log(JSON.stringify(r)));

  // Check if hadith_services contains the "service" concept referenced by NounsTranslation.ServiceMainID
  console.log('\nhadith_services columns:');
  const hsCols = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='hadith_services' ORDER BY ordinal_position`);
  hsCols.rows.forEach(r => console.log(r.column_name, '|', r.data_type));
  const hsCount = await client.query(`SELECT COUNT(*) FROM hadith_services`);
  console.log('Count:', hsCount.rows[0].count);
  const hsSample = await client.query(`SELECT * FROM hadith_services LIMIT 5`);
  hsSample.rows.forEach(r => console.log(JSON.stringify(r)));
  
  // hadith_service_links
  console.log('\nhadith_service_links columns:');
  const hslCols = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='hadith_service_links' ORDER BY ordinal_position`);
  hslCols.rows.forEach(r => console.log(r.column_name, '|', r.data_type));
  const hslCount = await client.query(`SELECT COUNT(*) FROM hadith_service_links`);
  console.log('Count:', hslCount.rows[0].count);
  const hslSample = await client.query(`SELECT * FROM hadith_service_links LIMIT 5`);
  hslSample.rows.forEach(r => console.log(JSON.stringify(r)));

  await client.end();
}
run().catch(e => { console.error(e.message); process.exit(1); });
