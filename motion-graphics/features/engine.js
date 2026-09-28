// Shared engine for the feature films (square 1080×1080). A film page defines, before loading this:
//   const FILM = { bounds: [...scene start times..., end], lengths: null, captions: null }
// then builds its timeline with tw()/show()/hooks and calls startFilm().
//
// Every element's look is a pure function of time, so a film plays live and also renders frame by
// frame (?capture=1 exposes window.__render(t) and window.__duration to render-film.mjs).
// narrate.mjs fills FILM.lengths (each scene stretched to its narration: it plays, holds on its last
// frame, then runs its exit) and FILM.captions ([[start, end, text], …] in film time), which are
// drawn in the caption bar so they are part of the picture.

const EXIT = 0.9 // length of a scene's exit transition
const $ = id => document.getElementById(id)
const ease = {
  out: t => 1 - Math.pow(1 - t, 3),
  inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  back: t => { const c = 1.5; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2) },
  lin: t => t,
}
const tracks = new Map() // element → [{ start, dur, from, to, ease }]
const hooks = []         // (authored time) => void, for anything not expressible as a tween

function tw(target, start, dur, from, to, e = 'out') {
  const el = typeof target === 'string' ? $(target) : target
  if (!el) throw new Error(`tw: no element ${target}`)
  if (!tracks.has(el)) tracks.set(el, [])
  tracks.get(el).push({ start, dur, from, to, ease: ease[e] })
}
// fade/drift in at a, out at b (b null: stays)
function show(id, a, b, { y = 30, x = 0, s = 1, d = .7, outD = .5 } = {}) {
  tw(id, a, d, { o: 0, y, x, s }, { o: 1, y: 0, x: 0, s: 1 })
  if (b != null) tw(id, b, outD, { o: 1, y: 0, x: 0, s: 1 }, { o: 0, y: -24, x: 0, s: 1 }, 'inOut')
}
// pop in (scale from small) at a, fade out at b
function pop(id, a, b, d = .6) {
  tw(id, a, d, { o: 0, s: .7, y: 16 }, { o: 1, s: 1, y: 0 }, 'back')
  if (b != null) tw(id, b, .5, { o: 1 }, { o: 0 }, 'inOut')
}
// a whole scene's container: visible between a and b
function scene(id, a, b) {
  tw(id, a, 0, { o: 1 }, { o: 1 })
  tw(id, a - .001, 0, { o: 0 }, { o: 0 })
  if (b != null) tw(id, b, .5, { o: 1 }, { o: 0 }, 'inOut')
}

const DEF = { o: 1, x: 0, y: 0, s: 1, r: 0, sx: 1, dash: 0, w: null }
function valueAt(list, t) {
  const v = { ...DEF, ...list[0].from }
  for (const k of list) {
    if (t < k.start) break
    const q = k.ease(k.dur <= 0 ? 1 : Math.min(1, (t - k.start) / k.dur))
    for (const key of Object.keys(k.to)) { const a = k.from[key] ?? v[key]; v[key] = a + (k.to[key] - a) * q }
  }
  return v
}

let LENGTHS, DURATION
function warp(t) { // film time → authored time
  const B = FILM.bounds
  let start = 0
  for (let i = 0; i < LENGTHS.length; i++) {
    const a = B[i], span = B[i + 1] - a, len = LENGTHS[i], last = i === LENGTHS.length - 1
    if (t < start + len || last) {
      const u = t - start
      if (last) return a + Math.min(u, span)
      const play = span - EXIT
      if (u < play) return a + u
      if (u < len - EXIT) return a + play
      return a + play + (u - (len - EXIT))
    }
    start += len
  }
  return B[B.length - 1]
}

function drawCaption(filmT) {
  const bar = $('caption')
  if (!bar) return
  const c = (FILM.captions || []).find(([a, b]) => filmT >= a - .15 && filmT <= b + .25)
  if (!c) { bar.style.opacity = 0; return }
  const [a, b, text] = c
  const o = Math.min(1, (filmT - (a - .15)) / .15, (b + .25 - filmT) / .25)
  if (bar.dataset.text !== text) { bar.dataset.text = text; bar.firstElementChild.textContent = text }
  bar.style.opacity = Math.max(0, o)
}

function render(filmT) {
  const t = warp(filmT)
  for (const [el, list] of tracks) {
    list.sort((a, b) => a.start - b.start)
    const v = valueAt(list, t)
    el.style.opacity = v.o
    el.style.visibility = v.o < .005 ? 'hidden' : 'visible'
    if (el.tagName === 'path' || el.tagName === 'line' || el.tagName === 'polyline') { el.style.strokeDashoffset = v.dash; continue }
    if (v.w != null) el.style.width = `${v.w}%`
    el.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.s}) rotate(${v.r}deg) scaleX(${v.sx})`
  }
  hooks.forEach(h => h(t))
  drawCaption(filmT)
}

function startFilm() {
  LENGTHS = FILM.lengths ?? FILM.bounds.slice(1).map((b, i) => b - FILM.bounds[i])
  DURATION = LENGTHS.reduce((a, b) => a + b, 0)
  const stage = $('stage')
  const bar = document.createElement('div')
  bar.id = 'caption'; bar.innerHTML = '<span></span>'
  stage.appendChild(bar)
  const fit = () => { const s = Math.min(innerWidth / stage.offsetWidth, innerHeight / stage.offsetHeight); stage.style.transform = `scale(${s})` }
  window.__duration = DURATION
  window.__render = render
  if (new URLSearchParams(location.search).has('capture')) {
    document.body.classList.add('capture'); render(0); return
  }
  addEventListener('resize', fit); fit()
  const ctl = document.createElement('div')
  ctl.id = 'ctl'
  ctl.innerHTML = '<button id="play">إيقاف</button><button id="replay">إعادة</button><input id="seek" type="range" min="0" step="0.01" value="0"><span id="clock">0.0</span>'
  document.body.appendChild(ctl)
  let t0 = null, playing = true, now = 0
  const seek = $('seek'), clock = $('clock'), btn = $('play')
  seek.max = DURATION
  function frame(ts) {
    if (playing) { if (t0 == null) t0 = ts - now * 1000; now = (ts - t0) / 1000; if (now >= DURATION) { now = DURATION; playing = false; btn.textContent = 'تشغيل' } }
    render(now); seek.value = now; clock.textContent = now.toFixed(1); requestAnimationFrame(frame)
  }
  btn.onclick = () => { if (now >= DURATION) now = 0; playing = !playing; t0 = null; btn.textContent = playing ? 'إيقاف' : 'تشغيل' }
  $('replay').onclick = () => { now = 0; t0 = null; playing = true; btn.textContent = 'إيقاف' }
  seek.oninput = () => { now = +seek.value; t0 = null }
  document.fonts.ready.then(() => requestAnimationFrame(frame))
}

// Shared closing scene: "try it" + the page to open. `a` is its start (authored time).
function outro(a, path, title = 'جرّبها بنفسك') {
  const stage = $('stage')
  const add = (id, cls, style, html) => {
    const d = document.createElement('div'); d.id = id; d.className = `el ${cls}`; d.style.cssText = style; d.innerHTML = html
    stage.appendChild(d); return d
  }
  add('o-t', 'center-x h1', 'top:330px', title)
  add('o-u', 'center-x', 'top:470px', `<span class="pill mono" style="font-size:34px;direction:ltr">hadith.dev${path}</span>`)
  add('o-s', 'center-x lead', 'top:560px', 'موسوعة الحديث النبوي الشريف على الويب')
  show('o-t', a + .1, null, { y: 40 }); show('o-u', a + .6, null, { y: 20, s: .9 }); show('o-s', a + 1.1, null, { y: 20 })
}
