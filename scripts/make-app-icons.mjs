// The installed-app icons in public/icons/, drawn from the brand icon (public/assets/brand/al-jami-icon.svg):
//   icon-192.png, icon-512.png    the icon as it is (rounded tile)            manifest, purpose "any"
//   maskable-512.png              full-bleed green, the mark inside the 80%   manifest, purpose "maskable"
//                                 safe zone (Android crops it to its own shape)
//   apple-touch-icon.png (180)    full-bleed green (iOS rounds the corners)   <link rel="apple-touch-icon">
//
// Run: node scripts/make-app-icons.mjs
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(path.join(root, 'public/assets/brand/al-jami-icon.svg'), 'utf8')
// the mark alone (the icon without its rounded background tile)
const mark = svg.replace(/<rect[^>]*\/>/, '')
const out = path.join(root, 'public/icons')
mkdirSync(out, { recursive: true })

const GREEN = '#0F3D2E'
const tile = (size, html) => `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;background:transparent">${html}</body></html>`
const svgAt = (s, size) => s.replace('<svg ', `<svg width="${size}" height="${size}" `)
const fullBleed = (size, scale) => tile(size,
  `<div style="width:${size}px;height:${size}px;background:${GREEN};display:flex;align-items:center;justify-content:center">${svgAt(mark, Math.round(size * scale))}</div>`)

const jobs = [
  ['icon-192.png', 192, tile(192, svgAt(svg, 192))],
  ['icon-512.png', 512, tile(512, svgAt(svg, 512))],
  ['maskable-512.png', 512, fullBleed(512, 0.78)],
  ['apple-touch-icon.png', 180, fullBleed(180, 0.92)],
]

const browser = await chromium.launch()
for (const [name, size, html] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await page.setContent(html)
  await page.screenshot({ path: path.join(out, name), omitBackground: true })
  await page.close()
  console.log(`${name} (${size}×${size})`)
}
await browser.close()
