const { Pool } = require('pg');
const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    // Check indexes on isnad_chains
    const { rows: idx } = await client.query(`
      SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'isnad_chains'
    `);
    console.log('Indexes on isnad_chains:');
    idx.forEach(r => console.log(`  ${r.indexname}: ${r.indexdef}`));

    // Also check isnad_hadiths indexes
    const { rows: idx2 } = await client.query(`
      SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'isnad_hadiths'
    `);
    console.log('\nIndexes on isnad_hadiths:');
    idx2.forEach(r => console.log(`  ${r.indexname}: ${r.indexdef}`));

    // Test chain count for Tabarani (top narrator from previous session)
    // First find his ID
    const { rows: tabarani } = await client.query(`
      SELECT id, name FROM narrators WHERE name ILIKE '%الطبراني%' LIMIT 3
    `);
    console.log('\nTabarani ID:', tabarani);

    if (tabarani.length > 0) {
      const t = Date.now();
      const { rows: cnt } = await client.query(`
        SELECT COUNT(*) FROM isnad_chains WHERE $1 = ANY(narrator_id_array)
      `, [tabarani[0].id]);
      console.log(`Chain count for ${tabarani[0].name}: ${cnt[0].count} (${Date.now()-t}ms)`);
    }

    // Test for Abu Huraira (companion - probably also in many chains)
    const { rows: abu } = await client.query(`
      SELECT id, name FROM narrators WHERE name ILIKE '%أبو هريرة%' AND is_companion = true LIMIT 1
    `);
    if (abu.length > 0) {
      const t2 = Date.now();
      const { rows: cnt2 } = await client.query(`
        SELECT COUNT(*) FROM isnad_chains WHERE $1 = ANY(narrator_id_array)
      `, [abu[0].id]);
      console.log(`Chain count for ${abu[0].name}: ${cnt2[0].count} (${Date.now()-t2}ms)`);
    }

    // Check narrator_id_array column type
    const { rows: cols } = await client.query(`
      SELECT column_name, data_type, udt_name FROM information_schema.columns
      WHERE table_name = 'isnad_chains' AND column_name LIKE '%narrator%'
    `);
    console.log('\nisnad_chains narrator columns:', cols);

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
