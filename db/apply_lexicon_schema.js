const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
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
