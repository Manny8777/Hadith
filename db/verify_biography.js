const { Pool } = require('pg');
const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const { rows: cnt } = await pool.query(
    'SELECT COUNT(*) as total, COUNT(DISTINCT narrator_id) as narrators FROM narrator_biography'
  );
  console.log('Total:', cnt[0].total, '| Narrators:', cnt[0].narrators);

  const { rows: sample } = await pool.query(
    `SELECT narrator_id, book_name, title, LEFT(content, 120) as preview
     FROM narrator_biography WHERE narrator_id = 822 ORDER BY id LIMIT 6`
  );
  console.log('\nBiography for narrator 822:');
  sample.forEach(r => {
    console.log('  [' + r.book_name + ']');
    console.log('   title: ' + r.title);
    console.log('   text: ' + r.preview);
    console.log('');
  });

  // Check which books appear in biography
  const { rows: books } = await pool.query(
    `SELECT book_name, COUNT(*) as cnt FROM narrator_biography
     GROUP BY book_name ORDER BY cnt DESC LIMIT 20`
  );
  console.log('Top biography books:');
  books.forEach(r => console.log('  ' + r.book_name + ': ' + r.cnt + ' entries'));

  await pool.end();
}
main().catch(console.error);
