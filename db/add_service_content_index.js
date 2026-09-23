// db/add_service_content_index.js
//
// Why: search now also runs over the خدمية books (hadith_service_content, 600,575 leaf rows) — the
// original's الكتب الخدمية checkbox. That table only had a GIN index on `tarf`, so matching the
// tag-stripped content full-scanned the table: a single query took ~99s.
//
// The expression below must stay byte-identical to what the route computes
// (`to_tsvector('simple', normalize_hadith(regexp_replace(coalesce(content,''), '<[^>]*>', ' ', 'g')))`),
// otherwise the planner cannot use the index. Same shape as db/add_visible_text_index.js for hadith_toc.
//
// Run:  node db/add_service_content_index.js
// CREATE INDEX CONCURRENTLY cannot run inside a transaction, so it is issued standalone and is safe
// to re-run.

const path = require('path')
const { Pool } = require('pg')
const dbenv = require('./dbenv.js')

const EXPR = `to_tsvector('simple', normalize_hadith(regexp_replace(coalesce(content,''), '<[^>]*>', ' ', 'g')))`
const INDEX_NAME = 'idx_hsc_content_plain_norm'
const TABLE = 'hadith_service_content'

async function main() {
  const pool = new Pool({ connectionString: dbenv.url(), ssl: { rejectUnauthorized: false }, max: 1 })
  const client = await pool.connect()
  try {
    const existing = await client.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename = $1 AND indexname = $2`,
      [TABLE, INDEX_NAME]
    )
    if (existing.rows.length) {
      console.log('Index already exists:')
      console.log('  ' + existing.rows[0].indexdef)
    } else {
      console.log('Creating ' + INDEX_NAME + ' on ' + TABLE + ' (partial, is_leaf = true) …')
      const t0 = Date.now()
      await client.query(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${INDEX_NAME} ON ${TABLE} USING gin (${EXPR}) WHERE is_leaf = true`
      )
      console.log('  done in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's')
    }

    // Prove the planner uses it for the shape the route emits.
    const plan = await client.query(
      `EXPLAIN (COSTS OFF)
       SELECT h.id FROM ${TABLE} h
       WHERE h.is_leaf = true
         AND (to_tsvector('simple', normalize_hadith(coalesce(h.tarf,''))) @@ plainto_tsquery('simple', normalize_hadith($1))
              OR ${EXPR} @@ plainto_tsquery('simple', normalize_hadith($1)))`,
      ['الصلاة']
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
