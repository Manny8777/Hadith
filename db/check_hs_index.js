const { Pool } = require('pg');
const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    // Check indexes on hadith_subjects
    const { rows: idx } = await client.query(`
      SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'hadith_subjects'
    `);
    console.log('hadith_subjects indexes:', idx.map(i => i.indexname).join(', '));

    // Count subjects per hadith
    const { rows: sample } = await client.query(`
      SELECT paragraph_main_id, COUNT(*) FROM hadith_subjects
      WHERE paragraph_main_id = 5
      GROUP BY paragraph_main_id
    `);
    console.log('Subjects for hadith 5:', sample);

    // Test related hadiths query performance
    console.log('\nTesting related hadiths query...');
    const start = Date.now();
    const { rows: related } = await client.query(`
      SELECT DISTINCT ht.main_id, LEFT(ht.tarf, 100) as tarf, b.title as book_title
      FROM hadith_subjects hs_other
      JOIN hadith_toc ht ON ht.main_id = hs_other.paragraph_main_id
      JOIN books b ON b.id = ht.book_id
      WHERE hs_other.subject_id IN (
        SELECT subject_id FROM hadith_subjects WHERE paragraph_main_id = 5
      )
      AND hs_other.paragraph_main_id != 5
      LIMIT 5
    `);
    console.log(`Related hadiths query took ${Date.now() - start}ms`);
    console.log('Results:', related.length);

    // Alternative: use the book_id of the same book for efficiency
    const start2 = Date.now();
    const { rows: related2 } = await client.query(`
      SELECT DISTINCT ht.main_id, LEFT(ht.tarf, 100) as tarf, b.title as book_title
      FROM hadith_subjects hs_other
      JOIN hadith_toc ht ON ht.main_id = hs_other.paragraph_main_id
      JOIN books b ON b.id = ht.book_id
      WHERE hs_other.subject_id = (
        SELECT subject_id FROM hadith_subjects WHERE paragraph_main_id = 5 LIMIT 1
      )
      AND hs_other.paragraph_main_id != 5
      LIMIT 5
    `);
    console.log(`Single-subject query took ${Date.now() - start2}ms`);
    console.log('Results:', related2);

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
