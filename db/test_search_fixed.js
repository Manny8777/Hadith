const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    const q = 'إنما الأعمال بالنيات';

    // Test the new approach: separate tarf + content queries with normalize_arabic
    const t = Date.now();
    const { rows } = await client.query(`
      SELECT h.main_id, h.book_name, LEFT(h.tarf, 80) as tarf,
             ts_rank(to_tsvector('simple', coalesce(h.tarf,'')),
                     plainto_tsquery('simple', normalize_arabic($1))) AS rank
      FROM hadith_toc h
      WHERE h.is_leaf = true
      AND (
        to_tsvector('simple', coalesce(h.tarf,'')) @@ plainto_tsquery('simple', normalize_arabic($1))
        OR to_tsvector('simple', coalesce(h.content,'')) @@ plainto_tsquery('simple', normalize_arabic($1))
      )
      ORDER BY rank DESC
      LIMIT 5
    `, [q]);
    console.log(`\nSearch for "${q}" (${Date.now()-t}ms):`);
    rows.forEach(r => console.log(`  [${r.main_id}] ${r.book_name} — ${r.tarf}`));

    // Also test without diacritics (what user would type)
    const q2 = 'انما الاعمال بالنيات';
    const t2 = Date.now();
    const { rows: r2 } = await client.query(`
      SELECT COUNT(*) as cnt FROM hadith_toc h
      WHERE h.is_leaf = true
      AND (
        to_tsvector('simple', coalesce(h.tarf,'')) @@ plainto_tsquery('simple', normalize_arabic($1))
        OR to_tsvector('simple', coalesce(h.content,'')) @@ plainto_tsquery('simple', normalize_arabic($1))
      )
    `, [q2]);
    console.log(`\nSearch for "${q2}" (${Date.now()-t2}ms): ${r2[0].cnt} results`);

    // Test count query
    const t3 = Date.now();
    const { rows: cnt } = await client.query(`
      SELECT COUNT(*) FROM hadith_toc WHERE is_leaf = true
      AND (
        to_tsvector('simple', coalesce(tarf,'')) @@ plainto_tsquery('simple', normalize_arabic($1))
        OR to_tsvector('simple', coalesce(content,'')) @@ plainto_tsquery('simple', normalize_arabic($1))
      )
    `, ['الصلاة']);
    console.log(`\nSearch "الصلاة" count: ${cnt[0].count} (${Date.now()-t3}ms)`);

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
