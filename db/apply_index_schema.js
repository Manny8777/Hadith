const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});

const sql = fs.readFileSync(path.join(__dirname, 'schema_index.sql'), 'utf8');

pool.query(sql)
  .then(() => {
    console.log('Schema applied successfully');
    return pool.end();
  })
  .catch(e => {
    console.error('Error:', e.message);
    pool.end();
    process.exit(1);
  });
