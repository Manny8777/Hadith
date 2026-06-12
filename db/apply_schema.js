const { Client } = require('pg');
const fs = require('fs');
const sql = fs.readFileSync('C:\\HadithProg\\railway\\db\\schema.sql', 'utf8');
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  await client.connect();
  console.log('Connected to PostgreSQL');
  await client.query(sql);
  console.log('Schema applied successfully');
  await client.end();
})().catch(e => { console.error(e.message); process.exit(1); });
