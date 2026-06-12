const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});
const sql = fs.readFileSync(path.join(__dirname, 'schema_narrators_extra.sql'), 'utf8');
pool.query(sql)
  .then(() => { console.log('Schema applied OK'); pool.end(); })
  .catch(e => { console.error('Error:', e.message); pool.end(); process.exit(1); });
