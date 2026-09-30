// db/add_accounts.js
//
// Why: optional accounts (sign-in by an emailed link — no passwords), personal tokens and OAuth for
// the MCP server (hadith.dev/mcp), and a per-day usage count so signed-in users get a higher limit.
// Only tokens' SHA-256 hashes are stored, never the tokens themselves.
//
// Run:  node db/add_accounts.js      (idempotent: CREATE … IF NOT EXISTS; additive only)

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

const SQL = `
CREATE TABLE IF NOT EXISTS users (
  id            serial PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

-- one-time sign-in links (15 minutes)
CREATE TABLE IF NOT EXISTS login_links (
  token_hash  text PRIMARY KEY,
  email       text NOT NULL,
  next_path   text,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);
CREATE INDEX IF NOT EXISTS login_links_email_created ON login_links (email, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  text PRIMARY KEY,
  user_id     int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

-- personal tokens for MCP clients that take a header (Claude Code, scripts)
CREATE TABLE IF NOT EXISTS api_tokens (
  id           serial PRIMARY KEY,
  user_id      int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  token_hash   text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

-- OAuth 2.1 for MCP clients that sign in themselves (Claude, ChatGPT): dynamic registration,
-- authorization codes with PKCE, access and refresh tokens
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id     text PRIMARY KEY,
  client_name   text,
  redirect_uris text[] NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash      text PRIMARY KEY,
  client_id      text NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id        int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri   text NOT NULL,
  code_challenge text NOT NULL,
  expires_at     timestamptz NOT NULL,
  used_at        timestamptz
);
CREATE TABLE IF NOT EXISTS oauth_tokens (
  token_hash  text PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('access', 'refresh')),
  client_id   text NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id     int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz
);

-- MCP tool calls per subject per day (subject: 'u:<user id>' or 'ip:<hash>')
CREATE TABLE IF NOT EXISTS mcp_usage (
  subject  text NOT NULL,
  day      date NOT NULL,
  calls    int NOT NULL DEFAULT 0,
  PRIMARY KEY (subject, day)
);
`

async function main() {
  const pool = new Pool({ connectionString: connectionString(), ssl: { rejectUnauthorized: false }, max: 1 })
  try {
    await pool.query(SQL)
    const r = await pool.query(`SELECT table_name FROM information_schema.tables
      WHERE table_name IN ('users','login_links','sessions','api_tokens','oauth_clients','oauth_codes','oauth_tokens','mcp_usage')
      ORDER BY 1`)
    console.log('tables:', r.rows.map(x => x.table_name).join(', '))
  } finally {
    await pool.end()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
