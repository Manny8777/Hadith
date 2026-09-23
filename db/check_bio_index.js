const { Pool } = require('pg');
const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    // Check narrator_biography indexes
    const { rows: idx } = await client.query(`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'narrator_biography'
    `);
    console.log('narrator_biography indexes:');
    idx.forEach(i => console.log(`  ${i.indexname}: ${i.indexdef?.slice(0, 150)}`));

    // Sample narrator_biography content
    const { rows: sample } = await client.query(`
      SELECT narrator_id, book_name, LEFT(content, 200) as content_start
      FROM narrator_biography LIMIT 3
    `);
    console.log('\nSample content:');
    sample.forEach(r => console.log(`  [${r.narrator_id}] ${r.book_name}: ${r.content_start}`));

    // Does bio search work with simple config?
    const { rows: bio_cnt } = await client.query(`
      SELECT COUNT(*) FROM narrator_biography
      WHERE to_tsvector('simple', coalesce(content,'')) @@ plainto_tsquery('simple', 'تدليس')
    `);
    console.log('\nBio search "تدليس":', bio_cnt[0].count);

    // Try with normalize_hadith
    const { rows: bio_cnt2 } = await client.query(`
      SELECT COUNT(*) FROM narrator_biography
      WHERE to_tsvector('simple', normalize_hadith(coalesce(content,''))) @@ plainto_tsquery('simple', normalize_hadith('تدليس'))
    `);
    console.log('Bio search normalized "تدليس":', bio_cnt2[0].count);

    // Check what the tsvector looks like for some content with tashkeel
    const { rows: tsvec } = await client.query(`
      SELECT LEFT(content, 100) as sample,
             to_tsvector('simple', LEFT(content, 100)) as tsv
      FROM narrator_biography LIMIT 1
    `);
    console.log('\nSample tsvector:', tsvec[0].tsv?.slice(0, 200));

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
