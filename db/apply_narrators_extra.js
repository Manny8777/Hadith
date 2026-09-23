const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});
const sql = fs.readFileSync(path.join(__dirname, 'schema_narrators_extra.sql'), 'utf8');
pool.query(sql)
  .then(() => { console.log('Schema applied OK'); pool.end(); })
  .catch(e => { console.error('Error:', e.message); pool.end(); process.exit(1); });
