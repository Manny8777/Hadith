// Captures the real site pages the promo film shows (motion-graphics/promo/shots/*.png), from a
// running copy of the site. Most shots are of one element (a section, a card) rather than the whole
// window, so the film can show them large.
//   node motion-graphics/promo/capture.mjs [--base http://localhost:3000] [--only name]
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1] }
const BASE = opt('base', 'http://localhost:3000')
const ONLY = opt('only', null)

// Open a collapsed section
const open = id => async p => {
  const sec = p.locator(`#${id}`)
  if (!(await sec.count())) { console.log(`  no #${id}`); return }
  await sec.scrollIntoViewIfNeeded()
  await sec.locator('button').first().click().catch(() => {})
  await p.waitForTimeout(3000)
}

// [name, url, action, { el: selector to shoot (else the window), maxH: css px, phone, dark, width }]
const SHOTS = [
  ['home', '/', null, {}],
  ['hadith', '/hadith/5', null, { marks: { card: '#source-details', sanad: '.hadith-sanad', matn: '.hadith-matn', numbering: 'header >> text=مطبوع' } }],
  ['hadith-card', '/hadith/5', null, { el: 'main', maxH: 760 }],
  ['isnad', '/hadith/5', open('isnad'), { el: '#isnad', maxH: 900 }],
  ['isnad-tree', '/hadith/5', async p => { await open('isnad')(p); await p.getByText('الشجرة الكاملة').first().click().catch(() => {}); await p.waitForTimeout(4000) }, { el: '#isnad', maxH: 900 }],
  ['aqwal', '/hadith/94983', open('aqwal'), { el: '#aqwal', maxH: 800 }],
  ['takhrij', '/hadith/5', open('takhrij'), { el: '#takhrij', maxH: 800 }],
  ['variants', '/hadith/5', open('variants'), { el: '#variants', maxH: 900 }],
  ['similarity', '/hadith/5', open('matn-similarity'), { el: '#matn-similarity', maxH: 800 }],
  ['tarf', '/hadith/94983', async p => { await p.locator('.hadith-tarf').first().hover().catch(() => {}); await p.waitForTimeout(600) }, { el: '.hadith-matn', pad: 40 }],
  ['narrator', '/narrator/4677', null, { marks: { title: 'main h1' } }],
  ['search', '/search?q=' + encodeURIComponent('إنما الأعمال بالنيات'), null, { marks: { box: 'main form', hit: 'main mark' } }],
  ['books', '/books', null, {}],
  ['narrators', '/narrators', null, {}],
  ['lexicon', '/lexicon', null, {}],
  ['quran', '/quran', null, {}],
  ['topics', '/topics', null, {}],
  ['dark', '/hadith/5', null, { dark: true }],
  ['phone', '/hadith/5', null, { phone: true }],
]

const browser = await chromium.launch()
for (const [name, url, act, o] of SHOTS) {
  if (ONLY && ONLY !== name) continue
  const ctx = await browser.newContext(o.phone
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
    : { viewport: { width: o.width ?? 1280, height: 800 }, deviceScaleFactor: 2 })
  if (o.dark) await ctx.addInitScript(() => { try { localStorage.setItem('theme', 'dark') } catch {} })
  const p = await ctx.newPage()
  await p.goto(BASE + url, { waitUntil: 'networkidle', timeout: 180000 }).catch(() => {})
  await p.evaluate(() => document.fonts.ready)
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' }) // the dev badge
  if (act) await act(p)
  const file = path.join(here, 'shots', `${name}.png`)
  // Where named parts sit in a whole-window shot (CSS px), so the film can zoom to them
  if (o.marks) {
    const mf = path.join(here, 'shots', 'marks.json')
    const all = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : {}
    all[name] = {}
    for (const [k, sel] of Object.entries(o.marks)) {
      const b = await p.locator(sel).first().boundingBox().catch(() => null)
      all[name][k] = b && [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]
    }
    writeFileSync(mf, JSON.stringify(all, null, 1))
  }
  if (o.el) {
    const box = await p.locator(o.el).first().boundingBox()
    if (!box) { console.log(`  no ${o.el}`); await ctx.close(); continue }
    await p.setViewportSize({ width: o.width ?? 1280, height: Math.ceil(Math.max(800, box.height + 200)) })
    await p.waitForTimeout(300)
    const b = await p.locator(o.el).first().boundingBox()
    const pad = o.pad ?? 0
    await p.screenshot({ path: file, fullPage: true,
      clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + 2 * pad, height: Math.min(b.height, o.maxH ?? b.height) + 2 * pad } })
  } else {
    await p.screenshot({ path: file })
  }
  console.log('shot', name)
  await ctx.close()
}
await browser.close()
