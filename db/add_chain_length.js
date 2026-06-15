// Add chain_length column to isnad_chains for رباعيات/ثلاثيات filtering
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    // Check if column exists
    const { rows: cols } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'isnad_chains' AND column_name = 'chain_length'
    `);

    if (cols.length === 0) {
      // narrator_ids is space-separated IDs; count words = chain length
      await client.query(`
        ALTER TABLE isnad_chains ADD COLUMN chain_length INTEGER
      `);
      console.log('chain_length column added.');

      await client.query(`
        UPDATE isnad_chains
        SET chain_length = array_length(string_to_array(trim(narrator_ids), ' '), 1)
        WHERE narrator_ids IS NOT NULL AND trim(narrator_ids) != ''
      `);
      console.log('chain_length populated.');
    } else {
      console.log('chain_length already exists.');
    }

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_isnad_chains_length ON isnad_chains(chain_length)
    `);
    console.log('Index on chain_length created.');

    // Distribution
    const { rows: dist } = await client.query(`
      SELECT chain_length, COUNT(*) as cnt
      FROM isnad_chains
      WHERE chain_length IS NOT NULL
      GROUP BY chain_length
      ORDER BY chain_length
    `);

    const LABELS = { 3: 'ثلاثيات', 4: 'رباعيات', 5: 'خماسيات', 6: 'سداسيات', 7: 'سباعيات', 8: 'ثمانيات' };
    console.log('\nChain length distribution:');
    dist.forEach(r => {
      const label = LABELS[r.chain_length] || '';
      console.log(`  ${r.chain_length} رواة ${label}: ${parseInt(r.cnt).toLocaleString()} سند`);
    });

    // Cross with books to see رباعيات per book
    const { rows: byBook } = await client.query(`
      SELECT b.title, ic.chain_length, COUNT(DISTINCT ih.hadith_id) as cnt
      FROM isnad_chains ic
      JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
      JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
      JOIN books b ON b.id = ht.book_id
      WHERE ic.chain_length IN (3, 4) AND ht.book_id IN (1,2,3,4,5,6,7,8)
      GROUP BY b.title, ic.chain_length
      ORDER BY b.title, ic.chain_length
    `);
    console.log('\nشورت chains per book:');
    byBook.forEach(r => {
      const label = LABELS[r.chain_length] || r.chain_length;
      console.log(`  ${r.title} — ${label}: ${r.cnt} حديث`);
    });

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
