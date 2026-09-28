// Renders <film>.html (default migration-film) to an MP4 (or, with --stills t1,t2,…, to PNG stills) by seeking the
// film's deterministic timeline frame by frame in headless Chromium and piping PNGs into ffmpeg.
//   node motion-graphics/render-film.mjs [--film migration-film] [--fps 30] [--out motion-graphics/<film>.mp4]
//   node motion-graphics/render-film.mjs --stills 3,9,17 --out <dir>
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1] }
const here = path.dirname(fileURLToPath(import.meta.url))
const FILM = opt('film', 'migration-film')
const FPS = Number(opt('fps', '30'))
const stills = opt('stills', null)
const out = opt('out', path.join(here, stills ? 'stills' : `${FILM}.mp4`))

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await page.goto(pathToFileURL(path.join(here, `${FILM}.html`)).href + '?capture=1')
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(500)
const stage = page.locator('#stage')

if (stills) {
  mkdirSync(out, { recursive: true })
  for (const t of stills.split(',').map(Number)) {
    await page.evaluate(t => window.__render(t), t)
    await stage.screenshot({ path: path.join(out, `t${String(t).padStart(5, '0')}.png`) })
  }
  console.log(`stills → ${out}`)
} else {
  const duration = await page.evaluate(() => window.__duration)
  const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', out],
    { stdio: ['pipe', 'ignore', 'inherit'] })
  const frames = Math.round(duration * FPS)
  for (let f = 0; f <= frames; f++) {
    await page.evaluate(t => window.__render(t), f / FPS)
    const png = await stage.screenshot({ type: 'png' })
    if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r))
    if (f % (FPS * 5) === 0) console.log(`  ${(f / FPS).toFixed(0)}s / ${duration}s`)
  }
  ff.stdin.end()
  await new Promise(r => ff.on('close', r))
  console.log(`video → ${out}`)
}
await browser.close()
