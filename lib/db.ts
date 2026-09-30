import { Pool } from 'pg'

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(process.env[name] || '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

// Railway runs one web replica for this app; these values remain configurable if traffic grows.
// Five connections ran out when crawlers (Google, Meta) sent dozens of pages at once, and queued
// requests failed with «timeout exceeded when trying to connect». PostgreSQL allows 500, so 15
// leaves ample headroom.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: intEnv('DB_POOL_MAX', 15, 1, 30),
  min: intEnv('DB_POOL_MIN', 0, 0, 5),
  idleTimeoutMillis: intEnv('DB_IDLE_TIMEOUT_MS', 30_000, 10_000, 300_000),
  connectionTimeoutMillis: intEnv('DB_CONNECT_TIMEOUT_MS', 10_000, 2_000, 60_000),
  statement_timeout: intEnv('DB_STATEMENT_TIMEOUT_MS', 30_000, 1_000, 300_000),
  query_timeout: intEnv('DB_QUERY_TIMEOUT_MS', 35_000, 1_000, 300_000),
  maxUses: intEnv('DB_MAX_USES', 10_000, 100, 100_000),
  keepAlive: true,
})

pool.on('error', error => {
  console.error('Unexpected idle PostgreSQL client error:', error instanceof Error ? error.message : error)
})

export default pool
