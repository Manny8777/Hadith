// Saves the answers of the offline database's slowest queries into the database itself (table
// offline_query_cache, read by lib/offline/runtime/cache.ts). Renders every page that takes no id,
// and the variants its own links lead to (sort orders, tabs, a few pages of results), with the site's
// code against the offline database, timing each query; those slower than the threshold are stored.
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
await db.exec('DROP TABLE IF EXISTS offline_query_cache')

// One query at a time, so each one's time is its own
const slow = new Map()
let queue = Promise.resolve()
app.setOfflineRunner((text, params = []) => {
  const run = queue.then(async () => {
    const t = Date.now()
    const r = await db.query(text, params)
    const ms = Date.now() - t
    if (ms >= THRESHOLD) slow.set(text + '\0' + app.cacheParams(params), { text, params, rows: r.rows, ms })
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
  if (seen.has(href)) return ''
  seen.add(href)
  const t = Date.now()
  try {
    const r = await app.renderPathToHtml(href)
    if (Date.now() - t > THRESHOLD) console.log(`${((Date.now() - t) / 1000).toFixed(1)}s ${href}`)
    return r.html || ''
  } catch (e) {
    console.log('FAILED', href, e.message)
    return ''
  }
}
for (const route of pages.sort()) {
  const html = await render(route)
  const variants = [...new Set([...html.matchAll(/href="([^"#]+)"/g)].map(m => m[1].replace(/&amp;/g, '&'))
    .filter(h => h.startsWith(route + '?')))].slice(0, VARIANTS)
  for (const v of variants) await render(v)
}

await db.exec(`CREATE TABLE offline_query_cache (key text PRIMARY KEY, sql text NOT NULL, params text NOT NULL, rows text NOT NULL, ms int NOT NULL)`)
for (const { text, params, rows, ms } of slow.values()) {
  const p = app.cacheParams(params)
  await db.query(`INSERT INTO offline_query_cache VALUES (md5($1 || chr(0) || $2), $1, $2, $3, $4)`, [text, p, app.encodeRows(rows), ms])
}
const size = (await db.query(`SELECT pg_size_pretty(pg_total_relation_size('offline_query_cache')) AS s`)).rows[0].s
console.log(`${seen.size} pages rendered, ${slow.size} queries saved (${size}), ${Math.round([...slow.values()].reduce((s, q) => s + q.ms, 0) / 1000)}s of querying spared`)
await db.exec('ANALYZE offline_query_cache')
await db.exec('CHECKPOINT')
await db.close()
