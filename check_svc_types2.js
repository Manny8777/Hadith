const {Client}=require('pg');
const c=new Client({connectionString:'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',ssl:{rejectUnauthorized:false}});
c.connect().then(async ()=>{
  const r = await c.query("SELECT * FROM hadith_service_types WHERE id=17 OR id=1 OR id=13 OR id=14 OR id=15 OR id=16");
  console.log("Service types 1,13-17:", JSON.stringify(r.rows));
  const r2 = await c.query("SELECT id, name, column_key FROM hadith_service_types ORDER BY id");
  console.log("All service types:", JSON.stringify(r2.rows));
  c.end();
}).catch(e=>{console.error(e.message);c.end()});
