const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});

const sql = fs.readFileSync('C:\\HadithProg\\railway\\db\\schema_lexicon.sql', 'utf8');

pool.query(sql)
  .then(() => {
    console.log('Lexicon schema applied successfully');
    pool.end();
  })
  .catch(e => {
    console.error('Error:', e.message);
    pool.end();
    process.exit(1);
  });
