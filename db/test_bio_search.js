const { Pool } = require('pg');
const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});

async function test(q) {
  const start = Date.now();
  const { rows } = await pool.query(`
    SELECT nb.narrator_id, nb.book_name, LEFT(nb.content, 100) as excerpt,
           n.name as narrator_name
    FROM narrator_biography nb
    JOIN narrators n ON n.id = nb.narrator_id
    WHERE to_tsvector('simple', coalesce(nb.content, '')) @@ plainto_tsquery('simple', $1)
    ORDER BY nb.narrator_id, nb.book_name
    LIMIT 20
  `, [q]);
  const ms = Date.now() - start;
  console.log(`"${q}": ${rows.length} results in ${ms}ms`);
  if (rows.length > 0) console.log('  First:', rows[0].narrator_name, '-', rows[0].book_name);
}

async function main() {
  await test('البصري');
  await test('الكوفي الثقة');
  await test('سفيان الثوري');
  await test('مدلس');
  await pool.end();
}
main().catch(console.error);
