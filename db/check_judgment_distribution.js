const { Pool } = require('pg');
const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    // Check hadith_judgments indexes
    const { rows: idx } = await client.query(`
      SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'hadith_judgments'
    `);
    console.log('Indexes on hadith_judgments:');
    idx.forEach(r => console.log(`  ${r.indexname}: ${r.indexdef}`));

    // Check total and structure
    const { rows: info } = await client.query(`
      SELECT COUNT(*) as total,
             COUNT(DISTINCT hadith_id) as unique_hadiths,
             COUNT(DISTINCT scientist_id) as unique_scientists,
             MIN(hadith_id) as min_id, MAX(hadith_id) as max_id
      FROM hadith_judgments
    `);
    console.log('\nhadith_judgments stats:', info[0]);

    // Check columns
    const { rows: cols } = await client.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'hadith_judgments' ORDER BY ordinal_position
    `);
    console.log('\nColumns:', cols.map(c => c.column_name).join(', '));

    // Sample some judgment texts for a specific hadith
    const { rows: sample } = await client.query(`
      SELECT j.hadith_id, j.say_text, j.scientist_id, n.name as scientist_name
      FROM hadith_judgments j
      LEFT JOIN narrators n ON n.id = j.scientist_id
      WHERE j.hadith_id = 1
      LIMIT 5
    `);
    console.log('\nSample judgments for hadith 1:', sample);

    // Get grade summary for a hadith with many judgments
    const { rows: highJudge } = await client.query(`
      SELECT hadith_id, COUNT(*) as cnt FROM hadith_judgments
      GROUP BY hadith_id ORDER BY cnt DESC LIMIT 3
    `);
    console.log('\nHadiths with most judgments:', highJudge);

    // Grade breakdown for a specific hadith
    if (highJudge.length > 0) {
      const hid = highJudge[0].hadith_id;
      const { rows: grades } = await client.query(`
        SELECT
          COUNT(*) FILTER (WHERE say_text ~* 'صحيح') as sahih_count,
          COUNT(*) FILTER (WHERE say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح') as hasan_count,
          COUNT(*) FILTER (WHERE say_text ~* 'ضعيف|منكر|متروك|موضوع') as daif_count,
          COUNT(*) as total
        FROM hadith_judgments
        WHERE hadith_id = $1
      `, [hid]);
      console.log(`\nGrade breakdown for hadith ${hid}:`, grades[0]);
    }

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
