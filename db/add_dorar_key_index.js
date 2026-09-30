// db/add_dorar_key_index.js
//
// Why: Dorar's rulings (dorar_rulings, filled by scripts/dorar-crawl.mjs) are keyed by book and a
// hadith's first printed number as it appears in its text (<رقم_حديث نوع="مطبوع|طبعة_ثانية">) —
// dorarKey() in lib/dorar.ts, what the hadith page looks rulings up by. The tarqeem_matboa1 column
// is not the same thing («2952 (م)», or another number of the group), so /hadiths/unjudged needs
// the key from `content` — but extracting it for every hadith on each request took 6–30s, and the
// planner would not use an expression index for it.
//
// This stores the key once in hadith_toc.dorar_key (the texts do not change; re-run after
// importing new ones) and indexes it with book_id. Additive: a new nullable column and an index.
//
// Run:  node db/add_dorar_key_index.js
// Note: CREATE INDEX CONCURRENTLY cannot run inside a transaction block — issued standalone, and
// the script can be re-run safely.

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

// Same as dorarKey(): the first مطبوع / طبعة_ثانية number in the text
const EXPR = `btrim(substring(content from '<رقم_حديث نوع="(?:مطبوع|طبعة_ثانية)">([^<]+)<'))`
const INDEX_NAME = 'idx_hadith_toc_book_dorar_key'

async function main() {
  const pool = new Pool({ connectionString: connectionString(), ssl: { rejectUnauthorized: false }, max: 1 })
  const client = await pool.connect()
  try {
    let t = Date.now()
    await client.query(`ALTER TABLE hadith_toc ADD COLUMN IF NOT EXISTS dorar_key text`)
    const upd = await client.query(
      `UPDATE hadith_toc SET dorar_key = ${EXPR}
       WHERE dorar_key IS DISTINCT FROM ${EXPR}`
    )
    console.log(`dorar_key set on ${upd.rowCount} rows in ${((Date.now() - t) / 1000).toFixed(1)}s`)

    // (an earlier expression index for this, never chosen by the planner)
    await client.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_hadith_toc_dorar_key`)

    const existing = await client.query(`SELECT 1 FROM pg_indexes WHERE tablename = 'hadith_toc' AND indexname = $1`, [INDEX_NAME])
    if (!existing.rows.length) {
      t = Date.now()
      await client.query(
        `CREATE INDEX CONCURRENTLY ${INDEX_NAME} ON hadith_toc (book_id, dorar_key) INCLUDE (main_id)
         WHERE is_leaf AND is_paragraph`
      )
      console.log(`created ${INDEX_NAME} in ${((Date.now() - t) / 1000).toFixed(1)}s`)
    }
    await client.query('ANALYZE hadith_toc')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
