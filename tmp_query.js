const { Client } = require("pg");
const client = new Client({ connectionString: require('./db/dbenv.js').url() });
async function main() {
  await client.connect();
  
  // Get narrators columns
  let r = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='narrators' ORDER BY ordinal_position");
  console.log("narrators cols:", r.rows.map(x=>x.column_name).join(", "));
  
  // Get all tables
  r = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  console.log("Tables:", r.rows.map(x=>x.table_name).join(", "));
  
  // Count narrator_criticism
  r = await client.query("SELECT COUNT(*) FROM narrator_criticism");
  console.log("narrator_criticism total:", r.rows[0].count);
  
  // Grading for narrator 3889
  r = await client.query("SELECT * FROM narrator_criticism WHERE narrator_id = 3889 LIMIT 10");
  console.log("narrator_criticism for 3889 (Abu Bakr ibn Abi Shayba):", JSON.stringify(r.rows, null, 2));

  // narrator_grading_terms
  r = await client.query("SELECT COUNT(*) FROM narrator_grading_terms");
  console.log("narrator_grading_terms count:", r.rows[0].count);
  
  r = await client.query("SELECT * FROM narrator_grading_terms ORDER BY sort_order, id LIMIT 15");
  console.log("grading terms sample:", JSON.stringify(r.rows, null, 2));

  // narrator_scientists count
  r = await client.query("SELECT COUNT(*) FROM narrator_scientists");
  console.log("narrator_scientists total:", r.rows[0].count);

  // narrator for 3889 full
  r = await client.query("SELECT * FROM narrators WHERE id = 3889");
  console.log("Full narrator 3889:", JSON.stringify(r.rows, null, 2));

  await client.end();
}
main().catch(e => { console.error(e.message); client.end(); });
