const { Client } = require('pg');
const client = new Client({ connectionString: require('./db/dbenv.js').url() });

async function run() {
  await client.connect();

  // is_sheikh breakdown
  const breakdown = await client.query(`SELECT is_sheikh, COUNT(*) FROM narrator_relations GROUP BY is_sheikh`);
  console.log('narrator_relations is_sheikh breakdown:');
  breakdown.rows.forEach(r => console.log(JSON.stringify(r)));

  // narrator_relation_types
  console.log('\nnarrator_relation_types:');
  const rtCols = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='narrator_relation_types' ORDER BY ordinal_position`);
  rtCols.rows.forEach(r => console.log(r.column_name, '|', r.data_type));
  const rtCount = await client.query(`SELECT COUNT(*) FROM narrator_relation_types`);
  console.log('Count:', rtCount.rows[0].count);
  const rtAll = await client.query(`SELECT * FROM narrator_relation_types`);
  rtAll.rows.forEach(r => console.log(JSON.stringify(r)));

  // Check if narrator_biography has main_id that matches NounsTranslation's ServiceMainID concept
  console.log('\nnarrator_biography distinct book_id count:');
  const bookIds = await client.query(`SELECT COUNT(DISTINCT book_id) FROM narrator_biography`);
  console.log('Distinct book_ids:', bookIds.rows[0].count);
  
  console.log('\nnarrator_biography sample with title (NounsTranslation ServiceMainID = main_id?):');
  const nbTitle = await client.query(`SELECT narrator_id, main_id, book_id, book_name, LEFT(title, 80) as title_preview FROM narrator_biography LIMIT 5`);
  nbTitle.rows.forEach(r => console.log(JSON.stringify(r)));

  // hadith_judgment_hits - check scientist_id is narrator ID
  console.log('\nhadith_judgment_hits columns:');
  const hjhCols = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='hadith_judgment_hits' ORDER BY ordinal_position`);
  hjhCols.rows.forEach(r => console.log(r.column_name, '|', r.data_type));
  const hjhCount = await client.query(`SELECT COUNT(*) FROM hadith_judgment_hits`);
  console.log('Count:', hjhCount.rows[0].count);
  const hjhSample = await client.query(`SELECT * FROM hadith_judgment_hits LIMIT 3`);
  hjhSample.rows.forEach(r => console.log(JSON.stringify(r)));

  // Does narrator_grading have a 'Dic' or category field?
  console.log('\nnarrator_grading_terms columns:');
  const ngtCols = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='narrator_grading_terms' ORDER BY ordinal_position`);
  ngtCols.rows.forEach(r => console.log(r.column_name, '|', r.data_type));
  const ngtCount = await client.query(`SELECT COUNT(*) FROM narrator_grading_terms`);
  console.log('Count:', ngtCount.rows[0].count);
  const ngtSample = await client.query(`SELECT * FROM narrator_grading_terms LIMIT 5`);
  ngtSample.rows.forEach(r => console.log(JSON.stringify(r)));

  await client.end();
}
run().catch(e => { console.error(e.message); process.exit(1); });
