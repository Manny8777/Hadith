// Adds an Arabic voice-over to <film>.mp4 (default migration-film) with Gemini TTS (Google AI Studio API).
// Each line is generated once into motion-graphics/audio/NN.wav (delete a file, or pass --only N,
// to regenerate it). The film is then stretched to the voice rather than the voice sped up: each
// scene is lengthened to fit its line (SCENE_LENGTHS in migration-film.html), the film is
// re-rendered, and the lines are mixed in at their scenes' starts → migration-film-narrated.mp4.
// The key is read from GEMINI_API_KEY or .env.local (gitignored).
//
//   node motion-graphics/narrate.mjs [--film migration-film] [--voice Charon] [--model gemini-3.8-flash-tts] [--style '…'] [--only 3] [--captions-only]
//
// Also writes migration-film.srt (captions timed to the narration); --captions-only writes just
// that, without re-rendering or mixing.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.dirname(here)
const args = process.argv.slice(2)
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1] }
const FILM = opt('film', 'migration-film')
const VOICE = opt('voice', 'Charon')
const ONLY = opt('only', null)
const CAPTIONS_ONLY = args.includes('--captions-only')
const MODEL = opt('model', 'gemini-3.8-flash-tts')
const STYLE = opt('style', 'calm, measured documentary narration in Modern Standard Arabic')

function apiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY
  const f = path.join(root, '.env.local')
  if (existsSync(f)) {
    const m = readFileSync(f, 'utf8').match(/^\s*GEMINI_API_KEY\s*=\s*"?([^"\r\n]+)"?/m)
    if (m) return m[1].trim()
  }
  throw new Error('GEMINI_API_KEY not found in the environment or .env.local')
}

// <film>.lines.json: { sceneBounds (as SCENE_BOUNDS in <film>.html), lines: [[scene index,
// delay into the scene (s), text, caption?], …] } — one line per scene; the caption, when given,
// is what is shown in place of the spoken text (e.g. «hadith.dev» for a name spelled out to be read).
const { sceneBounds: SCENE_BOUNDS, lines: LINES } = JSON.parse(readFileSync(path.join(here, `${FILM}.lines.json`), 'utf8'))
const TAIL = 0.9      // after a line ends, before the scene's exit finishes
const LAST_TAIL = 2   // the closing frame holds a little longer

// The API allows a few requests a minute on lower tiers: on 429, wait as long as it says and retry
async function tts(text, out, attempt = 1) {
  try {
    return await ttsOnce(text, out)
  } catch (e) {
    const wait = String(e.message).match(/TTS 429.*?retry in (\d+)s/)
    if (!wait || attempt > 6) throw e
    const s = Number(wait[1]) + 2
    process.stdout.write(`rate-limited, waiting ${s}s… `)
    await new Promise(r => setTimeout(r, s * 1000))
    return tts(text, out, attempt + 1)
  }
}

async function ttsOnce(text, out) {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: STYLE }] }] }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: VOICE }] },
    }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`TTS ${res.status}: ${body.slice(0, 300)}`)
  const json = JSON.parse(body)
  const audio = (json.steps ?? []).filter(s => s.type === 'model_output')
    .flatMap(s => s.content ?? []).filter(c => c.type === 'audio').pop()
  if (!audio?.data) throw new Error(`TTS: no audio in response (${body.slice(0, 200)})`)
  writeFileSync(out, Buffer.from(audio.data, 'base64'))
}

const duration = f => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString())

const dir = path.join(here, FILM === 'migration-film' ? 'audio' : `audio-${FILM.replace(/[\\/]/g, '-')}`)
mkdirSync(dir, { recursive: true })
const lengths = SCENE_BOUNDS.slice(1).map((b, i) => b - SCENE_BOUNDS[i])
const clips = []
for (const [i, [scene, lead, text, caption]] of LINES.entries()) {
  const f = path.join(dir, `${String(i + 1).padStart(2, '0')}.wav`)
  if (ONLY ? String(i + 1) === ONLY : !existsSync(f)) {
    process.stdout.write(`line ${i + 1}: generating… `)
    await tts(text, f)
    console.log('ok')
  }
  const len = duration(f)
  const last = scene === lengths.length - 1
  lengths[scene] = Math.max(lengths[scene], +(lead + len + (last ? LAST_TAIL : TAIL)).toFixed(2))
  clips.push({ f, scene, lead, len, text: caption ?? text })
}
const starts = lengths.map((_, i) => lengths.slice(0, i).reduce((a, b) => a + b, 0))
clips.forEach(c => console.log(`line ${c.scene + 1}: ${c.len.toFixed(2)}s · scene ${lengths[c.scene].toFixed(2)}s from ${starts[c.scene].toFixed(2)}s`))
console.log(`film: ${lengths.reduce((a, b) => a + b, 0).toFixed(2)}s`)

// Captions: each line on screen while it is spoken; a long line is split into two rows at the
// punctuation mark nearest its middle.
const NL = '\n'
const stamp = t => {
  const ms = Math.round(t * 1000)
  const p = (n, w = 2) => String(n).padStart(w, '0')
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`
}
const rows = text => {
  if (text.length <= 42) return text
  const mid = text.length / 2
  const cuts = [...text.matchAll(/[،:…]\s*/g)].map(m => m.index + m[0].length).filter(i => i < text.length - 1)
  const cut = cuts.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0]
  return cut ? text.slice(0, cut).trim() + NL + text.slice(cut).trim() : text
}
const srt = clips.map((c, i) => {
  const start = starts[c.scene] + c.lead
  return [i + 1, `${stamp(start)} --> ${stamp(start + c.len)}`, rows(c.text), ''].join(NL)
}).join(NL)
const srtFile = path.join(here, `${FILM}.srt`)
// UTF-8 with BOM and CRLF line ends: what most players and editors expect of an Arabic .srt
writeFileSync(srtFile, '﻿' + srt.split(NL).join('\r\n'))
console.log(`captions → ${srtFile}`)
if (CAPTIONS_ONLY) process.exit(0)

// Stretch the film to the voice and re-render it
const html = path.join(here, `${FILM}.html`)
const src = readFileSync(html, 'utf8')
// The film holds its scene lengths (and, for the feature films, its captions) on marked lines:
//   const SCENE_LENGTHS = … // @narration-timing      or      lengths: …, // @narration-timing
//   captions: …, // @narration-captions    ([start, end, text] in film time, drawn in the picture)
if (!src.includes('@narration-timing')) throw new Error(`no @narration-timing marker in ${FILM}.html`)
const captions = clips.map(c => {
  const s = +(starts[c.scene] + c.lead).toFixed(2)
  return [s, +(s + c.len).toFixed(2), c.text]
})
const patched = src
  .replace(/(const SCENE_LENGTHS =|lengths:)[^\n]*?(,?)\s*\/\/ @narration-timing/,
    (_, key, comma) => `${key} ${JSON.stringify(lengths)}${comma} // @narration-timing`)
  .replace(/(captions:)[^\n]*?(,?)\s*\/\/ @narration-captions/,
    (_, key, comma) => `${key} ${JSON.stringify(captions)}${comma} // @narration-captions`)
writeFileSync(html, patched)
execFileSync('node', [path.join(here, 'render-film.mjs'), '--film', FILM], { stdio: 'inherit' })

// Mix each line in at its scene's start
const video = path.join(here, `${FILM}.mp4`)
const out = path.join(here, `${FILM}-narrated.mp4`)
const inputs = clips.flatMap(c => ['-i', c.f])
const chains = clips.map((c, i) =>
  `[${i + 1}:a]aresample=48000,adelay=${Math.round((starts[c.scene] + c.lead) * 1000)}:all=1[a${i}]`)
const mix = `${clips.map((_, i) => `[a${i}]`).join('')}amix=inputs=${clips.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad[aout]`
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', video, ...inputs,
  '-filter_complex', [...chains, mix].join(';'),
  '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out],
  { stdio: 'inherit' })
console.log(`video → ${out}`)
