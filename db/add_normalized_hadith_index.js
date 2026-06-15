const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    console.log('Creating normalized hadith GIN index (this may take 5-10 minutes)...');
    const start = Date.now();

    // Create index CONCURRENTLY so it doesn't block reads
    await client.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hadith_toc_normalized
      ON hadith_toc
      USING gin (
        to_tsvector('simple', normalize_arabic(coalesce(tarf,'') || ' ' || coalesce(content,'')))
      )
      WHERE is_leaf = true
    `);

    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`Index created in ${elapsed}s`);

    // Test the new index
    const t = Date.now();
    const { rows } = await client.query(`
      SELECT COUNT(*) FROM hadith_toc
      WHERE is_leaf = true
      AND to_tsvector('simple', normalize_arabic(coalesce(tarf,'') || ' ' || coalesce(content,'')))
          @@ plainto_tsquery('simple', normalize_arabic('إنما الأعمال'))
    `);
    console.log(`Test query returned ${rows[0].count} results in ${Date.now()-t}ms`);

    // Also test with alef-less form
    const t2 = Date.now();
    const { rows: r2 } = await client.query(`
      SELECT COUNT(*) FROM hadith_toc
      WHERE is_leaf = true
      AND to_tsvector('simple', normalize_arabic(coalesce(tarf,'') || ' ' || coalesce(content,'')))
          @@ plainto_tsquery('simple', normalize_arabic('انما الاعمال'))
    `);
    console.log(`Normalized query (انما الاعمال): ${r2[0].count} results in ${Date.now()-t2}ms`);

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
