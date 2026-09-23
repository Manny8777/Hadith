const {Client}=require('pg');
const c=new Client({connectionString:require('./db/dbenv.js').url(),ssl:{rejectUnauthorized:false}});
c.connect().then(async ()=>{
  // Get counts of key tables already in Railway for comparison  
  const tables = ['hadith_toc','hadith_services','hadith_service_content','hadith_service_links','narrators','isnad_hadiths'];
  for(const t of tables){
    const r = await c.query("SELECT COUNT(*) FROM " + t);
    console.log(t + ":", r.rows[0].count);
  }
  c.end();
}).catch(e=>{console.error(e.message);c.end()});
