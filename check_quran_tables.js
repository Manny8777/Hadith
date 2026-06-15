const {Client}=require('pg');
const c=new Client({connectionString:'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',ssl:{rejectUnauthorized:false}});
c.connect().then(async ()=>{
  // Check for quran-like and hadith-extra tables
  const checks = [
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%quran%'",
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%shawahed%'",
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%modrag%'",
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%ghareeb%'",
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%controv%'",
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%reader%'",
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%ayat%'",
  ];
  for(const sql of checks){
    const r=await c.query(sql);
    console.log(sql.split("LIKE")[1]+" => "+JSON.stringify(r.rows));
  }
  c.end();
}).catch(e=>{console.error(e.message);c.end()});
