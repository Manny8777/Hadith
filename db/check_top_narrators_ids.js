const { Pool } = require('pg');
const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    // Get top narrators by chain count via centrality query - with their actual names
    const t = Date.now();
    const { rows } = await client.query(`
      SELECT n.id, n.name, n.abb_name, n.martaba_ibn_hajar, n.death_year_num,
             n.is_companion, t.chain_count
      FROM (
        SELECT nid, COUNT(*) as chain_count
        FROM isnad_chains, unnest(narrator_id_array) as nid
        GROUP BY nid
        ORDER BY chain_count DESC
        LIMIT 10
      ) t
      JOIN narrators n ON n.id = t.nid
      ORDER BY chain_count DESC
    `);
    console.log(`Top 10 narrators (${Date.now()-t}ms):`);
    rows.forEach(r => console.log(`  ID=${r.id} [${r.abb_name || r.name}] chains=${r.chain_count} death=${r.death_year_num} companion=${r.is_companion} grade=${r.martaba_ibn_hajar}`));

    // Now test chain count using GIN index for top 3
    for (const r of rows.slice(0, 3)) {
      const t2 = Date.now();
      const { rows: cnt } = await client.query(
        `SELECT COUNT(*) FROM isnad_chains WHERE $1 = ANY(narrator_id_array)`, [r.id]
      );
      console.log(`  [GIN] ${r.abb_name || r.name}: ${cnt[0].count} chains in ${Date.now()-t2}ms`);
    }

    // Check the narrator_id_array structure - do they use integer arrays or text IDs?
    const { rows: sample } = await client.query(`
      SELECT id, narrator_id_array, narrator_ids FROM isnad_chains LIMIT 2
    `);
    console.log('\nSample chain arrays:');
    sample.forEach(r => console.log(`  id=${r.id} narrator_id_array=${JSON.stringify(r.narrator_id_array)} narrator_ids=${r.narrator_ids?.slice(0, 50)}`));

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
