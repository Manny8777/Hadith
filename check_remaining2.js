const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway' });

async function run() {
  await client.connect();
  
  // NounsGarhLinks: RawyID, GarhID, SayID - links narrator to grading term and say
  // narrator_criticism has narrator_id, say_id, garh_label - might cover this
  // Let's check if GarhLinks data might be embedded in narrator_criticism
  console.log('=== narrator_criticism - check if it contains GarhLinks data ===');
  console.log('Columns: id, narrator_id, scientist_noun_id, scientist_name, say_text, say_sort, say_id, garh_label');
  
  // NounsScientistsSaysLinks: SayID, ServiceMainID, ISBookTocHadith, LinkID
  // This sounds like it links critic says to book references
  // Check narrator_biography for links
  console.log('\n=== narrator_biography - quick check for book links ===');
  const nbio = await client.query(`SELECT COUNT(*) FROM narrator_biography;`);
  console.log(`narrator_biography count: ${nbio.rows[0].count}`);
  
  // NounsTranslation: NounID, ServiceMainID - links narrator to a service/book reference
  // narrator_biography has narrator_id, main_id, book_id - might map this
  const nbioSample = await client.query(`SELECT * FROM narrator_biography LIMIT 2;`);
  console.log('narrator_biography SAMPLE:', JSON.stringify(nbioSample.rows));
  
  // narrator_books
  const nbooks = await client.query(`SELECT * FROM narrator_books LIMIT 3;`);
  console.log('\nnarrator_books SAMPLE:', JSON.stringify(nbooks.rows));
  
  // Check the HadithJudgmentScientists (ID, Name) vs narrator_scientists
  // NounsScientists also exists - let's check
  console.log('\n=== NounsScientists.json exists - checking Railway narrator_scientists ===');
  const nscCols = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='narrator_scientists' ORDER BY ordinal_position;`);
  nscCols.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));
  
  await client.end();
}
run().catch(e => { console.error(e.message); process.exit(1); });
