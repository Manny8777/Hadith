const {Client}=require('pg');
const c=new Client({connectionString:require('./db/dbenv.js').url(),ssl:{rejectUnauthorized:false}});
c.connect().then(async ()=>{
  // Check hadith_service_links (may be HadithServicesState) 
  const r1 = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='hadith_service_links' ORDER BY ordinal_position");
  console.log("hadith_service_links cols:", JSON.stringify(r1.rows));
  const r2 = await c.query("SELECT COUNT(*) FROM hadith_service_links");
  console.log("hadith_service_links count:", JSON.stringify(r2.rows));
  
  // Check hadith_services columns
  const r3 = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='hadith_services' ORDER BY ordinal_position");
  console.log("hadith_services cols:", JSON.stringify(r3.rows));
  const r4 = await c.query("SELECT COUNT(*) FROM hadith_services");
  console.log("hadith_services count:", JSON.stringify(r4.rows));
  c.end();
}).catch(e=>{console.error(e.message);c.end()});
