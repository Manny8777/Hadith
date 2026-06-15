const {Client}=require('pg');
const c=new Client({connectionString:'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',ssl:{rejectUnauthorized:false}});
c.connect().then(async ()=>{
  // Check what type IDs are in hadith_service_content 
  const r1 = await c.query("SELECT type_id, COUNT(*) FROM hadith_service_links GROUP BY type_id ORDER BY type_id");
  console.log("Service link type_id distribution:", JSON.stringify(r1.rows));
  
  // Check hadith_service_content columns
  const r2 = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='hadith_service_content' ORDER BY ordinal_position");
  console.log("hadith_service_content cols:", JSON.stringify(r2.rows));
  c.end();
}).catch(e=>{console.error(e.message);c.end()});
