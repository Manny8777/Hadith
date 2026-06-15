const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log('Checking existing indexes on narrator_biography...');
  const { rows: idxs } = await pool.query(`
    SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'narrator_biography'
  `);
  idxs.forEach(i => console.log(' ', i.indexname, ':', i.indexdef.substring(0, 80)));

  console.log('\nCreating GIN full-text index on narrator_biography(content)...');
  await pool.query(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_narrator_biography_fts
    ON narrator_biography USING GIN (to_tsvector('simple', coalesce(content, '')))
  `);
  console.log('Index created.');

  // Test the index
  const start = Date.now();
  const { rows } = await pool.query(`
    SELECT COUNT(*) FROM narrator_biography
    WHERE to_tsvector('simple', coalesce(content, '')) @@ plainto_tsquery('simple', 'ثقة')
  `);
  const ms = Date.now() - start;
  console.log(`\nTest query "ثقة": ${rows[0].count} matches in ${ms}ms`);

  await pool.end();
}
main().catch(console.error);
