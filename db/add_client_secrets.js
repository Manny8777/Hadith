// db/add_client_secrets.js
//
// Why: claude.ai registers itself as a confidential OAuth client (it keeps a client secret on its
// servers). When the authorization server offered only public clients (token auth "none"), Claude
// read the metadata and stopped before registering — "Connector couldn't be added". Clients that
// ask for client_secret_post or client_secret_basic now get a secret; only its hash is kept.
//
//   oauth_clients.client_secret_hash   sha256 of the secret (null: a public client)
//   oauth_clients.token_auth_method    none | client_secret_post | client_secret_basic
//
// Additive (two nullable/defaulted columns). Run: node db/add_client_secrets.js

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
  await pool.query(`ALTER TABLE oauth_clients ADD COLUMN IF NOT EXISTS client_secret_hash text`)
  await pool.query(`ALTER TABLE oauth_clients ADD COLUMN IF NOT EXISTS token_auth_method text NOT NULL DEFAULT 'none'`)
  console.log('oauth_clients: client_secret_hash, token_auth_method')
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
