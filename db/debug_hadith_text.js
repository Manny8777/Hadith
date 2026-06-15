const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    // How many is_leaf rows have tarf vs content
    const { rows: coverage } = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN tarf IS NOT NULL AND tarf != '' THEN 1 END) as has_tarf,
        COUNT(CASE WHEN content IS NOT NULL AND content != '' THEN 1 END) as has_content
      FROM hadith_toc WHERE is_leaf = true
    `);
    console.log('Coverage:', coverage[0]);

    // What does a known hadith look like (إنما الأعمال is in book 1 - Bukhari)
    const { rows: sample } = await client.query(`
      SELECT main_id, book_id, LEFT(tarf, 100) as tarf, LEFT(content, 100) as content,
             is_leaf, is_paragraph
      FROM hadith_toc
      WHERE book_id = 1
      LIMIT 5
    `);
    console.log('\nSample Bukhari rows:');
    sample.forEach(r => console.log(JSON.stringify(r)));

    // Search the actual content for إنما الأعمال
    const { rows: found } = await client.query(`
      SELECT main_id, book_id, LEFT(tarf, 80) as tarf, LEFT(content, 80) as content
      FROM hadith_toc
      WHERE content ILIKE '%إنما الأعمال%' OR tarf ILIKE '%إنما الأعمال%'
      LIMIT 5
    `);
    console.log('\nRows with إنما الأعمال:');
    found.forEach(r => console.log(JSON.stringify(r)));

    // Are leaf=true rows the actual hadiths?
    const { rows: leaf } = await client.query(`
      SELECT main_id, is_leaf, is_paragraph, LEFT(tarf, 60) as tarf, LEFT(content, 60) as content
      FROM hadith_toc WHERE is_leaf = true LIMIT 3
    `);
    console.log('\nLeaf rows:');
    leaf.forEach(r => console.log(JSON.stringify(r)));

    // What about regular search - does it find إنما الأعمال?
    const { rows: fts } = await client.query(`
      SELECT COUNT(*) FROM hadith_toc
      WHERE is_leaf = true
      AND to_tsvector('simple', coalesce(tarf,'') || ' ' || coalesce(content,''))
          @@ plainto_tsquery('simple', 'إنما الأعمال')
    `);
    console.log('\nFTS with original text:', fts[0].count);

    // What does the existing search index look like?
    const { rows: idx_test } = await client.query(`
      SELECT COUNT(*) FROM hadith_toc
      WHERE is_leaf = true
      AND to_tsvector('simple', coalesce(tarf,'')) @@ plainto_tsquery('simple', 'إنما')
    `);
    console.log('tarf tsvector إنما count:', idx_test[0].count);

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
