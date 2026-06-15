const { Client } = require("pg");
const client = new Client({ connectionString: "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway" });
async function main() {
  await client.connect();
  
  // Check if narrator_grading and narrator_grading_terms are the same data
  let r = await client.query("SELECT COUNT(*) FROM narrator_grading");
  console.log("narrator_grading count:", r.rows[0].count);
  
  r = await client.query("SELECT COUNT(*) FROM narrator_grading_terms");
  console.log("narrator_grading_terms count:", r.rows[0].count);
  
  // narrator_grading columns
  r = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='narrator_grading' ORDER BY ordinal_position");
  console.log("narrator_grading cols:", r.rows.map(x=>x.column_name).join(", "));
  
  // See if narrator_criticism has a garh_id or link to terms
  r = await client.query("SELECT DISTINCT garh_label FROM narrator_criticism WHERE garh_label IS NOT NULL ORDER BY garh_label LIMIT 20");
  console.log("sample garh_labels in narrator_criticism:", r.rows.map(x=>x.garh_label));

  // How many distinct garh_labels?
  r = await client.query("SELECT COUNT(DISTINCT garh_label) FROM narrator_criticism WHERE garh_label IS NOT NULL");
  console.log("distinct garh_labels:", r.rows[0].count);

  // narrator_scientists count vs the JSON
  r = await client.query("SELECT COUNT(*) FROM narrator_scientists");
  console.log("narrator_scientists in DB:", r.rows[0].count);
  
  // narrator_biography
  r = await client.query("SELECT COUNT(*) FROM narrator_biography");
  console.log("narrator_biography count:", r.rows[0].count);
  
  r = await client.query("SELECT * FROM narrator_biography WHERE narrator_id = 3889 LIMIT 3");
  console.log("biography for 3889:", JSON.stringify(r.rows, null, 2));

  await client.end();
}
main().catch(e => { console.error(e.message); client.end(); });
