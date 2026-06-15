const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway' });
client.connect().then(() => {
  return client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;");
}).then(res => {
  console.log(JSON.stringify(res.rows.map(r => r.table_name)));
  return client.end();
}).catch(e => { console.error(e.message); process.exit(1); });
