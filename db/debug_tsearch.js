const { Pool } = require('pg');
const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    // What tsvector does the Bukhari hadith 5 tarf produce?
    const { rows: tv } = await client.query(`
      SELECT
        tarf,
        to_tsvector('simple', coalesce(tarf,'')) as tsv
      FROM hadith_toc WHERE main_id = 5
    `);
    console.log('Tarf:', tv[0].tarf);
    console.log('Tsvector:', tv[0].tsv);

    // What does plainto_tsquery produce?
    const { rows: q1 } = await client.query(`SELECT plainto_tsquery('simple', 'إنما') as q`);
    const { rows: q2 } = await client.query(`SELECT plainto_tsquery('simple', 'الأعمال') as q`);
    const { rows: q3 } = await client.query(`SELECT plainto_tsquery('simple', normalize_arabic('إنما الأعمال بالنيات')) as q`);
    console.log('\ntsquery for إنما:', q1[0].q);
    console.log('tsquery for الأعمال:', q2[0].q);
    console.log('tsquery normalized إنما الأعمال بالنيات:', q3[0].q);

    // Does the tsvector match individual terms?
    const { rows: m1 } = await client.query(`
      SELECT to_tsvector('simple', coalesce(tarf,'')) @@ plainto_tsquery('simple', 'إنما') as matches
      FROM hadith_toc WHERE main_id = 5
    `);
    console.log('\nTarf matches إنما:', m1[0].matches);

    // Does it match الأعمال?
    const { rows: m2 } = await client.query(`
      SELECT to_tsvector('simple', coalesce(tarf,'')) @@ plainto_tsquery('simple', 'الأعمال') as matches
      FROM hadith_toc WHERE main_id = 5
    `);
    console.log('Tarf matches الأعمال:', m2[0].matches);

    // What about content?
    const { rows: m3 } = await client.query(`
      SELECT LEFT(content, 200) as content_start,
             to_tsvector('simple', coalesce(content,'')) @@ plainto_tsquery('simple', 'إنما') as matches_inma,
             to_tsvector('simple', coalesce(content,'')) @@ plainto_tsquery('simple', 'الأعمال') as matches_aamal
      FROM hadith_toc WHERE main_id = 5
    `);
    console.log('\nContent start:', m3[0].content_start);
    console.log('Content matches إنما:', m3[0].matches_inma);
    console.log('Content matches الأعمال:', m3[0].matches_aamal);

    // Check if the GIN index is being used
    const { rows: explain } = await client.query(`
      EXPLAIN (FORMAT TEXT)
      SELECT COUNT(*) FROM hadith_toc WHERE is_leaf = true
      AND to_tsvector('simple', coalesce(tarf,'')) @@ plainto_tsquery('simple', 'إنما')
    `);
    console.log('\nExplain (tarf index):');
    explain.forEach(r => console.log(' ', Object.values(r)[0]));

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
