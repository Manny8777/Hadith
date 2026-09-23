const { Client } = require('pg');
const client = new Client({ connectionString: require('./db/dbenv.js').url() });
client.connect().then(() => {
  return client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;");
}).then(res => {
  console.log(JSON.stringify(res.rows.map(r => r.table_name)));
  return client.end();
}).catch(e => { console.error(e.message); process.exit(1); });
