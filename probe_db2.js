const {Client} = require('pg');
const c = new Client({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: {rejectUnauthorized: false}
});

async function run() {
  await c.connect();

  // Check narrator_biography for age_at_death, has_biography indicator
  let r = await c.query('SELECT * FROM narrator_biography LIMIT 3');
  console.log('narrator_biography sample:', JSON.stringify(r.rows));

  // Check narrators columns explicitly for age_at_death, abb_name_2, laqab_2, mawla
  r = await c.query('SELECT column_name FROM information_schema.columns WHERE table_name=\'narrators\' ORDER BY ordinal_position');
  console.log('narrators ALL columns:', JSON.stringify(r.rows));

  // Check narrator_relations for mawla
  r = await c.query('SELECT * FROM narrator_relations LIMIT 5');
  console.log('narrator_relations:', JSON.stringify(r.rows));

  // Check narrator_relation_types
  r = await c.query('SELECT * FROM narrator_relation_types');
  console.log('narrator_relation_types:', JSON.stringify(r.rows));

  // Check hadith_toc for tarqeem_matboa2, word_count, sub_chapter_id
  r = await c.query('SELECT column_name FROM information_schema.columns WHERE table_name=\'hadith_toc\' ORDER BY ordinal_position');
  console.log('hadith_toc ALL columns:', JSON.stringify(r.rows));

  // Check if there is a tarqeem_matboa2 explicitly
  r = await c.query("SELECT tarqeem_harf, tarqeem_matboa1 FROM hadith_toc WHERE tarqeem_matboa1 IS NOT NULL LIMIT 5");
  console.log('tarqeem sample:', JSON.stringify(r.rows));

  // Check isnad_relation_types for companion role
  r = await c.query('SELECT * FROM isnad_relation_types');
  console.log('isnad_relation_types:', JSON.stringify(r.rows));

  // Check narrator_books
  r = await c.query('SELECT * FROM narrator_books LIMIT 5');
  console.log('narrator_books:', JSON.stringify(r.rows));

  // Check narrator_scientists
  r = await c.query('SELECT * FROM narrator_scientists LIMIT 5');
  console.log('narrator_scientists:', JSON.stringify(r.rows));

  // Count distinct tables
  r = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  console.log('ALL TABLES:', JSON.stringify(r.rows));

  await c.end();
}

run().catch(e => { console.error(e); process.exit(1); });
