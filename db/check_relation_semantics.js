const { Pool } = require('pg');
const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    // Sample records for each relation type to understand semantics
    for (const typeId of [2, 3, 5, 7, 8]) {
      const { rows } = await client.query(`
        SELECT nr.first_id, n1.name as first_name, nr.second_id, n2.name as second_name, nr.is_sheikh,
               nrt.text as type_text
        FROM narrator_relations nr
        JOIN narrators n1 ON n1.id = nr.first_id
        JOIN narrators n2 ON n2.id = nr.second_id
        JOIN narrator_relation_types nrt ON nrt.id = nr.relation_type
        WHERE nr.relation_type = $1
        LIMIT 3
      `, [typeId]);
      console.log(`\nType ${typeId} (${rows[0]?.type_text}):`);
      rows.forEach(r => console.log(`  first: ${r.first_name} | second: ${r.second_name} | is_sheikh: ${r.is_sheikh}`));
    }

    // For tadlis (5), check: is the mudallis (one doing tadlis) first or second?
    const { rows: tadlisRows } = await client.query(`
      SELECT nr.first_id, n1.name as first_name, n1.martaba_ibn_hajar as g1,
             nr.second_id, n2.name as second_name, n2.martaba_ibn_hajar as g2,
             nr.is_sheikh
      FROM narrator_relations nr
      JOIN narrators n1 ON n1.id = nr.first_id
      JOIN narrators n2 ON n2.id = nr.second_id
      WHERE nr.relation_type = 5
      LIMIT 5
    `);
    console.log('\nTadlis detailed:');
    tadlisRows.forEach(r => console.log(`  ${r.first_name}[${r.g1}] — ${r.second_name}[${r.g2}] — is_sheikh: ${r.is_sheikh}`));

    // For ikhtilat (2), check semantics
    const { rows: ikRows } = await client.query(`
      SELECT nr.first_id, n1.name as first_name, nr.second_id, n2.name as second_name, nr.is_sheikh
      FROM narrator_relations nr
      JOIN narrators n1 ON n1.id = nr.first_id
      JOIN narrators n2 ON n2.id = nr.second_id
      WHERE nr.relation_type = 2
      LIMIT 3
    `);
    console.log('\nIkhtilat (2):');
    ikRows.forEach(r => console.log(`  ${r.first_name} | ${r.second_name} | is_sheikh: ${r.is_sheikh}`));

    // Check: are there any relations where type=5 and second_id is not in any first_id?
    // This would tell us if first_id is always the mudallis
    const { rows: allFirst } = await client.query(`
      SELECT COUNT(DISTINCT first_id) as count FROM narrator_relations WHERE relation_type = 5
    `);
    const { rows: allSecond } = await client.query(`
      SELECT COUNT(DISTINCT second_id) as count FROM narrator_relations WHERE relation_type = 5
    `);
    console.log('\nTadlis unique first_id narrators:', allFirst[0].count);
    console.log('Tadlis unique second_id narrators:', allSecond[0].count);

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
