const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({
  connectionString: 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
  ssl: { rejectUnauthorized: false }
});
pool.query(fs.readFileSync('C:\\HadithProg\\railway\\db\\schema_takhrij.sql', 'utf8'))
  .then(() => { console.log('Schema applied'); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); process.exit(1); });
