const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({
  connectionString: require('./dbenv.js').url(),
  ssl: { rejectUnauthorized: false }
});
pool.query(fs.readFileSync('C:\\HadithProg\\railway\\db\\schema_services.sql', 'utf8'))
  .then(() => { console.log('Schema applied'); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); process.exit(1); });
