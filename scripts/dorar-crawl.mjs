// Fetches Dorar's rulings for our hadiths into dorar_rulings (see lib/dorar.ts for why this runs
// offline). One lookup per (book, printed number): Dorar keys its cards the same way, so every حرف
// hadith grouped under one مطبوع number shares the result.
//
// For each number: search Dorar's API with the matn's opening words (all words, then any word, then
// the middle of the matn), limited to the book's sources, and keep only results whose source and
// number are ours. With --links, also look the matched cards up on Dorar's search page for their
// share links (/h/<hash>) — best effort: that page's search is strict and finds about a third of
// them, at two heavy page loads each, so it is off by default.
//
// Runs with curl (Cloudflare refuses Node's fetch) and needs Node ≥ 22.18 to import lib/dorar.ts.
//
//   DATABASE_URL=… node scripts/dorar-crawl.mjs --books 1,2 [--limit 500] [--delay 1500] [--numbers 1,2] [--retry] [--links] [--dry-run]
//
// It resumes where it stopped: numbers already in dorar_crawl are skipped (--retry redoes those
// that ended 'none' or 'error').

import { execFileSync } from 'node:child_process'
import pg from 'pg'
import { DORAR_SOURCES, printedNumbers, dorarKey, matnSearchWords } from '../lib/dorar.ts'

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? dflt : args[i + 1]
}
const BOOKS = opt('books', '1,2').split(',').map(Number).filter(b => DORAR_SOURCES[b])
const LIMIT = Number(opt('limit', 'Infinity'))
const DELAY = Number(opt('delay', '1500'))
const RETRY = args.includes('--retry')
const DRY = args.includes('--dry-run')
const LINKS = args.includes('--links')
const ONLY = opt('numbers', null)?.split(',')  // only these (our first printed) numbers

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
const sleep = ms => new Promise(r => setTimeout(r, ms))

function curl(url) {
  return execFileSync('curl', ['-s', '--max-time', '30', '-A', UA, url], { maxBuffer: 16 * 1024 * 1024 }).toString()
}

const sourceParams = sources => sources.map(s => `&s%5B%5D=${s.id}`).join('')

// API result: «<div class="hadith">…</div><div class="hadith-info"><span class="info-subtitle">label:</span> value …»
function apiSearch(words, sources, allWords) {
  const url = `https://dorar.net/dorar_api.json?skey=${encodeURIComponent(words.join(' '))}`
    + sourceParams(sources) + (allWords ? '&st=w' : '')
  const body = curl(url)
  let html
  try { html = JSON.parse(body).ahadith.result } catch { throw new Error(`API: not JSON (${body.slice(0, 40)})`) }
  const field = (block, label) => {
    const m = block.match(new RegExp(`${label}:</span>([\\s\\S]*?)(?:<span class="info-subtitle">|$)`))
    return m ? m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''
  }
  const blocks = html.matchAll(/<div class="hadith"[^>]*>([\s\S]*?)<\/div>\s*<div class="hadith-info">([\s\S]*?)<\/div>/g)
  return [...blocks].map(([, text, b]) => ({
    text: text.replace(/<[^>]+>/g, ' ').replace(/^\s*\d+\s*-\s*/, '').replace(/\s+/g, ' ').trim(),
    rawi: field(b, 'الراوي'),
    muhaddith: field(b, 'المحدث'),
    source: field(b, 'المصدر'),
    number: field(b, 'الصفحة أو الرقم').replace(/\s+/g, ''),
    hukm: field(b, 'خلاصة حكم المحدث'),
  }))
}

// Search page: each card's copy button holds «المصدر: X | الصفحة أو الرقم: N», followed by the
// share button <a tag="HASH">. The page only lists cards containing every searched word, and is
// stricter than the API about it, so it is searched with words from Dorar's own text of the card.
function shareHashes(words, sources) {
  const url = `https://dorar.net/hadith/search?q=${encodeURIComponent(words.join(' '))}&st=w` + sourceParams(sources)
  const html = curl(url)
  const map = new Map()
  const re = /المصدر: ([^|<]+?) \| الصفحة أو الرقم: ([^<]+?)<br>[\s\S]*?<a tag="(\w+)"/g
  for (const m of html.matchAll(re)) {
    const key = `${m[1].trim()}|${m[2].replace(/\s+/g, '')}`
    if (!map.has(key)) map.set(key, m[3])
  }
  if (process.env.DORAR_DEBUG) console.log(`    links «${words.join(' ')}» → ${[...map.keys()].join(', ') || 'none'}`)
  return map
}

// The page's search misses words written with a hamza on the alef (إنكم), so the alef is plain.
const plainWords = text => text
  .replace(/[ً-ْٰـ]/g, '')
  .replace(/[أإآ]/g, 'ا')
  .replace(/صل[يى] الله عليه وسلم/g, ' ')
  .replace(/[^ء-ي\s]/g, ' ')
  .split(/\s+/)
  .filter(w => w.length > 2)

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 })

  if (!DRY) await pool.query(`
    CREATE TABLE IF NOT EXISTS dorar_rulings (
      book_id         int  NOT NULL,
      number          text NOT NULL,     -- our key: the hadith's first printed number (see dorarKey)
      dorar_number    text NOT NULL,
      dorar_source_id int,
      source          text NOT NULL,
      muhaddith       text,
      rawi            text,
      hukm            text,
      dorar_hash      text,
      fetched_at      timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (book_id, number, source, dorar_number)
    );
    CREATE TABLE IF NOT EXISTS dorar_crawl (
      book_id    int  NOT NULL,
      number     text NOT NULL,
      status     text NOT NULL,          -- found | none | error
      query      text,
      tried_at   timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (book_id, number)
    );`)

  let done = 0
  let errorsInRow = 0
  for (const bookId of BOOKS) {
    const sources = DORAR_SOURCES[bookId]
    const { rows } = await pool.query(
      `SELECT main_id, content FROM hadith_toc
       WHERE book_id = $1 AND (content LIKE '%نوع="مطبوع"%' OR content LIKE '%نوع="طبعة_ثانية"%')
       ORDER BY main_id`, [bookId])

    // Group the hadiths by their printed numbers
    const groups = new Map()
    for (const r of rows) {
      const numbers = printedNumbers(r.content)
      const key = dorarKey(r.content)
      if (!key) continue
      if (!groups.has(key)) groups.set(key, { numbers: new Set(), wordLists: [] })
      const g = groups.get(key)
      numbers.forEach(n => g.numbers.add(n))
      const words = matnSearchWords(r.content)
      if (words.length >= 3 && g.wordLists.length < 2) g.wordLists.push(words)
    }

    const skip = DRY ? new Set() : new Set((await pool.query(
      `SELECT number FROM dorar_crawl WHERE book_id = $1 ${RETRY ? "AND status = 'found'" : ''}`, [bookId]
    )).rows.map(r => r.number))
    const todo = [...groups.entries()]
      .filter(([key, g]) => !skip.has(key) && g.wordLists.length > 0 && (!ONLY || ONLY.includes(key)))
    console.log(`book ${bookId}: ${groups.size} numbers, ${todo.length} to fetch`)

    for (const [key, g] of todo) {
      if (done >= LIMIT) break
      done++
      const numbers = [...g.numbers]
      let found = null
      let lastQuery = ''
      let failed = false

      search:
      for (const words of g.wordLists) {
        const head = words.slice(0, 6)
        const midStart = Math.max(0, Math.floor(words.length / 2) - 3)
        const mid = words.slice(midStart, midStart + 6)
        for (const [ws, allWords] of [[head, true], [head, false], [mid, false]]) {
          lastQuery = ws.join(' ')
          let results
          try {
            results = apiSearch(ws, sources, allWords)
            errorsInRow = 0
          } catch (e) {
            failed = true
            console.warn(`  ${key}: ${e.message}`)
            if (++errorsInRow >= 5) throw new Error('5 errors in a row — Dorar is refusing requests; stopping')
            await sleep(DELAY * 10)
            continue
          } finally {
            await sleep(DELAY)
          }
          const seen = new Set()
          const exact = results.filter(r => {
            const k = `${r.source}|${r.number}`
            if (!numbers.includes(r.number) || seen.has(k)) return false
            seen.add(k)
            return true
          })
          if (exact.length > 0) { found = { exact, ws, allWords }; break search }
        }
      }

      if (found) {
        const hashes = new Map()
        const tried = new Set()
        for (const r of LINKS ? found.exact : []) {
          const words = plainWords(r.text)
          for (const n of [5, 3]) {
            if (hashes.has(`${r.source}|${r.number}`) || words.length < n) continue
            const q = words.slice(0, n).join(' ')
            if (tried.has(q)) continue
            tried.add(q)
            try {
              for (const [k, h] of shareHashes(words.slice(0, n), sources)) if (!hashes.has(k)) hashes.set(k, h)
            } catch (e) { console.warn(`  ${key}: links: ${e.message}`) }
            await sleep(DELAY)
          }
        }
        for (const r of found.exact) {
          const hash = hashes.get(`${r.source}|${r.number}`) ?? null
          const sourceId = sources.find(s => s.name === r.source)?.id ?? null
          if (DRY) { console.log(`  ${key} → ${r.source} ${r.number} · ${r.muhaddith} · ${r.hukm} · ${hash ?? '-'}`); continue }
          await pool.query(
            `INSERT INTO dorar_rulings (book_id, number, dorar_number, dorar_source_id, source, muhaddith, rawi, hukm, dorar_hash)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (book_id, number, source, dorar_number) DO UPDATE SET
               dorar_source_id = EXCLUDED.dorar_source_id, muhaddith = EXCLUDED.muhaddith, rawi = EXCLUDED.rawi,
               hukm = EXCLUDED.hukm, dorar_hash = COALESCE(EXCLUDED.dorar_hash, dorar_rulings.dorar_hash),
               fetched_at = now()`,
            [bookId, key, r.number, sourceId, r.source, r.muhaddith, r.rawi, r.hukm, hash])
        }
      } else if (DRY) {
        console.log(`  ${key} → ${failed ? 'error' : 'none'}  (${lastQuery})`)
      }

      if (!DRY) {
        await pool.query(
          `INSERT INTO dorar_crawl (book_id, number, status, query) VALUES ($1,$2,$3,$4)
           ON CONFLICT (book_id, number) DO UPDATE SET status = EXCLUDED.status, query = EXCLUDED.query, tried_at = now()`,
          [bookId, key, found ? 'found' : failed ? 'error' : 'none', found ? found.ws.join(' ') : lastQuery])
      }
      if (done % 25 === 0) console.log(`  … ${done} done`)
    }
  }
  await pool.end()
  console.log(`finished: ${done} numbers`)
}

main().catch(e => { console.error(e); process.exit(1) })
