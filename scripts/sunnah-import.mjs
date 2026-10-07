// Sunnah.com → our database: the English translation (and Sunnah.com's Arabic, used only to match)
// of every hadith in the collections that have one, into sunnah_hadiths. Sunnah.com asks apps to
// keep their own copy and refresh it at least once a month — re-run this monthly; rows are upserted.
// Then scripts/sunnah-match.mjs links them to our hadiths (hadith_translations).
//
//   node scripts/sunnah-import.mjs [--only bukhari,muslim]
//
// Needs SUNNAH_API_KEY (from .env.local, never committed) and DATABASE_URL. The API allows
// 5 requests/second and 5,000/day; this makes about 600 requests, one every 400 ms.
import pg from 'pg'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = (() => { try { return readFileSync(path.join(root, '.env.local'), 'utf8') } catch { return '' } })()
const KEY = process.env.SUNNAH_API_KEY || env.match(/^SUNNAH_API_KEY=(.*)$/m)?.[1]?.trim()
if (!KEY) throw new Error('SUNNAH_API_KEY is not set (.env.local)')
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')

// Sunnah.com collection → our book id
export const COLLECTIONS = {
  bukhari: 1, muslim: 2, abudawud: 3, tirmidhi: 4, nasai: 5, ibnmajah: 6, malik: 7, ahmad: 8, shamail: 33,
}
const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null

const sleep = ms => new Promise(r => setTimeout(r, ms))
let requests = 0
async function api(p, attempt = 1) {
  await sleep(400)
  requests++
  let res
  try {
    res = await fetch(`https://api.sunnah.com/v1${p}`, { headers: { 'X-API-Key': KEY } })
  } catch (e) {
    // a dropped connection: wait and try again
    if (attempt > 5) throw e
    await sleep(5000 * attempt)
    return api(p, attempt + 1)
  }
  if (res.status === 429 || res.status >= 500) {
    if (attempt > 5) throw new Error(`${p} → HTTP ${res.status}`)
    await sleep(5000 * attempt)
    return api(p, attempt + 1)
  }
  if (!res.ok) throw new Error(`${p} → HTTP ${res.status} ${(await res.text()).slice(0, 120)}`)
  return res.json()
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 })
await pool.query(`
  CREATE TABLE IF NOT EXISTS sunnah_hadiths (
    collection     text NOT NULL,
    hadith_number  text NOT NULL,       -- Sunnah.com's reference number («3350», «8a»)
    book_number    text,
    en_body        text,                -- the English translation (Sunnah.com's HTML: <p>, <b>, <br>)
    en_chapter     text,
    en_grades      jsonb,
    ar_body        text,                -- Sunnah.com's Arabic, used to match it to our text
    ar_chapter     text,
    fetched_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (collection, hadith_number)
  )`)

// One row of sunnah_hadiths from an API hadith (null when it has no English)
function rowOf(collection, h, bookNumber) {
  const en = h.hadith.find(x => x.lang === 'en'), ar = h.hadith.find(x => x.lang === 'ar')
  if (!en?.body?.trim()) return null
  return [collection, String(h.hadithNumber).trim(), bookNumber, en.body, en.chapterTitle || null,
    JSON.stringify(en.grades ?? []), ar?.body ?? null, ar?.chapterTitle ?? null]
}
// One insert per batch (the database is remote: a row at a time is far too slow)
async function save(list) {
  const rows = [...new Map(list.filter(Boolean).map(r => [r[1], r])).values()]
  if (!rows.length) return 0
  await pool.query(
    `INSERT INTO sunnah_hadiths (collection, hadith_number, book_number, en_body, en_chapter, en_grades, ar_body, ar_chapter)
     VALUES ${rows.map((_, i) => `(${Array.from({ length: 8 }, (_, k) => '$' + (i * 8 + k + 1)).join(',')})`).join(',')}
     ON CONFLICT (collection, hadith_number) DO UPDATE SET book_number = EXCLUDED.book_number,
       en_body = EXCLUDED.en_body, en_chapter = EXCLUDED.en_chapter, en_grades = EXCLUDED.en_grades,
       ar_body = EXCLUDED.ar_body, ar_chapter = EXCLUDED.ar_chapter, fetched_at = now()`,
    rows.flat())
  return rows.length
}

for (const [collection] of Object.entries(COLLECTIONS)) {
  if (only && !only.includes(collection)) continue
  const books = []
  for (let page = 1; ; page++) {
    const r = await api(`/collections/${collection}/books?limit=100&page=${page}`)
    books.push(...r.data)
    if (!r.next) break
  }
  let n = 0
  for (const b of books) {
    let failed = false
    for (let page = 1; ; page++) {
      const r = await api(`/collections/${collection}/books/${encodeURIComponent(b.bookNumber)}/hadiths?limit=100&page=${page}`)
      if (!Array.isArray(r.data)) { failed = true; break }
      n += await save(r.data.map(h => rowOf(collection, h, b.bookNumber)))
      if (!r.next) break
    }
    // Some book listings fail on Sunnah.com's side: then its hadiths one by one, by number
    if (failed) {
      const from = Number(b.hadithStartNumber), to = Number(b.hadithEndNumber)
      console.warn(`  ${collection} book ${b.bookNumber}: listing failed; fetching ${from}–${to} one by one`)
      if (!(from > 0 && to >= from)) continue
      let batch = []
      for (let k = from; k <= to; k++) {
        const h = await api(`/collections/${collection}/hadiths/${k}`).catch(() => null)
        if (h?.hadith) batch.push(rowOf(collection, h, b.bookNumber))
        if (batch.length >= 100) { n += await save(batch); batch = [] }
      }
      n += await save(batch)
    }
  }
  console.log(`${collection}: ${books.length} books, ${n} hadiths with English (${requests} requests so far)`)
}
await pool.end()
console.log(`done: ${requests} requests`)
