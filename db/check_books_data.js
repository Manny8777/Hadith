const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    // Check books table columns
    const { rows: cols } = await client.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'books' ORDER BY ordinal_position
    `);
    console.log('Books columns:', cols.map(c => `${c.column_name}(${c.data_type})`).join(', '));

    const { rows: books } = await client.query(`SELECT * FROM books WHERE id IN (1,2,3,4,5,6,7,8) ORDER BY id`);
    console.log('\nBooks data:');
    books.forEach(b => console.log(JSON.stringify(b)));

    // Check narrator_books to see what columns it has
    const { rows: nbCols } = await client.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'narrator_books'
    `);
    console.log('\nnarrator_books columns:', nbCols.map(c => c.column_name).join(', '));

    // Check hadith_toc columns
    const { rows: htCols } = await client.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'hadith_toc' ORDER BY ordinal_position LIMIT 20
    `);
    console.log('\nhadith_toc columns:', htCols.map(c => c.column_name).join(', '));

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
