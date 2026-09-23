const {Client}=require('pg');
const c=new Client({connectionString:require('./db/dbenv.js').url(),ssl:{rejectUnauthorized:false}});
c.connect().then(async ()=>{
  // Check if hadith_service_content has type linking to controversial tree
  const r1 = await c.query("SELECT COUNT(*) FROM hadith_services WHERE mokhtalaf=true");
  console.log("Hadiths flagged mokhtalaf (controversial):", r1.rows[0].count);
  
  // Check hadith_service_types to see if controversial/mokhtalaf type exists 
  const r2 = await c.query("SELECT * FROM hadith_service_types LIMIT 20");
  console.log("Service types:", JSON.stringify(r2.rows));
  
  // Check if Railway is missing kerat/modrag/countries/properName in hadith_services
  const r3 = await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='hadith_services' ORDER BY ordinal_position");
  console.log("hadith_services columns:", r3.rows.map(r=>r.column_name).join(', '));
  c.end();
}).catch(e=>{console.error(e.message);c.end()});
