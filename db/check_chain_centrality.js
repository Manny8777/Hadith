const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    // Check if we have a way to count narrator appearances in chains
    // isnad_chains has narrator_id_array - each element is a narrator in the chain
    const { rows: sample } = await client.query(`
      SELECT narrator_id_array FROM isnad_chains LIMIT 3
    `);
    console.log('Sample chain arrays:', sample.map(r => r.narrator_id_array?.slice(0, 5)));

    // Count how many chains each narrator appears in
    // This is the centrality measure
    const t = Date.now();
    const { rows: top } = await client.query(`
      SELECT n.id, n.name, n.abb_name, n.martaba_ibn_hajar, n.is_companion,
             n.hadiths_count, chain_count
      FROM (
        SELECT nid, COUNT(*) as chain_count
        FROM isnad_chains, unnest(narrator_id_array) as nid
        GROUP BY nid
        ORDER BY chain_count DESC
        LIMIT 20
      ) t
      JOIN narrators n ON n.id = t.nid
      ORDER BY chain_count DESC
    `);
    console.log(`\nTop narrators by chain centrality (${Date.now()-t}ms):`);
    top.forEach(r => console.log(`  [${r.id}] ${r.abb_name || r.name} (${r.martaba_ibn_hajar || '?'}) — chains: ${r.chain_count}`));

    // What's the distribution of chain positions?
    // Position 1 = first in chain (most distant), last position = final narrator (Prophet's companion)
    const { rows: pos } = await client.query(`
      SELECT position, COUNT(*) as cnt
      FROM (
        SELECT generate_subscripts(narrator_id_array, 1) as position
        FROM isnad_chains
      ) t
      GROUP BY position
      ORDER BY position
    `);
    console.log('\nChain position distribution:');
    pos.slice(0, 10).forEach(r => console.log(`  Position ${r.position}: ${r.cnt} narrators`));

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
