const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway'
});

async function run() {
  await client.connect();

  // 1. List all tables
  console.log('=== ALL TABLES ===');
  const tables = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`);
  tables.rows.forEach(r => console.log(r.table_name));

  // 2. narrator_relations columns + count
  console.log('\n=== narrator_relations columns ===');
  const nrCols = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='narrator_relations' ORDER BY ordinal_position`);
  nrCols.rows.forEach(r => console.log(r.column_name, '|', r.data_type));
  const nrCount = await client.query(`SELECT COUNT(*) FROM narrator_relations`);
  console.log('Count:', nrCount.rows[0].count);
  const nrSample = await client.query(`SELECT * FROM narrator_relations LIMIT 5`);
  console.log('Sample rows:');
  nrSample.rows.forEach(r => console.log(JSON.stringify(r)));

  // 3. narrator_criticism columns + count
  console.log('\n=== narrator_criticism columns ===');
  const ncCols = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='narrator_criticism' ORDER BY ordinal_position`);
  ncCols.rows.forEach(r => console.log(r.column_name, '|', r.data_type));
  const ncCount = await client.query(`SELECT COUNT(*) FROM narrator_criticism`);
  console.log('Count:', ncCount.rows[0].count);
  const ncSample = await client.query(`SELECT * FROM narrator_criticism LIMIT 3`);
  console.log('Sample rows:');
  ncSample.rows.forEach(r => console.log(JSON.stringify(r)));

  // 4. narrator_grading columns + count
  console.log('\n=== narrator_grading columns ===');
  const ngCols = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='narrator_grading' ORDER BY ordinal_position`);
  ngCols.rows.forEach(r => console.log(r.column_name, '|', r.data_type));
  const ngCount = await client.query(`SELECT COUNT(*) FROM narrator_grading`);
  console.log('Count:', ngCount.rows[0].count);
  const ngSample = await client.query(`SELECT * FROM narrator_grading LIMIT 5`);
  console.log('Sample rows:');
  ngSample.rows.forEach(r => console.log(JSON.stringify(r)));

  // 5. narrator_biography columns + count  
  console.log('\n=== narrator_biography columns ===');
  const nbCols = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='narrator_biography' ORDER BY ordinal_position`);
  nbCols.rows.forEach(r => console.log(r.column_name, '|', r.data_type));
  const nbCount = await client.query(`SELECT COUNT(*) FROM narrator_biography`);
  console.log('Count:', nbCount.rows[0].count);
  const nbSample = await client.query(`SELECT id, narrator_id, main_id, book_id, LENGTH(content::text) as content_len FROM narrator_biography LIMIT 5`);
  console.log('Sample rows (content truncated):');
  nbSample.rows.forEach(r => console.log(JSON.stringify(r)));

  // 6. narrator_scientists columns + count
  console.log('\n=== narrator_scientists columns ===');
  const nsCols = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='narrator_scientists' ORDER BY ordinal_position`);
  nsCols.rows.forEach(r => console.log(r.column_name, '|', r.data_type));
  const nsCount = await client.query(`SELECT COUNT(*) FROM narrator_scientists`);
  console.log('Count:', nsCount.rows[0].count);
  const nsSample = await client.query(`SELECT * FROM narrator_scientists LIMIT 5`);
  console.log('Sample rows:');
  nsSample.rows.forEach(r => console.log(JSON.stringify(r)));

  // 7. narrators columns
  console.log('\n=== narrators columns ===');
  const nounsCols = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='narrators' ORDER BY ordinal_position`);
  nounsCols.rows.forEach(r => console.log(r.column_name, '|', r.data_type));
  const nounsCount = await client.query(`SELECT COUNT(*) FROM narrators`);
  console.log('Count:', nounsCount.rows[0].count);
  const nounsSample = await client.query(`SELECT * FROM narrators LIMIT 3`);
  console.log('Sample rows:');
  nounsSample.rows.forEach(r => console.log(JSON.stringify(r)));

  // 8. hadith_judgments to check scientist_id
  console.log('\n=== hadith_judgments columns ===');
  const hjCols = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='hadith_judgments' ORDER BY ordinal_position`);
  hjCols.rows.forEach(r => console.log(r.column_name, '|', r.data_type));
  const hjCount = await client.query(`SELECT COUNT(*) FROM hadith_judgments`);
  console.log('Count:', hjCount.rows[0].count);
  const hjSample = await client.query(`SELECT * FROM hadith_judgments LIMIT 3`);
  console.log('Sample rows:');
  hjSample.rows.forEach(r => console.log(JSON.stringify(r)));

  await client.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
