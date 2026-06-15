const {Client}=require('pg');
const c=new Client({connectionString:'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',ssl:{rejectUnauthorized:false}});
c.connect().then(async ()=>{
  // Count shawahed, modrag (mokhtalaf=controversial), ghareeb in hadith_services  
  const r1 = await c.query("SELECT COUNT(*) FROM hadith_services WHERE shawahed=true");
  const r2 = await c.query("SELECT COUNT(*) FROM hadith_services WHERE ghareeb=true");
  const r3 = await c.query("SELECT COUNT(*) FROM hadith_services WHERE mokhtalaf=true");
  console.log("shawahed=true:", r1.rows[0].count);
  console.log("ghareeb=true:", r2.rows[0].count);
  console.log("mokhtalaf=true:", r3.rows[0].count);
  
  // Check if hadith_services has kerat and modrag columns
  const r4 = await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='hadith_services'");
  console.log("All hadith_services cols:", r4.rows.map(r=>r.column_name).join(', '));
  c.end();
}).catch(e=>{console.error(e.message);c.end()});
