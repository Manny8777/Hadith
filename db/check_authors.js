const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    // Count authors
    const { rows: cnt } = await client.query('SELECT COUNT(*) FROM authors');
    console.log('Total authors:', cnt[0].count);

    // Check books → authors link
    const { rows: booksWithAuth } = await client.query(`
      SELECT b.id, b.title, b.author_id, a.short_name, a.death_date
      FROM books b
      LEFT JOIN authors a ON a.id = b.author_id
      ORDER BY b.id
      LIMIT 20
    `);
    console.log('\nBooks with author info:');
    booksWithAuth.forEach(b => console.log(`  ${b.id}. ${b.title} — ${b.short_name || 'no author'} (ت ${b.death_date || '?'})`));

    // Check if all books have author IDs
    const { rows: noAuth } = await client.query(`SELECT COUNT(*) FROM books WHERE author_id IS NULL`);
    console.log('\nBooks without author_id:', noAuth[0].count);

    // Show some authors
    const { rows: authSample } = await client.query(`
      SELECT id, name, short_name, death_date FROM authors
      WHERE death_date > 0
      ORDER BY death_date
      LIMIT 10
    `);
    console.log('\nSample authors by death date:');
    authSample.forEach(a => console.log(`  [${a.id}] ${a.short_name} (ت ${a.death_date} هـ)`));

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
