// Create GIN index on isnad_chains narrator_ids for fast narrator-based hadith lookup
// Also adds narrator_ids as an integer array column for efficient GIN indexing

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    // Check isnad_chains row count
    const { rows: cnt } = await client.query('SELECT COUNT(*) FROM isnad_chains');
    console.log('isnad_chains rows:', cnt[0].count);

    // Add integer array column if not exists
    await client.query(`
      ALTER TABLE isnad_chains
      ADD COLUMN IF NOT EXISTS narrator_id_array INTEGER[]
    `);
    console.log('Added narrator_id_array column.');

    // Populate it from narrator_ids string
    console.log('Populating narrator_id_array...');
    const t0 = Date.now();
    await client.query(`
      UPDATE isnad_chains
      SET narrator_id_array = string_to_array(trim(narrator_ids), ' ')::INTEGER[]
      WHERE narrator_id_array IS NULL AND narrator_ids IS NOT NULL AND narrator_ids != ''
    `);
    console.log('Populated in', Date.now() - t0, 'ms');

    // Create GIN index on the array column
    console.log('Creating GIN index...');
    const t1 = Date.now();
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_isnad_chains_narrator_array
      ON isnad_chains USING GIN (narrator_id_array)
    `);
    console.log('Index created in', Date.now() - t1, 'ms');

    // Test the new query
    const t2 = Date.now();
    const { rows } = await client.query(`
      SELECT DISTINCT ht.main_id, ht.tarf, b.title as book_name, b.id as book_id
      FROM isnad_hadiths iha
      JOIN isnad_chains ic ON iha.isnad_id = ic.id
      JOIN hadith_toc ht ON iha.hadith_id = ht.main_id
      JOIN books b ON b.id = ht.book_id
      WHERE ic.narrator_id_array @> ARRAY[822]
      LIMIT 20
    `);
    console.log('\nFast query test: ' + (Date.now() - t2) + 'ms, rows:', rows.length);
    rows.slice(0, 5).forEach(r => console.log('  [' + r.book_name + ']', (r.tarf || '').substring(0, 60)));

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
