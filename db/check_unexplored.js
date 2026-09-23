const { Pool } = require('pg');
const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    // narrator_grading columns
    const { rows: ngCols } = await client.query(`
      SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'narrator_grading' ORDER BY ordinal_position
    `);
    console.log('narrator_grading columns:', ngCols.map(c => `${c.column_name}(${c.data_type})`).join(', '));
    const { rows: ngSample } = await client.query(`SELECT * FROM narrator_grading LIMIT 3`);
    console.log('narrator_grading sample:', JSON.stringify(ngSample, null, 2));

    // narrator_relation_types
    const { rows: nrtCols } = await client.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'narrator_relation_types'
    `);
    console.log('\nnarrator_relation_types columns:', nrtCols.map(c => c.column_name).join(', '));
    const { rows: nrtAll } = await client.query(`SELECT * FROM narrator_relation_types LIMIT 20`);
    console.log('narrator_relation_types data:', JSON.stringify(nrtAll, null, 2));

    // narrator_relations with type info
    const { rows: nrCols } = await client.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'narrator_relations'
    `);
    console.log('\nnarrator_relations columns:', nrCols.map(c => c.column_name).join(', '));
    const { rows: nrSample } = await client.query(`SELECT * FROM narrator_relations LIMIT 5`);
    console.log('narrator_relations sample:', JSON.stringify(nrSample, null, 2));

    // authors table
    const { rows: authCols } = await client.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'authors' ORDER BY ordinal_position
    `);
    console.log('\nauthors columns:', authCols.map(c => c.column_name).join(', '));
    const { rows: authSample } = await client.query(`SELECT * FROM authors LIMIT 3`);
    console.log('authors sample:', JSON.stringify(authSample, null, 2));

    // hadith_subjects to see if it links to hadiths
    const { rows: hsCols } = await client.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'hadith_subjects' ORDER BY ordinal_position
    `);
    console.log('\nhadith_subjects columns:', hsCols.map(c => c.column_name).join(', '));
    const { rows: hsSample } = await client.query(`SELECT * FROM hadith_subjects LIMIT 3`);
    console.log('hadith_subjects sample:', JSON.stringify(hsSample, null, 2));

    // subject_items
    const { rows: siCols } = await client.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'subject_items' ORDER BY ordinal_position
    `);
    console.log('\nsubject_items columns:', siCols.map(c => c.column_name).join(', '));
    const { rows: siSample } = await client.query(`SELECT * FROM subject_items LIMIT 3`);
    console.log('subject_items sample:', JSON.stringify(siSample, null, 2));

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
