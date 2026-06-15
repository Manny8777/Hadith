const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    // Test sahih filter
    const t1 = Date.now();
    const { rows: r1 } = await client.query(`
      SELECT COUNT(DISTINCT h.main_id) FROM hadith_toc h
      WHERE h.is_leaf = true
      AND (
        to_tsvector('simple', normalize_hadith(coalesce(h.tarf,''))) @@ plainto_tsquery('simple', normalize_hadith('الصلاة'))
        OR to_tsvector('simple', normalize_hadith(coalesce(h.content,''))) @@ plainto_tsquery('simple', normalize_hadith('الصلاة'))
      )
      AND EXISTS (
        SELECT 1 FROM hadith_judgments j
        WHERE j.hadith_id = h.main_id
        AND j.say_text ~* 'صحيح|صحح|حسن صحيح'
      )
    `);
    console.log(`Sahih filter "الصلاة": ${r1[0].count} results in ${Date.now()-t1}ms`);

    // Test daif filter
    const t2 = Date.now();
    const { rows: r2 } = await client.query(`
      SELECT COUNT(DISTINCT h.main_id) FROM hadith_toc h
      WHERE h.is_leaf = true
      AND (
        to_tsvector('simple', normalize_hadith(coalesce(h.tarf,''))) @@ plainto_tsquery('simple', normalize_hadith('الصلاة'))
        OR to_tsvector('simple', normalize_hadith(coalesce(h.content,''))) @@ plainto_tsquery('simple', normalize_hadith('الصلاة'))
      )
      AND EXISTS (
        SELECT 1 FROM hadith_judgments j
        WHERE j.hadith_id = h.main_id
        AND j.say_text ~* 'ضعيف|ضعفه|منكر|متروك|موضوع'
      )
    `);
    console.log(`Daif filter "الصلاة": ${r2[0].count} results in ${Date.now()-t2}ms`);

    // Test hasan filter
    const t3 = Date.now();
    const { rows: r3 } = await client.query(`
      SELECT COUNT(DISTINCT h.main_id) FROM hadith_toc h
      WHERE h.is_leaf = true
      AND (
        to_tsvector('simple', normalize_hadith(coalesce(h.tarf,''))) @@ plainto_tsquery('simple', normalize_hadith('الصلاة'))
        OR to_tsvector('simple', normalize_hadith(coalesce(h.content,''))) @@ plainto_tsquery('simple', normalize_hadith('الصلاة'))
      )
      AND EXISTS (
        SELECT 1 FROM hadith_judgments j
        WHERE j.hadith_id = h.main_id
        AND j.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن'
        AND j.say_text !~* 'صحيح'
      )
    `);
    console.log(`Hasan filter "الصلاة": ${r3[0].count} results in ${Date.now()-t3}ms`);

    // No filter for comparison
    const t4 = Date.now();
    const { rows: r4 } = await client.query(`
      SELECT COUNT(DISTINCT h.main_id) FROM hadith_toc h
      WHERE h.is_leaf = true
      AND (
        to_tsvector('simple', normalize_hadith(coalesce(h.tarf,''))) @@ plainto_tsquery('simple', normalize_hadith('الصلاة'))
        OR to_tsvector('simple', normalize_hadith(coalesce(h.content,''))) @@ plainto_tsquery('simple', normalize_hadith('الصلاة'))
      )
    `);
    console.log(`No filter "الصلاة": ${r4[0].count} results in ${Date.now()-t4}ms`);

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
