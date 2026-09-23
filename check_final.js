const { Client } = require('pg');
const client = new Client({ connectionString: require('./db/dbenv.js').url() });

async function run() {
  await client.connect();
  
  // HadithJudgmentScientists: ID, Name
  // hadith_judgments has scientist_id - does narrators table have those scientists?
  // Let's get distinct scientists from hadith_judgments and see if in narrators
  const hjSci = await client.query(`SELECT DISTINCT scientist_id FROM hadith_judgments LIMIT 5;`);
  console.log('hadith_judgments distinct scientist_ids (first 5):', JSON.stringify(hjSci.rows));
  
  // Check if those IDs exist in narrators
  const sciIds = hjSci.rows.map(r => r.scientist_id).join(',');
  const found = await client.query(`SELECT id, name FROM narrators WHERE id IN (${sciIds});`);
  console.log('Found in narrators:', JSON.stringify(found.rows));
  
  // NounsForms: ID, RawyID, RawyText, RawyTextID, RawyTextShape, Frequency
  // RawyText = narrator name variant; RawyTextShape = shaped/diacritical version
  // No table in Railway covers this - it's narrator name forms
  // narrators only has name, abb_name, name_normalized
  console.log('\n=== narrators name fields ===');
  const nameFields = await client.query(`SELECT id, name, abb_name, name_normalized FROM narrators WHERE id IN (3, 5, 7) LIMIT 3;`);
  console.log(JSON.stringify(nameFields.rows));
  
  // NounsStat1: ID, Title, Count
  // This is likely a stats/summary table with hadith counts per narrator by category
  // narrator_books has narrator_id, book_id - simplified
  // No direct equivalent found
  
  // ExpRawyModbaj: PrID, RawyID, RName, ShName, ShyoukhID, Dic
  // PrID = primary/sheikh ID, RawyID = narrator, denormalized sheikh-narrator pairs
  // narrator_relations: first_id, second_id, relation_type, is_sheikh - structural not named
  console.log('\n=== narrator_relations sample ===');
  const nr = await client.query(`SELECT * FROM narrator_relations LIMIT 5;`);
  console.log(JSON.stringify(nr.rows));
  
  // Check if ExpRawyModbaj might be mapped via narrator_relations + narrators
  // The ModBaj usually means "مُبَدَّج" - unusual/rare transmitter chains
  // It's a specialized derived table - not likely directly in Railway
  
  await client.end();
}
run().catch(e => { console.error(e.message); process.exit(1); });
