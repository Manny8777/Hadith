const { Client } = require('pg');
const client = new Client({
  connectionString: require('./db/dbenv.js').url()
});

async function run() {
  await client.connect();

  console.log('\n=== SCHEMA: ALL 4 ISNAD TABLES ===');
  const schema = await client.query(`SELECT table_name, column_name, data_type, character_maximum_length
    FROM information_schema.columns
    WHERE table_name IN ('isnad_tree','isnad_relations','isnad_relation_types','isnad_tahdeth')
    ORDER BY table_name, ordinal_position`);
  console.log(JSON.stringify(schema.rows, null, 2));

  console.log('\n=== isnad_relations WHERE hadith_main_id=2531 ===');
  const relations = await client.query('SELECT * FROM isnad_relations WHERE hadith_main_id=2531');
  console.log(JSON.stringify(relations.rows, null, 2));

  const sandIds = relations.rows.map(r => r.sand_id);
  console.log('\n=== isnad_tree for sand_ids:', sandIds, '===');
  if (sandIds.length > 0) {
    const tree = await client.query(`SELECT * FROM isnad_tree WHERE id = ANY($1)`, [sandIds]);
    console.log(JSON.stringify(tree.rows, null, 2));

    const parentIds = tree.rows.map(r => r.parent_id).filter(Boolean);
    if (parentIds.length > 0) {
      console.log('\n=== isnad_tree ANCESTORS (parent_ids):', parentIds, '===');
      const ancestors = await client.query(`SELECT * FROM isnad_tree WHERE id = ANY($1)`, [parentIds]);
      console.log(JSON.stringify(ancestors.rows, null, 2));

      // Go one more level up
      const grandParentIds = ancestors.rows.map(r => r.parent_id).filter(Boolean);
      if (grandParentIds.length > 0) {
        console.log('\n=== isnad_tree GRANDANCESTORS ===');
        const grandAncestors = await client.query(`SELECT * FROM isnad_tree WHERE id = ANY($1)`, [grandParentIds]);
        console.log(JSON.stringify(grandAncestors.rows, null, 2));
      }
    }
  }

  console.log('\n=== isnad_relation_types ALL ROWS ===');
  const relTypes = await client.query('SELECT * FROM isnad_relation_types ORDER BY id');
  console.log(JSON.stringify(relTypes.rows, null, 2));

  console.log('\n=== isnad_tahdeth WHERE id IN (sand_ids) ===');
  if (sandIds.length > 0) {
    const tahdeth = await client.query(`SELECT * FROM isnad_tahdeth WHERE id = ANY($1)`, [sandIds]);
    console.log(JSON.stringify(tahdeth.rows, null, 2));
  }

  console.log('\n=== isnad_tree SAMPLE (first 5 rows) ===');
  const sample = await client.query('SELECT * FROM isnad_tree LIMIT 5');
  console.log(JSON.stringify(sample.rows, null, 2));

  await client.end();
}

run().catch(console.error);
