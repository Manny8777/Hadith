const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});

async function dump(table) {
  const cols = await pool.query(`
    SELECT column_name, data_type, character_maximum_length
    FROM information_schema.columns
    WHERE table_name = $1
    ORDER BY ordinal_position`, [table]).catch(e=>({error:e.message, rows:[]}));
  console.log(`\n========== ${table} (${cols.rows.length} columns) ==========`);
  if (cols.error) { console.log('  ERROR:', cols.error); return; }
  cols.rows.forEach(c => console.log('  ' + c.column_name.padEnd(28) + c.data_type + (c.character_maximum_length?`(${c.character_maximum_length})`:'')));

  const cnt = await pool.query(`SELECT COUNT(*) c FROM ${table}`).catch(()=>({rows:[{c:'?'}]}));
  console.log(`  rows: ${cnt.rows[0].c}`);

  const sample = await pool.query(`SELECT * FROM ${table} LIMIT 2`).catch(e=>({error:e.message,rows:[]}));
  console.log('  --- sample ---');
  sample.rows.forEach((r,i) => {
    console.log(`  [row ${i+1}]`);
    for (const [k,v] of Object.entries(r)) {
      let val = v === null ? 'NULL' : String(v);
      if (val.length > 120) val = val.slice(0,120) + '…';
      console.log('     ' + k.padEnd(28) + val);
    }
  });
}

async function main() {
  await dump('books');
  await dump('authors');
  await pool.end();
}
main().catch(console.error);
