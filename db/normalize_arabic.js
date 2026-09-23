// Add normalized Arabic text column to narrators for better search
// Normalizes: أ إ آ → ا, ة → ه, ى → ي
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    // Create a PostgreSQL function for Arabic normalization
    await client.query(`
      CREATE OR REPLACE FUNCTION normalize_arabic(text) RETURNS text AS $$
      SELECT
        translate(
          translate(
            translate($1,
              'أإآ', 'اوا'
            ),
            'ة', 'ه'
          ),
          'ى', 'ي'
        );
      $$ LANGUAGE SQL IMMUTABLE STRICT;
    `);
    console.log('normalize_arabic function created.');

    // Check current columns
    const { rows: cols } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'narrators' AND column_name IN ('name_normalized', 'abb_name_normalized')
    `);
    const hasCols = cols.map(c => c.column_name);

    if (!hasCols.includes('name_normalized')) {
      await client.query(`ALTER TABLE narrators ADD COLUMN name_normalized TEXT GENERATED ALWAYS AS (normalize_arabic(name)) STORED`);
      console.log('name_normalized column added.');
    } else {
      console.log('name_normalized already exists.');
    }

    // Create index on normalized name for fast search
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_narrators_name_normalized
      ON narrators(name_normalized)
    `);
    console.log('Index on name_normalized created.');

    // Also create GIN tsvector index on normalized name for full-text search
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_narrators_name_normalized_fts
      ON narrators USING GIN (to_tsvector('simple', coalesce(name_normalized, '')))
    `);
    console.log('FTS index on name_normalized created.');

    // Test
    const { rows: test } = await client.query(`
      SELECT name, name_normalized FROM narrators
      WHERE name LIKE '%أنس%' LIMIT 3
    `);
    console.log('\nTest normalization:');
    test.forEach(r => console.log(`  "${r.name}" → "${r.name_normalized}"`));

    // Verify search works both ways
    const { rows: t2 } = await client.query(`
      SELECT name FROM narrators
      WHERE name_normalized ILIKE $1
      LIMIT 3
    `, ['%انس%']);
    console.log('\nSearch "انس" finds:');
    t2.forEach(r => console.log('  ', r.name));

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
