const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  // Test performance of narrator isnad query
  const t0 = Date.now();
  const { rows } = await pool.query(`
    SELECT DISTINCT ht.main_id, ht.tarf, b.title as book_name, b.id as book_id
    FROM isnad_hadiths iha
    JOIN isnad_chains ic ON iha.isnad_id = ic.id
    JOIN hadith_toc ht ON iha.hadith_id = ht.main_id
    JOIN books b ON b.id = ht.book_id
    WHERE ic.narrator_ids ~ '(^|[[:space:]])822([[:space:]]|$)'
    LIMIT 20
  `);
  console.log('Narrator 822 isnad query: ' + (Date.now() - t0) + 'ms, rows:', rows.length);

  // Try narrator 1 (Prophet?)
  const t1 = Date.now();
  const { rows: r1 } = await pool.query(`
    SELECT COUNT(DISTINCT ht.main_id) as cnt
    FROM isnad_hadiths iha
    JOIN isnad_chains ic ON iha.isnad_id = ic.id
    JOIN hadith_toc ht ON iha.hadith_id = ht.main_id
    WHERE ic.narrator_ids ~ '(^|[[:space:]])822([[:space:]]|$)'
  `);
  console.log('Count query for 822: ' + (Date.now() - t1) + 'ms, total:', r1[0].cnt);

  // Check indexes on isnad_chains
  const { rows: indexes } = await pool.query(`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename = 'isnad_chains'
  `);
  console.log('\nIndexes on isnad_chains:');
  indexes.forEach(r => console.log(' ', r.indexname, '-', r.indexdef));

  await pool.end();
}
main().catch(console.error);
