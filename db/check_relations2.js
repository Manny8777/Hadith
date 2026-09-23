const { Pool } = require('pg');
const p = new Pool({ connectionString: require('./dbenv.js').url(), ssl: { rejectUnauthorized: false } });

async function run() {
  // Find narrator with most relations (to get a good test case)
  const top = await p.query(`
    SELECT n.id, n.name, COUNT(*) as rel_count
    FROM narrator_relations nr
    JOIN narrators n ON n.id = nr.first_id
    GROUP BY n.id, n.name ORDER BY rel_count DESC LIMIT 5`);
  console.log('Narrators with most relations (as first_id):', JSON.stringify(top.rows));

  // Sample 5 raw rows from narrator_relations to understand the data
  const sample = await p.query(`
    SELECT nr.first_id, nr.second_id, nr.is_sheikh, nr.relation_type,
           n1.name as first_name, n2.name as second_name
    FROM narrator_relations nr
    JOIN narrators n1 ON n1.id = nr.first_id
    JOIN narrators n2 ON n2.id = nr.second_id
    LIMIT 10`);
  console.log('\nSample relations:', JSON.stringify(sample.rows, null, 2));

  // Check is_sheikh distribution
  const dist = await p.query(`SELECT is_sheikh, COUNT(*) FROM narrator_relations GROUP BY is_sheikh`);
  console.log('\nis_sheikh distribution:', JSON.stringify(dist.rows));

  await p.end();
}
run().catch(e => { console.error(e.message); p.end(); });
