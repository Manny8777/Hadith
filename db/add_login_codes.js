// db/add_login_codes.js
//
// Why: the sign-in email's link opens in the phone's or computer's default browser — not in the
// window that asked for it. When that window is an AI assistant's connection window (Claude,
// ChatGPT connecting to /mcp/account), the sign-in then completes in the wrong place and the
// connection never does. The email now also carries a 6-digit code, typed into the same window.
//
//   login_links.code_hash   sha256 of the email and the code
//   login_links.code_tries  wrong codes tried against this link (5 ends it)
//
// Additive (two nullable/defaulted columns). Run: node db/add_login_codes.js

const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
  const m = env.match(/^\s*DATABASE_URL\s*=\s*"?([^"\r\n]+)"?\s*$/m)
  if (!m) throw new Error('DATABASE_URL not found')
  return m[1]
}

async function main() {
  const pool = new Pool({ connectionString: connectionString(), ssl: { rejectUnauthorized: false } })
  await pool.query(`ALTER TABLE login_links ADD COLUMN IF NOT EXISTS code_hash text`)
  await pool.query(`ALTER TABLE login_links ADD COLUMN IF NOT EXISTS code_tries int NOT NULL DEFAULT 0`)
  console.log('login_links: code_hash, code_tries')
  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
