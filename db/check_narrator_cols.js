const { Pool } = require('pg');
const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    const { rows: cols } = await client.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'narrators' ORDER BY ordinal_position
    `);
    console.log('Narrator columns:', cols.map(c => `${c.column_name}(${c.data_type})`).join('\n  '));

    // Full sample
    const { rows: sample } = await client.query(`SELECT * FROM narrators WHERE id = 1`);
    console.log('\nSample narrator:', JSON.stringify(sample[0], null, 2));

    // Check which columns have data
    for (const col of cols.map(c => c.column_name)) {
      const { rows: cnt } = await client.query(
        `SELECT COUNT(*) FROM narrators WHERE ${col} IS NOT NULL AND ${col}::text != ''`
      ).catch(() => ({ rows: [{ count: 'error' }] }));
      if (cnt[0].count !== '0' && cnt[0].count !== 'error') {
        console.log(`${col}: ${cnt[0].count} non-null`);
      }
    }

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
