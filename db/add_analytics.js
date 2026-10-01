// db/add_analytics.js
//
// Why: first-party statistics for the private /admin dashboard — page views (counted by a beacon
// from the page itself, no cookies; visitors as a daily-rotating hash of IP + browser, so nobody is
// followed across days) and MCP events (connections with the client's name, tool calls with their
// outcome and duration). Sign-ups come from users; daily MCP totals from mcp_usage.
//
// Run:  node db/add_analytics.js      (idempotent; additive only)

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
CREATE TABLE IF NOT EXISTS page_views (
  id            bigserial PRIMARY KEY,
  ts            timestamptz NOT NULL DEFAULT now(),
  path          text NOT NULL,
  referrer_host text,
  visitor       text NOT NULL,      -- sha256(ip | user agent | day | salt), first 16 hex
  is_bot        boolean NOT NULL,
  device        text NOT NULL        -- mobile | desktop
);
CREATE INDEX IF NOT EXISTS page_views_ts ON page_views (ts);

CREATE TABLE IF NOT EXISTS mcp_events (
  id       bigserial PRIMARY KEY,
  ts       timestamptz NOT NULL DEFAULT now(),
  subject  text NOT NULL,            -- 'u:<user id>' or 'ip:<hash>'
  user_id  int,
  kind     text NOT NULL,            -- connect | call
  client   text,                     -- clientInfo.name sent at connect
  tool     text,
  ok       boolean,
  ms       int
);
CREATE INDEX IF NOT EXISTS mcp_events_ts ON mcp_events (ts);
`

async function main() {
  const pool = new Pool({ connectionString: connectionString(), ssl: { rejectUnauthorized: false }, max: 1 })
  try {
    await pool.query(SQL)
    console.log('page_views, mcp_events ready')
  } finally {
    await pool.end()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
