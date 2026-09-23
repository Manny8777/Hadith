const { Pool } = require('pg');
const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    console.log('Step 1: Creating strip_tashkeel and normalize_hadith functions...');
    await client.query(`DROP FUNCTION IF EXISTS strip_tashkeel(text) CASCADE`);
    await client.query(`DROP FUNCTION IF EXISTS normalize_hadith(text) CASCADE`);
    // Inline the tashkeel-stripping regex directly in normalize_hadith (avoids inter-function inlining issues)
    await client.query(`
      CREATE FUNCTION strip_tashkeel(text) RETURNS text AS $func$
        SELECT regexp_replace($1, E'[\\u064B-\\u065F\\u0670\\u0671]', '', 'g');
      $func$ LANGUAGE SQL IMMUTABLE STRICT;
    `);
    await client.query(`
      CREATE FUNCTION normalize_hadith(text) RETURNS text AS $func$
        SELECT replace(replace(replace(replace(replace(
          regexp_replace($1, E'[\\u064B-\\u065F\\u0670\\u0671]', '', 'g'),
          'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا'), 'ة', 'ه'), 'ى', 'ي');
      $func$ LANGUAGE SQL IMMUTABLE STRICT;
    `);
    console.log('Functions created.');

    // Verify functions work correctly
    const { rows: test } = await client.query(`
      SELECT
        strip_tashkeel('إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ') as stripped,
        normalize_hadith('إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ') as normalized,
        normalize_hadith('بِسْمِ اللهِ الرَّحْمَنِ الرَّحِيمِ') as bismillah
    `);
    console.log('Test results:');
    console.log('  Stripped:', test[0].stripped);
    console.log('  Normalized:', test[0].normalized);
    console.log('  Bismillah:', test[0].bismillah);

    // Check if normalized tarf matches query
    const { rows: m } = await client.query(`
      SELECT
        normalize_hadith(tarf) as norm_tarf,
        to_tsvector('simple', normalize_hadith(coalesce(tarf,''))) @@ plainto_tsquery('simple', normalize_arabic('إنما الأعمال')) as matches
      FROM hadith_toc WHERE main_id = 5
    `);
    console.log('\nMain_id 5 normalized tarf:', m[0].norm_tarf);
    console.log('Matches query "إنما الأعمال":', m[0].matches);

    console.log('\nStep 2: Creating GIN index on normalized tarf (CONCURRENTLY - may take a few minutes)...');
    const t1 = Date.now();
    await client.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hadith_toc_tarf_norm
      ON hadith_toc
      USING gin(to_tsvector('simple', normalize_hadith(coalesce(tarf,''))))
      WHERE is_leaf = true
    `);
    console.log(`Tarf index created in ${Math.round((Date.now()-t1)/1000)}s`);

    console.log('\nStep 3: Creating GIN index on normalized content...');
    const t2 = Date.now();
    await client.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hadith_toc_content_norm
      ON hadith_toc
      USING gin(to_tsvector('simple', normalize_hadith(coalesce(content,''))))
      WHERE is_leaf = true
    `);
    console.log(`Content index created in ${Math.round((Date.now()-t2)/1000)}s`);

    // Test search performance
    const t3 = Date.now();
    const { rows: r } = await client.query(`
      SELECT COUNT(*) FROM hadith_toc WHERE is_leaf = true
      AND (
        to_tsvector('simple', normalize_hadith(coalesce(tarf,''))) @@ plainto_tsquery('simple', normalize_arabic('إنما الأعمال بالنيات'))
        OR to_tsvector('simple', normalize_hadith(coalesce(content,''))) @@ plainto_tsquery('simple', normalize_arabic('إنما الأعمال بالنيات'))
      )
    `);
    console.log(`\nSearch "إنما الأعمال بالنيات": ${r[0].count} results in ${Date.now()-t3}ms`);

    const t4 = Date.now();
    const { rows: r2 } = await client.query(`
      SELECT COUNT(*) FROM hadith_toc WHERE is_leaf = true
      AND (
        to_tsvector('simple', normalize_hadith(coalesce(tarf,''))) @@ plainto_tsquery('simple', normalize_arabic('الصلاة'))
        OR to_tsvector('simple', normalize_hadith(coalesce(content,''))) @@ plainto_tsquery('simple', normalize_arabic('الصلاة'))
      )
    `);
    console.log(`Search "الصلاة": ${r2[0].count} results in ${Date.now()-t4}ms`);

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
