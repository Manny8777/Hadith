// Fix the normalize_arabic function — إ was incorrectly mapped to و
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    // Fix the function: أ إ آ all map to ا
    await client.query(`
      CREATE OR REPLACE FUNCTION normalize_arabic(text) RETURNS text AS $$
      SELECT
        translate(
          translate(
            translate($1,
              E'\\u0623\\u0625\\u0622',
              E'\\u0627\\u0627\\u0627'
            ),
            E'\\u0629',
            E'\\u0647'
          ),
          E'\\u0649',
          E'\\u064a'
        );
      $$ LANGUAGE SQL IMMUTABLE STRICT;
    `);
    console.log('Function updated with unicode escapes...');

    // Test
    const { rows: t } = await client.query(`SELECT normalize_arabic('إسماعيل') AS n1, normalize_arabic('أنس') AS n2, normalize_arabic('آدم') AS n3`);
    console.log('إسماعيل →', t[0].n1);
    console.log('أنس →', t[0].n2);
    console.log('آدم →', t[0].n3);

    if (t[0].n1 !== 'اسماعيل') {
      console.log('Unicode escapes did not work, trying literal characters...');
      // Try with literal Arabic characters directly
      await client.query(`
        CREATE OR REPLACE FUNCTION normalize_arabic(text) RETURNS text AS $func$
        SELECT
          replace(replace(replace(replace(replace(
            $1,
            'أ', 'ا'),
            'إ', 'ا'),
            'آ', 'ا'),
            'ة', 'ه'),
            'ى', 'ي');
        $func$ LANGUAGE SQL IMMUTABLE STRICT;
      `);
      console.log('Function recreated with replace() chaining...');
      const { rows: t2 } = await client.query(`SELECT normalize_arabic('إسماعيل') AS n1, normalize_arabic('أنس') AS n2, normalize_arabic('آدم') AS n3, normalize_arabic('عائشة') AS n4`);
      console.log('إسماعيل →', t2[0].n1);
      console.log('أنس →', t2[0].n2);
      console.log('آدم →', t2[0].n3);
      console.log('عائشة →', t2[0].n4);
    }

    // Now we need to drop and recreate the generated column to pick up the new function
    console.log('\nRecreating name_normalized column to apply new function...');
    await client.query(`ALTER TABLE narrators DROP COLUMN IF EXISTS name_normalized`);
    await client.query(`ALTER TABLE narrators ADD COLUMN name_normalized TEXT GENERATED ALWAYS AS (normalize_arabic(name)) STORED`);
    console.log('Column recreated.');

    // Recreate indexes
    await client.query(`DROP INDEX IF EXISTS idx_narrators_name_normalized`);
    await client.query(`DROP INDEX IF EXISTS idx_narrators_name_normalized_fts`);
    await client.query(`CREATE INDEX idx_narrators_name_normalized ON narrators(name_normalized)`);
    await client.query(`CREATE INDEX idx_narrators_name_normalized_fts ON narrators USING GIN (to_tsvector('simple', coalesce(name_normalized, '')))`);
    console.log('Indexes recreated.');

    // Verify
    const { rows: v } = await client.query(`SELECT name, name_normalized FROM narrators WHERE name LIKE '%إسماعيل%' LIMIT 3`);
    console.log('\nVerification:');
    v.forEach(r => console.log(`  "${r.name}" → "${r.name_normalized}"`));

    // Test search
    const { rows: s } = await client.query(`SELECT name FROM narrators WHERE name_normalized ILIKE $1 LIMIT 3`, ['%اسماعيل%']);
    console.log('\nSearching "اسماعيل" finds:');
    s.forEach(r => console.log('  ', r.name));

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(console.error);
