const { Pool } = require('pg');
const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    // All tables
    const { rows: tables } = await client.query(`
      SELECT tablename, pg_size_pretty(pg_total_relation_size(quote_ident(tablename))) as size
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(quote_ident(tablename)) DESC
    `);
    console.log('All tables:');
    tables.forEach(t => console.log(`  ${t.tablename}: ${t.size}`));

    // Check narrator_similars or similar disambiguation tables
    const tableNames = tables.map(t => t.tablename);
    const interestingTables = tableNames.filter(n =>
      n.includes('simil') || n.includes('mubin') || n.includes('mix') ||
      n.includes('confus') || n.includes('mutasha') || n.includes('noun')
    );
    console.log('\nPotentially interesting tables:', interestingTables);

    // Check if there's data in narrator_relations
    const { rows: relStats } = await client.query(`
      SELECT is_sheikh, COUNT(*) FROM narrator_relations GROUP BY is_sheikh
    `);
    console.log('\nnarrator_relations stats:', relStats);

    // Check narrator_books for useful columns
    const { rows: nbCols } = await client.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'narrator_books'
    `);
    console.log('\nnarrator_books columns:', nbCols.map(c => c.column_name).join(', '));

    const { rows: nbSample } = await client.query(`SELECT * FROM narrator_books LIMIT 2`);
    console.log('narrator_books sample:', JSON.stringify(nbSample));

    // Check hadith_judgments
    const { rows: hjCols } = await client.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'hadith_judgments'
    `);
    console.log('\nhadith_judgments columns:', hjCols.map(c => c.column_name).join(', '));

    const { rows: hjSample } = await client.query(`SELECT * FROM hadith_judgments LIMIT 2`);
    console.log('hadith_judgments sample:', JSON.stringify(hjSample));

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
