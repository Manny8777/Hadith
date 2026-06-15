const { Client } = require("pg");
const client = new Client({ connectionString: "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway" });
async function main() {
  await client.connect();
  
  // Check narrator_grading table columns
  let r = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='narrator_grading' ORDER BY ordinal_position");
  console.log("narrator_grading cols:", r.rows.map(x=>x.column_name).join(", "));
  
  r = await client.query("SELECT COUNT(*) FROM narrator_grading");
  console.log("narrator_grading total:", r.rows[0].count);
  
  // Sample narrator_grading
  r = await client.query("SELECT * FROM narrator_grading LIMIT 5");
  console.log("narrator_grading sample:", JSON.stringify(r.rows, null, 2));

  // narrator_grading for 3889
  r = await client.query("SELECT ng.*, ngt.term_text FROM narrator_grading ng LEFT JOIN narrator_grading_terms ngt ON ng.term_id = ngt.id WHERE ng.narrator_id = 3889 LIMIT 10");
  console.log("narrator_grading for 3889:", JSON.stringify(r.rows, null, 2));

  // narrator_criticism columns  
  r = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='narrator_criticism' ORDER BY ordinal_position");
  console.log("narrator_criticism cols:", r.rows.map(x=>x.column_name).join(", "));

  // Count total says for 3889
  r = await client.query("SELECT COUNT(*) FROM narrator_criticism WHERE narrator_id = 3889");
  console.log("narrator_criticism for 3889 total:", r.rows[0].count);

  await client.end();
}
main().catch(e => { console.error(e.message); client.end(); });
