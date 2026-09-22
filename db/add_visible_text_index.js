// db/add_visible_text_index.js
//
// Why: /api/search matches hadith text through `to_tsvector('simple', normalize_hadith(...))`.
// The stored `content` is marked-up (tags and attributes, e.g. <متن>, <رقم_حديث نوع="مطبوع">,
// hidden matn in نص="…"). The legacy engine indexes element text only, so the search now
// matches on markup-stripped text — but a stripped expression has no index of its own, and
// without one the planner falls back to a full scan of 339k rows (that is what made a single
// query take minutes).
//
// This adds the matching partial GIN index. The expression here must stay byte-identical to
// `visibleText()` in app/api/search/route.ts, otherwise the index is simply not used.
//
// Run:  node db/add_visible_text_index.js
// Note: CREATE INDEX CONCURRENTLY cannot run inside a transaction block — this script therefore
// issues it as a standalone statement (no BEGIN/COMMIT) and can be re-run safely.

const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const envPath = path.join(__dirname, '..', '.env')
  const env = fs.readFileSync(envPath, 'utf8')
  const m = env.match(/^\s*DATABASE_URL\s*=\s*"?([^"\r\n]+)"?\s*$/m)
  if (!m) throw new Error('DATABASE_URL not found in environment or ' + envPath)
  return m[1]
}

const EXPR = `to_tsvector('simple', normalize_hadith(regexp_replace(coalesce(content,''), '<[^>]*>', ' ', 'g')))`
const INDEX_NAME = 'idx_hadith_toc_content_plain_norm'

async function main() {
  const pool = new Pool({ connectionString: connectionString(), ssl: { rejectUnauthorized: false }, max: 1 })
  const client = await pool.connect()
  try {
    const existing = await client.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'hadith_toc' AND indexname = $1`,
      [INDEX_NAME]
    )
    if (existing.rows.length) {
      console.log('Index already exists:')
      console.log('  ' + existing.rows[0].indexdef)
    } else {
      console.log('Creating ' + INDEX_NAME + ' (partial, is_leaf = true) …')
      const t0 = Date.now()
      await client.query(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${INDEX_NAME} ON hadith_toc USING gin (${EXPR}) WHERE is_leaf = true`
      )
      console.log(`  done in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    }

    // Also make sure the tarf-side index the OR uses exists (it normally does).
    const tarfIdx = await client.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'hadith_toc' AND indexname = 'idx_hadith_toc_tarf_norm'`
    )
    console.log(tarfIdx.rows.length ? 'tarf index present: ' + tarfIdx.rows[0].indexdef : 'WARNING: idx_hadith_toc_tarf_norm missing')

    // Prove the planner can use it for the exact shape the route emits.
    const plan = await client.query(
      `EXPLAIN (COSTS OFF)
       SELECT h.main_id FROM hadith_toc h
       WHERE h.is_leaf = true
         AND (to_tsvector('simple', normalize_hadith(coalesce(h.tarf,''))) @@ plainto_tsquery('simple', normalize_hadith($1))
              OR ${EXPR} @@ plainto_tsquery('simple', normalize_hadith($1)))`,
      ['الوسوسة']
    )
    console.log('\nEXPLAIN:')
    for (const r of plan.rows) console.log('  ' + r['QUERY PLAN'])
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
