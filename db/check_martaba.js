const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    // Distribution of martaba_ibn_hajar
    const { rows } = await client.query(`
      SELECT martaba_ibn_hajar, COUNT(*) as cnt
      FROM narrators
      WHERE martaba_ibn_hajar IS NOT NULL AND martaba_ibn_hajar != ''
      GROUP BY martaba_ibn_hajar
      ORDER BY cnt DESC
      LIMIT 30
    `);
    console.log('Top martaba_ibn_hajar values:');
    rows.forEach(r => console.log(`  "${r.martaba_ibn_hajar}" — ${r.cnt}`));

    // Total with and without grade
    const { rows: totals } = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE martaba_ibn_hajar IS NOT NULL AND martaba_ibn_hajar != '') as has_grade,
        COUNT(*) FILTER (WHERE is_companion = true) as companions
      FROM narrators
    `);
    console.log('\nTotals:', totals[0]);

    // Also check what "chain position" data tells us -
    // where do companions appear relative to others?
    // Position in chain: 1=latest narrator (book author), last=closest to Prophet
    const { rows: compCheck } = await client.query(`
      SELECT n.martaba_ibn_hajar, COUNT(*) as cnt
      FROM narrators n
      WHERE n.is_companion = true
      GROUP BY n.martaba_ibn_hajar
      ORDER BY cnt DESC
      LIMIT 10
    `);
    console.log('\nCompanion martaba values:');
    compCheck.forEach(r => console.log(`  "${r.martaba_ibn_hajar}" — ${r.cnt}`));

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
