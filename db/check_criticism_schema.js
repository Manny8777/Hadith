const { Pool } = require('pg');
const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});

async function main() {
  // Check table structure
  const { rows: cols } = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'narrator_criticism'
    ORDER BY ordinal_position
  `);
  console.log('narrator_criticism columns:', cols.map(c => `${c.column_name}(${c.data_type})`).join(', '));

  // Sample rows for narrator 822
  const { rows } = await pool.query(`
    SELECT * FROM narrator_criticism WHERE narrator_id = 822 LIMIT 5
  `);
  console.log('\nSample for narrator 822 (Anas):');
  rows.forEach(r => console.log('  ', JSON.stringify(r)));

  // Total count
  const { rows: cnt } = await pool.query(`SELECT COUNT(*) FROM narrator_criticism`);
  console.log('\nTotal rows:', cnt[0].count);

  await pool.end();
}
main().catch(console.error);
