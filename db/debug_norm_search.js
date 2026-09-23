const { Pool } = require('pg');
const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    // Check what normalize_arabic returns
    const { rows: nr } = await client.query(`SELECT normalize_arabic('إنما الأعمال بالنيات') as normalized`);
    console.log('normalize_arabic result:', nr[0].normalized);

    // Check a known hadith's raw tarf
    const { rows: sample } = await client.query(`
      SELECT main_id, tarf, normalize_arabic(coalesce(tarf,'')) as norm_tarf
      FROM hadith_toc
      WHERE is_leaf = true AND tarf ILIKE '%إنما الأعمال%'
      LIMIT 3
    `);
    console.log('\nSample hadiths with إنما الأعمال:');
    sample.forEach(r => console.log(`  [${r.main_id}] tarf: ${r.tarf?.slice(0,60)} | norm: ${r.norm_tarf?.slice(0,60)}`));

    // Try plainto_tsquery
    const { rows: qr } = await client.query(`SELECT plainto_tsquery('simple', normalize_arabic('انما الاعمال')) as tsq`);
    console.log('\ntsquery:', qr[0].tsq);

    // Check tsvector for a sample
    if (sample.length > 0) {
      const { rows: tvr } = await client.query(
        `SELECT to_tsvector('simple', normalize_arabic(coalesce(tarf,'') || ' ' || coalesce(content,''))) as tsv
         FROM hadith_toc WHERE main_id = $1`,
        [sample[0].main_id]
      );
      const tsv = tvr[0].tsv;
      // Show first 200 chars
      console.log('\ntsvector tokens (first 200 chars):', tsv?.slice(0, 200));
    }

    // Direct search with ILIKE normalized
    const { rows: ilike } = await client.query(`
      SELECT COUNT(*) FROM hadith_toc
      WHERE is_leaf = true
      AND normalize_arabic(coalesce(tarf,'') || ' ' || coalesce(content,'')) ILIKE '%انما الاعمال%'
    `);
    console.log('\nILIKE normalized count:', ilike[0].count);

    // Test FTS search directly
    const { rows: fts } = await client.query(`
      SELECT COUNT(*) FROM hadith_toc
      WHERE is_leaf = true
      AND to_tsvector('simple', normalize_arabic(coalesce(tarf,'') || ' ' || coalesce(content,'')))
          @@ plainto_tsquery('simple', 'انما الاعمال')
    `);
    console.log('FTS normalized count (literal):', fts[0].count);

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
