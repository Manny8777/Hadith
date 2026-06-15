const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway' });

async function run() {
  await client.connect();
  
  // NounsForms: ID, RawyID, RawyText, RawyTextID, RawyTextShape, Frequency
  // Check narrators table for RawyTextShape, RawyTextID-like columns
  console.log('=== narrators sample row ===');
  const ns = await client.query(`SELECT * FROM narrators LIMIT 1;`);
  console.log(JSON.stringify(ns.rows[0]));
  
  // NounsStat1: ID, Title, Count
  // Check if narrator_books table exists or has stat data
  console.log('\n=== narrator_books columns ===');
  const nb = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='narrator_books' ORDER BY ordinal_position;`);
  nb.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));
  const nbCount = await client.query(`SELECT COUNT(*) FROM narrator_books;`);
  console.log(`narrator_books count: ${nbCount.rows[0].count}`);
  const nbSample = await client.query(`SELECT * FROM narrator_books LIMIT 3;`);
  console.log('SAMPLE:', JSON.stringify(nbSample.rows));
  
  // HadithJudgmentScientists: ID, Name
  // hadith_judgments has scientist_id - is there a separate scientist table?
  // narrator_scientists has scientist_id, scientist_name
  console.log('\n=== narrator_scientists SAMPLE ===');
  const nsc = await client.query(`SELECT * FROM narrator_scientists LIMIT 3;`);
  console.log(JSON.stringify(nsc.rows));
  
  // ExpRawyModbaj: PrID, RawyID, RName, ShName, ShyoukhID, Dic
  // This looks like a denormalized narrator-sheikh join
  // Check isnad_relations or narrator_relations for this
  console.log('\n=== isnad_relations SAMPLE (first 3) ===');
  const ir = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='isnad_relations' ORDER BY ordinal_position;`);
  ir.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));
  const irCount = await client.query(`SELECT COUNT(*) FROM isnad_relations;`);
  console.log(`isnad_relations count: ${irCount.rows[0].count}`);
  
  await client.end();
}
run().catch(e => { console.error(e.message); process.exit(1); });
