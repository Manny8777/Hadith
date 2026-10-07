// Links the hadiths fetched from Sunnah.com (sunnah_hadiths, scripts/sunnah-import.mjs) to ours, into
// hadith_translations (main_id → Sunnah.com collection and number). Run after each import.
//
// Where Sunnah.com numbers a book as our printed edition does — al-Bukhari, Muslim, Abu Dawud,
// al-Tirmidhi, Ibn Majah (checked: 92–100% the same text at the same number) — a hadith goes to our
// record of the same printed number whose wording agrees best. Elsewhere (al-Nasa'i drifts against our
// numbering, Malik is cited by book/hadith, Ahmad and al-Shama'il are other editions) it goes to the
// record of the book whose wording agrees best. Wording agreement: the share of Sunnah.com's words
// found in our record, which must also cover a fair part of ours (so a short text does not land
// inside a long one).
//
//   node scripts/sunnah-match.mjs [--only nasai]
import pg from 'pg'

const BOOKS = {
  bukhari: [1, 'number'], muslim: [2, 'number'], abudawud: [3, 'number'], tirmidhi: [4, 'number'],
  ibnmajah: [6, 'number'], nasai: [5, 'text'], malik: [7, 'text'], ahmad: [8, 'text'], shamail: [33, 'text'],
}
const NUMBER_MIN = 0.5   // a same-numbered record must still agree this much
const TEXT_MIN = 0.7     // a record found by wording alone
const COVER_MIN = 0.35   // and Sunnah.com's text must cover this share of ours

const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null

const words = t => [...new Set((t || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/[ً-ٰٟـ]/g, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/صل[يى] الله عليه وسلم/g, ' ')
  .replace(/[^ء-ي\s]/g, ' ')
  .split(/\s+/).filter(w => w.length > 2))]

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 })
await pool.query(`
  CREATE TABLE IF NOT EXISTS hadith_translations (
    main_id        int  NOT NULL,
    source         text NOT NULL,      -- 'sunnah'
    lang           text NOT NULL,      -- 'en'
    collection     text NOT NULL,
    hadith_number  text NOT NULL,
    score          real,
    method         text,               -- 'number' | 'text'
    PRIMARY KEY (main_id, source, lang)
  )`)

for (const [collection, [bookId, mode]] of Object.entries(BOOKS)) {
  if (only && !only.includes(collection)) continue
  const theirs = (await pool.query(
    `SELECT hadith_number, ar_body FROM sunnah_hadiths WHERE collection = $1`, [collection])).rows
  if (!theirs.length) { console.log(`${collection}: nothing fetched yet`); continue }
  const ours = (await pool.query(
    `SELECT main_id, dorar_key, content FROM hadith_toc WHERE book_id = $1 AND is_leaf AND content IS NOT NULL ORDER BY main_id`, [bookId])).rows
    .map(r => ({ id: r.main_id, key: r.dorar_key, w: words(r.content) }))
    .filter(r => r.w.length >= 3)
  const byKey = new Map()
  ours.forEach(r => { if (r.key) (byKey.get(r.key) ?? byKey.set(r.key, []).get(r.key)).push(r) })
  // inverted index over the words not too common to tell records apart
  const index = new Map()
  ours.forEach((r, i) => r.w.forEach(w => (index.get(w) ?? index.set(w, []).get(w)).push(i)))
  const tooCommon = ours.length * 0.05

  const agree = (sw, r) => {
    const set = new Set(r.w)
    const shared = sw.filter(w => set.has(w)).length
    return { score: shared / sw.length, cover: shared / r.w.length }
  }
  const byText = sw => {
    const hits = new Map()
    for (const w of sw) {
      const list = index.get(w)
      if (!list || list.length > tooCommon) continue
      for (const i of list) hits.set(i, (hits.get(i) ?? 0) + 1)
    }
    let best = null
    for (const [i] of [...hits].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
      const a = agree(sw, ours[i])
      if (a.cover >= COVER_MIN && (!best || a.score > best.score)) best = { r: ours[i], ...a }
    }
    return best
  }

  const links = new Map() // main_id → best link
  let byNumber = 0, byWording = 0, none = 0
  for (const h of theirs) {
    const sw = words(h.ar_body)
    if (sw.length < 3) { none++; continue }
    let found = null
    if (mode === 'number') {
      const base = String(parseInt(h.hadith_number, 10))
      for (const r of byKey.get(base) ?? []) {
        const a = agree(sw, r)
        if (a.score >= NUMBER_MIN && (!found || a.score > found.score)) found = { r, ...a, method: 'number' }
      }
    }
    if (!found) {
      const t = byText(sw)
      if (t && t.score >= TEXT_MIN) found = { ...t, method: 'text' }
    }
    if (!found) { none++; continue }
    found.method === 'number' ? byNumber++ : byWording++
    const prev = links.get(found.r.id)
    if (!prev || found.score > prev.score) links.set(found.r.id, { number: h.hadith_number, score: found.score, method: found.method })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`DELETE FROM hadith_translations WHERE source = 'sunnah' AND collection = $1`, [collection])
    // in batches of 500 (the database is remote: a row at a time is far too slow)
    const all = [...links]
    for (let i = 0; i < all.length; i += 500) {
      const chunk = all.slice(i, i + 500)
      await client.query(
        `INSERT INTO hadith_translations (main_id, source, lang, collection, hadith_number, score, method)
         VALUES ${chunk.map((_, j) => `($${j * 5 + 1}, 'sunnah', 'en', $${j * 5 + 2}, $${j * 5 + 3}, $${j * 5 + 4}, $${j * 5 + 5})`).join(',')}
         ON CONFLICT (main_id, source, lang) DO UPDATE SET collection = EXCLUDED.collection,
           hadith_number = EXCLUDED.hadith_number, score = EXCLUDED.score, method = EXCLUDED.method`,
        chunk.flatMap(([id, l]) => [id, collection, l.number, l.score, l.method]))
    }
    await client.query('COMMIT')
  } catch (e) { await client.query('ROLLBACK'); throw e } finally { client.release() }
  console.log(`${collection}: ${theirs.length} from Sunnah.com → ${byNumber} by number, ${byWording} by wording, ${none} unmatched; ${links.size} of our records linked`)
}
await pool.end()
