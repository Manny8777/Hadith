// Captures the hadith.dev pages the «ما الجامع؟» film shows (motion-graphics/about/shots/*.png) from a
// running copy of the site, with where their parts sit (shots/marks.json, CSS px) so the film can
// zoom to them.   node motion-graphics/about/capture.mjs [--base http://localhost:3000]
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const BASE = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:3000'
const SHOTS = [
  // the hadith page: source card, sanad, matn, the Dorar line under it
  ['hadith', '/hadith/5', 1500, { card: '#source-details', ref: '.hadith-source-edition', sanad: '.hadith-sanad', matn: '.hadith-matn', dorar: 'text=عرض في الدرر السنية' }],
  // a narrator: the imams' statements, attributed
  ['narrator', '/narrator/2472', 1500, { title: 'main h1' }],
  // the takhrij section opened
  ['takhrij', '/hadith/5', 1100, { section: '#takhrij' }, async p => { await p.locator('#takhrij button').first().click(); await p.waitForTimeout(3000); await p.locator('#takhrij').scrollIntoViewIfNeeded() }],
]
const marks = {}
const browser = await chromium.launch()
for (const [name, url, height, sel, act] of SHOTS) {
  const p = await browser.newPage({ viewport: { width: 1280, height }, deviceScaleFactor: 2 })
  await p.goto(BASE + url, { waitUntil: 'networkidle', timeout: 180000 })
  await p.evaluate(() => document.fonts.ready)
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important} header{position:static!important}' })
  if (act) await act(p)
  await p.waitForTimeout(500)
  marks[name] = {}
  for (const [k, s] of Object.entries(sel)) {
    const b = await p.locator(s).first().boundingBox().catch(() => null)
    marks[name][k] = b && [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]
  }
  await p.screenshot({ path: path.join(here, 'shots', `${name}.png`) })
  await p.close()
}
await browser.close()
writeFileSync(path.join(here, 'shots', 'marks.json'), JSON.stringify(marks, null, 1))
console.log(JSON.stringify(marks))
