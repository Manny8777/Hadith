const { Pool } = require('pg');
const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    // Total judgment records
    const { rows: cnt } = await client.query('SELECT COUNT(*) FROM hadith_judgments');
    console.log('Total judgments:', cnt[0].count);

    // Sample judgments
    const { rows: sample } = await client.query(`
      SELECT j.hadith_id, j.say_text, n.name as scientist, n.abb_name
      FROM hadith_judgments j
      LEFT JOIN narrators n ON n.id = j.scientist_id
      LIMIT 10
    `);
    console.log('\nSample judgments:');
    sample.forEach(r => console.log(`  [${r.hadith_id}] ${r.scientist || 'N/A'}: ${r.say_text?.slice(0, 60)}`));

    // Columns
    const { rows: cols } = await client.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'hadith_judgments' ORDER BY ordinal_position
    `);
    console.log('\nhadith_judgments columns:', cols.map(c => `${c.column_name}(${c.data_type})`).join(', '));

    // How many hadiths have judgments?
    const { rows: hcnt } = await client.query(`
      SELECT COUNT(DISTINCT hadith_id) FROM hadith_judgments
    `);
    console.log('\nHadiths with judgments:', hcnt[0].count);

    // Common say_text patterns
    const { rows: common } = await client.query(`
      SELECT say_text, COUNT(*) as cnt
      FROM hadith_judgments
      WHERE say_text IS NOT NULL
      GROUP BY say_text
      ORDER BY cnt DESC
      LIMIT 15
    `);
    console.log('\nMost common judgment texts:');
    common.forEach(r => console.log(`  "${r.say_text}" — ${r.cnt} times`));

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
