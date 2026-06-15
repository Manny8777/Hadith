const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    // Distribution of garh_label values
    const { rows } = await client.query(`
      SELECT garh_label, COUNT(*) as cnt, COUNT(DISTINCT narrator_id) as narrators
      FROM narrator_criticism
      WHERE garh_label IS NOT NULL AND garh_label != ''
      GROUP BY garh_label
      ORDER BY cnt DESC
    `);
    console.log('Garh labels:');
    rows.forEach(r => console.log(`  "${r.garh_label}" — ${r.cnt} entries, ${r.narrators} narrators`));

    // Check takhrij table structure
    const { rows: tak } = await client.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'takhrij' ORDER BY ordinal_position
    `);
    console.log('\ntakhrij columns:', tak.map(c => c.column_name).join(', '));

    // Sample takhrij data
    const { rows: tCnt } = await client.query('SELECT COUNT(*) FROM takhrij');
    console.log('Takhrij count:', tCnt[0].count);

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
