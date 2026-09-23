const { Pool } = require('pg');
const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});

async function main() {
  // Check isnad_chains structure
  const { rows: sample } = await pool.query(
    `SELECT id, narrator_ids FROM isnad_chains LIMIT 3`
  );
  console.log('isnad_chains sample:');
  sample.forEach(r => console.log('  id:', r.id, '  narrator_ids:', r.narrator_ids));

  // Check isnad_hadiths
  const { rows: ih } = await pool.query(
    `SELECT COUNT(*) as total FROM isnad_hadiths`
  );
  console.log('\nisnad_hadiths total:', ih[0].total);

  // Find hadiths with narrator 822 in chain
  const { rows: hadithsForNarrator } = await pool.query(`
    SELECT DISTINCT ht.main_id, ht.tarf, b.title as book_name
    FROM isnad_hadiths iha
    JOIN isnad_chains ic ON iha.isnad_id = ic.id
    JOIN hadith_toc ht ON iha.hadith_id = ht.main_id
    JOIN books b ON b.id = ht.book_id
    WHERE ic.narrator_ids ~ '(^|[[:space:]])822([[:space:]]|$)'
    LIMIT 10
  `);
  console.log('\nHadiths with narrator 822 in chain:', hadithsForNarrator.length);
  hadithsForNarrator.forEach(r => console.log('  [' + r.book_name + '] ' + (r.tarf || '').substring(0, 80)));

  await pool.end();
}
main().catch(console.error);
