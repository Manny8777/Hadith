const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT book_name, COUNT(*) as cnt
      FROM narrator_biography
      GROUP BY book_name
      ORDER BY cnt DESC
    `);
    console.log('Biography books:');
    rows.forEach(r => console.log(`  ${r.book_name}: ${r.cnt.toLocaleString()} entries`));
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
