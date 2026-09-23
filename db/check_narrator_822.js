const { Pool } = require('pg');
const p = new Pool({ connectionString: require('./dbenv.js').url(), ssl: { rejectUnauthorized: false } });

async function run() {
  // Get ALL columns for narrator 822
  const r = await p.query(`SELECT * FROM narrators WHERE id = 822`);
  console.log('All columns for narrator 822:');
  console.log(JSON.stringify(r.rows[0], null, 2));

  // Get column names of the narrators table
  const cols = await p.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'narrators'
    ORDER BY ordinal_position`);
  console.log('\nAll columns in narrators table:');
  cols.rows.forEach(c => console.log(`  ${c.column_name} (${c.data_type})`));

  await p.end();
}
run().catch(e => { console.error(e.message); p.end(); });
