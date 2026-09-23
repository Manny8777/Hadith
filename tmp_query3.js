const { Client } = require("pg");
const client = new Client({ connectionString: require('./db/dbenv.js').url() });
async function main() {
  await client.connect();
  
  // narrator_grading is the same as NounsGarh - a reference vocabulary of grading terms
  // narrator_criticism links narrators to scientist judgments
  // Let check columns of narrator_criticism
  let r = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='narrator_criticism' ORDER BY ordinal_position");
  console.log("narrator_criticism cols:", r.rows.map(x=>x.column_name).join(", "));
  
  // Full sample of narrator_criticism
  r = await client.query("SELECT * FROM narrator_criticism LIMIT 3");
  console.log("narrator_criticism sample:", JSON.stringify(r.rows, null, 2));

  // Find if there are NounsScientistsSays-like data
  // Check hadith_judgments table
  r = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='hadith_judgments' ORDER BY ordinal_position");
  console.log("hadith_judgments cols:", r.rows.map(x=>x.column_name).join(", "));
  
  r = await client.query("SELECT COUNT(*) FROM hadith_judgments");
  console.log("hadith_judgments count:", r.rows[0].count);
  
  r = await client.query("SELECT * FROM hadith_judgments LIMIT 5");
  console.log("hadith_judgments sample:", JSON.stringify(r.rows, null, 2));

  await client.end();
}
main().catch(e => { console.error(e.message); client.end(); });
