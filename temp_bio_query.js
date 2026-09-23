const { Client } = require('pg');
const client = new Client({ connectionString: require('./db/dbenv.js').url() });
async function main() {
  await client.connect();

  // 1. narrator_biography columns
  const cols = await client.query(`SELECT column_name,data_type,character_maximum_length FROM information_schema.columns WHERE table_name='narrator_biography' ORDER BY ordinal_position`);
  console.log('=== narrator_biography columns ===');
  console.log(JSON.stringify(cols.rows, null, 2));

  // 2. narrator_biography for narrator_id=3889
  const bio = await client.query(`SELECT * FROM narrator_biography WHERE narrator_id=3889 LIMIT 3`);
  console.log('=== narrator_biography WHERE narrator_id=3889 ===');
  console.log(JSON.stringify(bio.rows, null, 2));

  // 3. count
  const cnt = await client.query(`SELECT COUNT(*) FROM narrator_biography`);
  console.log('=== narrator_biography count ===');
  console.log(JSON.stringify(cnt.rows, null, 2));

  // 4. biography/translation/service tables
  const tbls = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE '%biography%' OR table_name LIKE '%translation%' OR table_name LIKE '%service%') ORDER BY table_name`);
  console.log('=== related tables ===');
  console.log(JSON.stringify(tbls.rows, null, 2));

  // 5. all public tables
  const alltbls = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`);
  console.log('=== all public tables ===');
  console.log(JSON.stringify(alltbls.rows, null, 2));

  await client.end();
}
main().catch(console.error);
