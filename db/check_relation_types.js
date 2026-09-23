const { Pool } = require('pg');
const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT nrt.id, nrt.text, COUNT(nr.first_id) as cnt
      FROM narrator_relation_types nrt
      LEFT JOIN narrator_relations nr ON nr.relation_type = nrt.id
      GROUP BY nrt.id, nrt.text
      ORDER BY nrt.id
    `);
    console.log('Relation types:');
    rows.forEach(r => console.log(`  [${r.id}] ${r.text} — ${r.cnt} relations`));

    // Also check journey_city data
    const { rows: cities } = await client.query(`
      SELECT COALESCE(death_city, living_city) as city, COUNT(*) as cnt
      FROM narrators
      WHERE death_city IS NOT NULL OR living_city IS NOT NULL
      GROUP BY COALESCE(death_city, living_city)
      ORDER BY cnt DESC
      LIMIT 20
    `);
    console.log('\nTop cities (death/living):');
    cities.forEach(c => console.log(`  ${c.city}: ${c.cnt}`));

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
