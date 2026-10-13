// Captures the pages the «حديث جابر» film shows (motion-graphics/chains/shots/*.png): Jabir's hadith of
// the Prophet's Hajj in Sahih Muslim (1218, hadith 15048), its takhrij, and its full isnad tree.
//   node motion-graphics/chains/capture.mjs [--base https://hadith.dev]
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const BASE = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'https://hadith.dev'
const ID = 15048
const HIDE = 'nextjs-portal{display:none!important} header{position:static!important} [aria-label="تثبيت التطبيق"]{display:none!important}'

const open = id => async p => {
  const sec = p.locator(`#${id}`)
  await sec.scrollIntoViewIfNeeded()
  await sec.locator('button').first().click().catch(() => {})
  await p.waitForTimeout(5000)
}
const SHOTS = [
  ['hadith', null, null],
  ['takhrij', open('takhrij'), '#takhrij'],
  ['tree', async p => { await open('isnad')(p); await p.getByText('الشجرة الكاملة').first().click().catch(() => {}); await p.waitForTimeout(8000) }, '#isnad'],
  // the top of the tree, close enough to read: zoomed in on the madar (Jabir) with the mouse wheel
  ['tree-zoom', async p => {
    await open('isnad')(p); await p.getByText('الشجرة الكاملة').first().click().catch(() => {}); await p.waitForTimeout(8000)
    const node = p.locator('.react-flow__node', { hasText: 'جابر' }).first()
    const b = await node.boundingBox()
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 60)
    for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, -300); await p.waitForTimeout(250) }
    await p.waitForTimeout(1200)
  }, '.react-flow'],
]
const browser = await chromium.launch()
for (const [name, act, el] of SHOTS) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/hadith/${ID}`, { waitUntil: 'networkidle', timeout: 180000 }).catch(() => {})
  await p.evaluate(() => document.fonts.ready)
  await p.addStyleTag({ content: HIDE })
  if (act) await act(p)
  const file = path.join(here, 'shots', `${name}.png`)
  if (el) await p.locator(el).screenshot({ path: file })
  else await p.screenshot({ path: file })
  console.log(name)
  await ctx.close()
}
await browser.close()
