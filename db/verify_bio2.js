const { Pool } = require('pg');
const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});

async function main() {
  // Find narrator with most diverse book sources
  const { rows: diverseNarrators } = await pool.query(`
    SELECT narrator_id, COUNT(DISTINCT book_name) as book_cnt, COUNT(*) as entry_cnt
    FROM narrator_biography
    GROUP BY narrator_id
    ORDER BY book_cnt DESC
    LIMIT 5
  `);
  console.log('Narrators with most diverse biography sources:');
  diverseNarrators.forEach(r => console.log('  narrator_id:', r.narrator_id, 'books:', r.book_cnt, 'entries:', r.entry_cnt));

  // Check what a typical تهذيب الكمال entry looks like
  const { rows: tehzib } = await pool.query(`
    SELECT narrator_id, title, LEFT(content, 200) as preview
    FROM narrator_biography
    WHERE book_name LIKE '%تهذيب الكمال%'
    ORDER BY id
    LIMIT 3
  `);
  console.log('\nSample تهذيب الكمال entries:');
  tehzib.forEach(r => console.log('  narrator:', r.narrator_id, '\n  title:', r.title, '\n  text:', r.preview, '\n'));

  // Check تقريب التهذيب entry
  const { rows: taqrib } = await pool.query(`
    SELECT narrator_id, title, LEFT(content, 200) as preview
    FROM narrator_biography
    WHERE book_name LIKE '%تقريب%'
    ORDER BY id
    LIMIT 3
  `);
  console.log('Sample تقريب التهذيب entries:');
  taqrib.forEach(r => console.log('  narrator:', r.narrator_id, '\n  title:', r.title, '\n  text:', r.preview, '\n'));

  // Check for a specific narrator (try narrator with id from diverse list)
  if (diverseNarrators.length > 0) {
    const testId = diverseNarrators[0].narrator_id;
    const { rows: sample } = await pool.query(`
      SELECT DISTINCT ON (main_id) book_name, title, LEFT(content, 100) as preview
      FROM narrator_biography
      WHERE narrator_id = $1
      ORDER BY main_id, book_name
    `, [testId]);
    const { rows: nar } = await pool.query('SELECT name FROM narrators WHERE id = $1', [testId]);
    console.log('All sources for', nar[0]?.name, '(id=' + testId + '):');
    sample.forEach(r => console.log('  [' + r.book_name + '] ' + r.title.substring(0, 60)));
  }

  await pool.end();
}
main().catch(console.error);
