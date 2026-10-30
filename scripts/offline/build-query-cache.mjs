// Saves the answers of the offline database's slowest queries into the database itself (table
// offline_query_cache, read by lib/offline/runtime/cache.ts). Renders every page that takes no id,
// and the variants its own links lead to (sort orders, tabs, a few pages of results), with the site's
// code against the offline database, timing each query; those slower than the threshold are stored
// as they are found, so a second run after an interruption keeps what the first one saved.
//
//   node scripts/offline/build-query-cache.mjs <data dir> [threshold ms, default 1000]
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { unaccent } from '@electric-sql/pglite/contrib/unaccent'
import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const [dir, thresholdArg] = process.argv.slice(2)
if (!dir) { console.error('usage: build-query-cache.mjs <data dir> [threshold ms]'); process.exit(1) }
const THRESHOLD = Number(thresholdArg ?? 1000)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const VARIANTS = 12

// The site, built for Node with the offline shims
const bundle = join(ROOT, 'node_modules', '.cache', 'offline-node.mjs')
execFileSync(process.execPath, [join(ROOT, 'scripts', 'offline', 'build-offline-app.mjs'), '--node', bundle], { stdio: 'inherit' })
globalThis.React = createRequire(join(ROOT, 'package.json'))('react')
const app = await import(bundle)

const db = await PGlite.create({ dataDir: dir, extensions: { pg_trgm, unaccent }, parsers: { 20: v => v, 1700: v => v } })
await db.exec(`CREATE TABLE IF NOT EXISTS offline_query_cache (key text PRIMARY KEY, sql text NOT NULL, params text NOT NULL, rows text NOT NULL, ms int NOT NULL)`)
const known = new Set((await db.query('SELECT key FROM offline_query_cache')).rows.map(r => r.key))

// One query at a time, so each one's time is its own; answers already saved are used
let saved = 0, spared = 0
let queue = Promise.resolve()
app.setOfflineRunner((text, params = []) => {
  const run = queue.then(async () => {
    const p = app.cacheParams(params)
    const key = (await db.query('SELECT md5($2 || $1) AS k', [text, p])).rows[0].k
    if (known.has(key)) {
      const rows = JSON.parse((await db.query('SELECT rows FROM offline_query_cache WHERE key = $1', [key])).rows[0].rows)
      return { rows, rowCount: rows.length, fields: [] }
    }
    const t = Date.now()
    const r = await db.query(text, params)
    const ms = Date.now() - t
    if (ms >= THRESHOLD) {
      await db.query('INSERT INTO offline_query_cache VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING', [key, text, p, app.encodeRows(r.rows), ms])
      known.add(key)
      saved++
      spared += ms
    }
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length, fields: r.fields }
  })
  queue = run.catch(() => {})
  return run
})

const pages = []
;(function walk(d) {
  for (const name of readdirSync(d)) {
    const p = join(d, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (name === 'page.tsx') {
      const route = '/' + relative(join(ROOT, 'app'), d).split(sep).filter(s => s && !/^\(.*\)$/.test(s)).join('/')
      if (!route.includes('[') && !/^\/(account|admin|login|library|oauth|mcp|offline)(\/|$)/.test(route)) pages.push(route)
    }
  }
})(join(ROOT, 'app'))

const seen = new Set()
async function render(href) {
  if (seen.has(href)) return { html: '', ms: 0 }
  seen.add(href)
  const t = Date.now()
  try {
    const r = await app.renderPathToHtml(href)
    const ms = Date.now() - t
    if (ms > THRESHOLD) console.log(`${(ms / 1000).toFixed(1)}s ${href}`)
    return { html: r.html || '', ms }
  } catch (e) {
    console.log('FAILED', href, e.message)
    return { html: '', ms: 0 }
  }
}
for (const route of pages.sort()) {
  const { html, ms } = await render(route)
  // A page that takes minutes even with its own answers saved has variants that would too
  if (ms > 120_000) continue
  const variants = [...new Set([...html.matchAll(/href="([^"#]+)"/g)].map(m => m[1].replace(/&amp;/g, '&'))
    .filter(h => h.startsWith(route + '?')))].slice(0, VARIANTS)
  for (const v of variants) await render(v)
}

const { n, size } = (await db.query(`SELECT count(*)::int AS n, pg_size_pretty(pg_total_relation_size('offline_query_cache')) AS size FROM offline_query_cache`)).rows[0]
console.log(`${seen.size} pages rendered, ${saved} queries saved now (${Math.round(spared / 1000)}s of querying), ${n} in all (${size})`)
await db.exec('ANALYZE offline_query_cache')
await db.exec('CHECKPOINT')
await db.close()
