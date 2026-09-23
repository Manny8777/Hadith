const {Client} = require('pg');
const c = new Client({
  connectionString: require('./db/dbenv.js').url(),
  ssl: {rejectUnauthorized: false}
});

async function run() {
  await c.connect();
  // Get all table names first
  const tables = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  for (const row of tables.rows) {
    const t = row.table_name;
    const cnt = await c.query('SELECT COUNT(*) as n FROM ' + t);
    console.log(t + ': ' + cnt.rows[0].n);
  }
  await c.end();
}

run().catch(e => { console.error(e); process.exit(1); });
