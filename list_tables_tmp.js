const {Client}=require('pg');
const c=new Client({connectionString:'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',ssl:{rejectUnauthorized:false}});
c.connect()
  .then(()=>c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"))
  .then(r=>{console.log(JSON.stringify(r.rows));c.end()})
  .catch(e=>{console.error(e.message);c.end()});
