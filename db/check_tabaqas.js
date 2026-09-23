const { Pool } = require('pg');
const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const { rows } = await pool.query(`
    SELECT tabaqa, tabaqa_num, COUNT(*) as cnt
    FROM narrators
    WHERE tabaqa IS NOT NULL AND tabaqa != ''
    GROUP BY tabaqa, tabaqa_num
    ORDER BY tabaqa_num ASC NULLS LAST, cnt DESC
    LIMIT 30
  `);
  rows.forEach(r => console.log(`  [${r.tabaqa_num}] ${r.tabaqa}: ${r.cnt}`));

  // Also check death year range
  const { rows: dyears } = await pool.query(`
    SELECT MIN(death_year_num), MAX(death_year_num),
           COUNT(CASE WHEN death_year_num IS NOT NULL THEN 1 END) as with_year
    FROM narrators
  `);
  console.log('\nDeath year range:', dyears[0]);

  await pool.end();
}
main().catch(console.error);
