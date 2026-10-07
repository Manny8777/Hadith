// Captures the research-library screens the «مكتبتي» film shows (motion-graphics/library/shots/*.png),
// with where their parts sit (shots/marks.json, CSS px), from a running copy of the site. It signs in as
// a demo account it creates with a small research project (collections, notes, a highlight, a share
// link) and deletes it — and everything it holds — at the end.
//   DATABASE_URL=… node motion-graphics/library/capture.mjs [--base http://localhost:3100]
import pg from 'pg'
import { chromium } from 'playwright'
import { createHash, randomBytes } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const BASE = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:3100'
const EMAIL = 'film-demo@hadith.dev'
const sha = s => createHash('sha256').update(s).digest('hex')
mkdirSync(path.join(here, 'shots'), { recursive: true })

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect()
const uid = (await db.query(`INSERT INTO users (email) VALUES ($1) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id`, [EMAIL])).rows[0].id
const session = randomBytes(32).toString('base64url')
await db.query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 hour')`, [sha(session), uid])
const H = { cookie: `hd_session=${session}`, 'content-type': 'application/json' }
const call = (p, b, m = 'POST') => fetch(BASE + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }).then(r => r.json())

const marks = {}
try {
  // the demo research project
  const { id: cid } = await call('/api/library', { title: 'أحاديث النية — بحث الماجستير', description: 'جمع روايات حديث «إنما الأعمال بالنيات» وما في معناه، ومقارنة ألفاظها وطرقها.' })
  for (const ref of ['5', '11631', '5338']) await call(`/api/library/collections/${cid}/items`, { kind: 'hadith', ref })
  await call(`/api/library/collections/${cid}/items`, { kind: 'narrator', ref: '4677', label: 'عمر بن الخطاب' })
  await call(`/api/library/collections/${cid}/items`, { kind: 'search', ref: 'q=' + encodeURIComponent('الأعمال بالنية'), label: '«الأعمال بالنية»' })
  await call('/api/library/notes', { kind: 'hadith', ref: '5', body: 'أصلٌ في باب النيات. قارن لفظ «بالنية» عند البخاري في كتاب الإيمان (54).', tags: ['النية', 'ماجستير', 'الفصل الأول'] }, 'PUT')
  await call('/api/library/notes', { kind: 'hadith', ref: '11631', body: 'حديث جبريل: تعريف الإسلام والإيمان والإحسان.', tags: ['الإيمان', 'ماجستير'] }, 'PUT')
  const { id: c2 } = await call('/api/library', { title: 'مرويات أمهات المؤمنين', description: 'ما روته أمهات المؤمنين في الصحيحين.' })
  for (const ref of ['6', '7']) await call(`/api/library/collections/${c2}/items`, { kind: 'hadith', ref })
  await call('/api/library', { title: 'غريب الحديث: الزُّبد والزَّبَد', description: null })
  await call('/api/library/highlights', { hadith_id: 5, part: 'matn', start_at: 0, end_at: 22, quote: 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ', note: 'موضع الشاهد: الحصر بـ«إنما».' })
  const { share_token } = await call(`/api/library/collections/${cid}/share`, { on: true })

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 })
  await ctx.addCookies([{ name: 'hd_session', value: session, url: BASE }])
  const HIDE = 'nextjs-portal{display:none!important} header{position:static!important} [aria-label="تثبيت التطبيق"]{display:none!important}'
  const shot = async (name, url, sel, act, height = 1000) => {
    const p = await ctx.newPage()
    await p.setViewportSize({ width: 1280, height })
    await p.goto(BASE + url, { waitUntil: 'networkidle', timeout: 180000 })
    await p.evaluate(() => document.fonts.ready)
    await p.addStyleTag({ content: HIDE })
    if (act) await act(p)
    await p.waitForTimeout(700)
    marks[name] = {}
    for (const [k, s] of Object.entries(sel)) {
      const b = await p.locator(s).first().boundingBox().catch(() => null)
      marks[name][k] = b && [Math.round(b.x), Math.round(b.y + (await p.evaluate(() => window.scrollY))), Math.round(b.width), Math.round(b.height)]
    }
    await p.screenshot({ path: path.join(here, 'shots', `${name}.png`), fullPage: true })
    await p.close()
  }

  // 1 · the save menu on a hadith page
  await shot('save', '/hadith/9', { button: 'button:has-text("☆ حفظ")', menu: 'text=احفظ في مجموعة' }, async p => {
    await p.locator('button:has-text("☆ حفظ")').first().click()
    await p.waitForTimeout(1200)
    await p.evaluate(() => window.scrollTo(0, 0))
  }, 1100)
  // 2 · a note and tags
  await shot('note', '/hadith/5', { note: 'text=ملاحظتك البحثية', matn: '#matn' }, async p => {
    await p.waitForTimeout(1200)
    await p.evaluate(() => window.scrollTo(0, 0))
  }, 1500)
  // 3 · the highlight
  await shot('highlight', '/hadith/5', { matn: '#matn .hadith-matn', list: 'text=تظليلاتك على هذا الحديث' }, async p => { await p.waitForTimeout(1500) }, 1500)
  // 4 · the library
  await shot('library', '/library', { collections: 'text=المجموعات', notes: 'text=الملاحظات' }, null, 1300)
  // 5 · a collection, and its export menu
  await shot('collection', `/library/${cid}`, { header: 'h1', list: 'ol' }, null, 1200)
  await shot('export', `/library/${cid}`, { menu: 'text=BibTeX / BibLaTeX', button: 'summary:has-text("تصدير المراجع")' }, async p => {
    await p.locator('summary:has-text("تصدير المراجع")').click()
  }, 1000)
  // 6 · the shared, read-only page
  await shot('shared', `/library/shared/${share_token}`, { header: 'h1' }, null, 1100)
  await browser.close()

  // the BibTeX and footnotes the film shows, as exported
  marks.bib = await fetch(`${BASE}/api/cite?ids=5,5338&format=bib`).then(r => r.text())
  marks.footnote = await fetch(`${BASE}/api/cite?ids=5338&format=txt`).then(r => r.text())
} finally {
  await db.query(`DELETE FROM users WHERE email = $1`, [EMAIL])
  await db.end()
}
writeFileSync(path.join(here, 'shots', 'marks.json'), JSON.stringify(marks, null, 1))
console.log(JSON.stringify(Object.fromEntries(Object.entries(marks).filter(([k]) => typeof marks[k] === 'object'))))
console.log('demo account deleted')
