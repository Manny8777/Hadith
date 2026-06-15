const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    // Check subject_categories
    const { rows: scCols } = await client.query(`
      SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'subject_categories'
    `);
    console.log('subject_categories columns:', scCols.map(c => c.column_name).join(', '));
    const { rows: scCount } = await client.query('SELECT COUNT(*) FROM subject_categories');
    console.log('subject_categories count:', scCount[0].count);
    const { rows: scSample } = await client.query('SELECT * FROM subject_categories LIMIT 3');
    console.log('subject_categories sample:', JSON.stringify(scSample, null, 2));

    // Check if subject_id in hadith_subjects links to subject_items or categories
    const { rows: siCount } = await client.query('SELECT COUNT(*) FROM subject_items');
    console.log('\nsubject_items count:', siCount[0].count);

    // Check max IDs
    const { rows: maxIds } = await client.query('SELECT MAX(id) FROM subject_items');
    const { rows: maxHsIds } = await client.query('SELECT MAX(subject_id) FROM hadith_subjects');
    console.log('subject_items max ID:', maxIds[0].max);
    console.log('hadith_subjects max subject_id:', maxHsIds[0].max);

    // Try joining
    const { rows: joined } = await client.query(`
      SELECT hs.paragraph_main_id, si.title
      FROM hadith_subjects hs
      JOIN subject_items si ON si.id = hs.subject_id
      LIMIT 5
    `);
    console.log('\nJoin sample (hs → subject_items):', JSON.stringify(joined, null, 2));

    // narrator_relations with type names — let's see what types are most common
    const { rows: relTypes } = await client.query(`
      SELECT nrt.text, COUNT(*) as cnt
      FROM narrator_relations nr
      JOIN narrator_relation_types nrt ON nrt.id = nr.relation_type
      GROUP BY nrt.text
      ORDER BY cnt DESC
    `);
    console.log('\nnarrator_relations by type:');
    relTypes.forEach(r => console.log(`  ${r.text}: ${r.cnt}`));

    // Examples of التدليس (type=5) relations
    const { rows: tadlisExamples } = await client.query(`
      SELECT nr.first_id, n1.name as first_name, nr.second_id, n2.name as second_name, nr.is_sheikh
      FROM narrator_relations nr
      JOIN narrators n1 ON n1.id = nr.first_id
      JOIN narrators n2 ON n2.id = nr.second_id
      WHERE nr.relation_type = 5
      LIMIT 5
    `);
    console.log('\nTadlis examples (type=5):');
    tadlisExamples.forEach(r => console.log(`  ${r.first_name} → ${r.second_name} (is_sheikh=${r.is_sheikh})`));

    // Examples of الإرسال (type=3) relations
    const { rows: irsalExamples } = await client.query(`
      SELECT nr.first_id, n1.name as first_name, nr.second_id, n2.name as second_name, nr.is_sheikh
      FROM narrator_relations nr
      JOIN narrators n1 ON n1.id = nr.first_id
      JOIN narrators n2 ON n2.id = nr.second_id
      WHERE nr.relation_type = 3
      LIMIT 5
    `);
    console.log('\nIrsal examples (type=3):');
    irsalExamples.forEach(r => console.log(`  ${r.first_name} → ${r.second_name} (is_sheikh=${r.is_sheikh})`));

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
