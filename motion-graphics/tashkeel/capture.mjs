// Captures the search pages the «مطابقة التشكيل» film shows (motion-graphics/tashkeel/shots/*.png)
// with where their parts sit (shots/marks.json, CSS px) so the film can zoom to them.
//   node motion-graphics/tashkeel/capture.mjs [--base https://hadith.dev]
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const BASE = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'https://hadith.dev'
const q = (s, exact) => `/search?q=${encodeURIComponent(s)}${exact ? '&tashkeel=1' : ''}`
const COMMON = { input: 'main input[type="text"], main input[type="search"]', toggle: 'button:has-text("مطابقة التشكيل")', count: 'text=اكتمل البحث', first: 'main a[href^="/hadith/"]' }
const SHOTS = [
  ['plain', q('زبد'), {}],                                   // the ordinary search: every vowelling together
  ['zabd', q('زَبْدِ', true), { hit: 'text=زَبْدِ الْمُشْرِكِينَ' }],   // gifts
  ['zabad', q('زَبَدِ', true), { hit: 'text=زَبَدِ الْبَحْرِ' }],    // foam
  ['zubd', q('الزُّبْد', true), { hit: 'text=فَلَا يَأْكُلِ الزُّبْدَ' }], // butter
]
const marks = {}
const browser = await chromium.launch()
for (const [name, url, extra] of SHOTS) {
  const p = await browser.newPage({ viewport: { width: 1280, height: 1600 }, deviceScaleFactor: 2 })
  await p.goto(BASE + url, { waitUntil: 'networkidle', timeout: 180000 })
  await p.locator('text=اكتمل البحث').first().waitFor({ timeout: 60000 })
  await p.evaluate(() => document.fonts.ready)
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important} header{position:static!important} [aria-label="تثبيت التطبيق"]{display:none!important}' })
  // the filters panel sits between the toggle and the results; fold it so both fit
  await p.evaluate(() => document.querySelectorAll('details[open]').forEach(d => d.removeAttribute('open')))
  await p.waitForTimeout(800)
  marks[name] = {}
  for (const [k, s] of Object.entries({ ...COMMON, ...extra })) {
    const b = await p.locator(s).first().boundingBox().catch(() => null)
    marks[name][k] = b && [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]
  }
  await p.screenshot({ path: path.join(here, 'shots', `${name}.png`) })
  await p.close()
}
await browser.close()
writeFileSync(path.join(here, 'shots', 'marks.json'), JSON.stringify(marks, null, 1))
console.log(JSON.stringify(marks))
