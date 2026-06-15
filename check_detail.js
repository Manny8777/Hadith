const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway' });

async function run() {
  await client.connect();
  
  // NounsGarh.json has ID, Text, Sort, IsTaqreeb
  // narrator_grading has id, text, sort, is_taqreeb - SAME COUNT (5745)?
  // Let's verify the NounsGarh.json count matches narrator_grading
  
  // Check NounsScientistsSays -> narrator_criticism
  console.log('\n=== narrator_criticism columns ===');
  const nc = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='narrator_criticism' ORDER BY ordinal_position;`);
  nc.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));
  const ncCount = await client.query(`SELECT COUNT(*) FROM narrator_criticism;`);
  console.log(`narrator_criticism count: ${ncCount.rows[0].count}`);
  const ncSample = await client.query(`SELECT * FROM narrator_criticism LIMIT 3;`);
  console.log('SAMPLE:', JSON.stringify(ncSample.rows));
  
  // Check narrator_relations -> NounsShyoukhTalamize
  console.log('\n=== narrator_relations columns ===');
  const nr = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='narrator_relations' ORDER BY ordinal_position;`);
  nr.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));
  
  // Check narrators table for NounsForms fields
  console.log('\n=== narrators columns (all) ===');
  const narr = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='narrators' ORDER BY ordinal_position;`);
  narr.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));
  
  // Check hadith_judgments -> HadithJudgmentScientists
  console.log('\n=== hadith_judgments columns ===');
  const hj = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='hadith_judgments' ORDER BY ordinal_position;`);
  hj.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));
  
  await client.end();
}
run().catch(e => { console.error(e.message); process.exit(1); });
