const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    // Check indexes on hadith_toc
    const { rows: indexes } = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'hadith_toc'
      ORDER BY indexname
    `);
    console.log('hadith_toc indexes:');
    indexes.forEach(i => console.log(`  ${i.indexname}: ${i.indexdef.slice(0, 120)}`));

    // Check if there's a tsvector column
    const { rows: cols } = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'hadith_toc'
      ORDER BY ordinal_position
    `);
    console.log('\nhadith_toc columns:');
    cols.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));

    // Check a sample search time with normalization
    const start = Date.now();
    await client.query(`
      SELECT COUNT(*) FROM hadith_toc
      WHERE is_leaf = true
      AND to_tsvector('simple', normalize_arabic(coalesce(tarf,'')) || ' ' || normalize_arabic(coalesce(content,'')))
          @@ plainto_tsquery('simple', normalize_arabic('إنما الأعمال'))
    `);
    console.log(`\nNormalized search time: ${Date.now() - start}ms`);

    // Compare with regular search
    const start2 = Date.now();
    await client.query(`
      SELECT COUNT(*) FROM hadith_toc
      WHERE is_leaf = true
      AND to_tsvector('simple', coalesce(tarf,'') || ' ' || coalesce(content,''))
          @@ plainto_tsquery('simple', 'إنما الأعمال')
    `);
    console.log(`Regular search time: ${Date.now() - start2}ms`);

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
