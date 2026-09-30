'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import ReactFlow, { Background, Controls, Handle, Position, type Node, type Edge, type ReactFlowInstance } from 'reactflow'
import 'reactflow/dist/style.css'
import { extractMatnForComparison, stripXmlToVerbatim } from '@/lib/hadithText'
import { useTheme } from '@/lib/themeContext'
import { useFlowTouchLock, FlowTouchToggle } from './FlowTouchLock'

// The parallel narrations of a hadith, compared word for word with its own matn:
//   · المتن المجمَّع — this hadith's matn with every other wording inline where it occurs,
//     «[وفي رواية: …]» with a note number (as the printed takhrij editions do);
//   · خريطة الاختلافات — the whole matn as a line read right to left, the other wordings beneath;
//   · نصوص الروايات — each version's own matn in full, its differing words highlighted.

// ── Types ──────────────────────────────────────────────────────────────────────

interface SourceRef {
  id: number
  bookTitle: string
  num: string | null
}

interface RawParallel {
  main_id: number
  book_title: string
  takhrij_death: number | null
  tarf: string | null
  content: string | null
  tarqeem_matboa1: string | null
  tarqeem_harf: string | null
}

interface TextEntry {
  id: number
  bookTitle: string
  takhrij_death: number | null
  matn: string       // extracted, cleaned matn text
  num: string | null // display number (matboa1 preferred, else harf)
}

// ── Text utilities ─────────────────────────────────────────────────────────────

const cleanForComparison = (s: string) => s
  .replace(/[0-9٠-٩]+/g, ' ')
  .replace(/[-–—]/g, ' ')
  .replace(/[،؛؟,.;:!?()\[\]{}"'«»""'']/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

function resolveMatnText(content: string | null, tarf: string | null): string {
  if (content) {
    const fromContent = extractMatnForComparison(content)
    if (fromContent) return fromContent
    if (!/<متن[\s>]/.test(content)) {
      // Another chain of the same hadith («بهذا الإسناد… وقال في حديثه»): the book prints no matn,
      // but the record carries the full wording of this chain in <متن_مخفي نص="…"/>. Its tarf field
      // then holds sanad text, not matn, so without that there is nothing to compare.
      const hidden = content.match(/<متن_مخفي[^>]*\sنص="([^"]*)"/)?.[1]
      return hidden ? cleanForComparison(stripXmlToVerbatim(hidden)) : ''
    }
  }
  if (tarf) {
    const fromTarf = extractMatnForComparison(tarf)
    if (fromTarf) return fromTarf
    return cleanForComparison(stripXmlToVerbatim(tarf)) // the tarf is the matn's opening — no sanad
  }
  return ''
}

function normWord(w: string): string {
  return w
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ًٌٍَُِّْٰـ]/g, '')
}

function tokenize(s: string): string[] {
  return s.split(/\s+/).filter(w => w.length > 0)
}

// ── Alignment ──────────────────────────────────────────────────────────────────

type Pair = { ai: number; oi: number }

function lcsAlign(a: string[], b: string[]): Pair[] {
  const m = a.length, n = b.length
  const dp: Uint16Array[] = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  const pairs: Pair[] = []
  let i = m, j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { pairs.push({ ai: i - 1, oi: j - 1 }); i--; j-- }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--
    else j--
  }
  return pairs.reverse()
}

// On long texts, a lone match of a short, common word (و، قال، الله…) between two unrelated stretches
// is a coincidence, not an alignment — it would split one difference into scattered pieces. Keep a
// match only when it is part of a run of two or more, or the word is distinctive on its own.
function align(a: string[], b: string[]): Pair[] {
  const pairs = lcsAlign(a, b)
  return pairs.filter((p, i) => {
    const prev = pairs[i - 1], next = pairs[i + 1]
    const inRun = (prev && prev.ai === p.ai - 1 && prev.oi === p.oi - 1) || (next && next.ai === p.ai + 1 && next.oi === p.oi + 1)
    return inRun || a[p.ai].length >= 5
  })
}

// ── Variants ───────────────────────────────────────────────────────────────────

interface Wording {
  at: number                        // shown after this word of the matn (-1: before the first)
  replaces: [number, number] | null // the matn's words it replaces (inclusive), or null for an addition
  text: string
  sources: SourceRef[]
}

// One point of difference: every wording the versions give for one stretch of the matn
interface Variant {
  n: number
  at: number
  span: [number, number] | null     // the matn's words the wordings replace, if any
  wordings: Wording[]               // most widely narrated first
}

const SANAD_WORDS = new Set(['حدثنا', 'حدثني', 'اخبرنا', 'اخبرني', 'انبانا', 'انباني', 'ثنا', 'حدثناه', 'اخبرناه'])
const MAX_EDGE_WORDS = 8
const MAX_WORDS = 24

// The same words at one point, whichever exact stretch of this matn they stand for (e.g. «رجل» for
// «امرئ مسلم» in some versions and for «امرئ» in others), are one wording with all their sources
function mergeWordings(ws: Wording[]): Wording[] {
  const byText = new Map<string, Wording>()
  for (const w of ws) {
    const key = `${w.replaces ? 'r' : 'i'}|${tokenize(w.text).map(normWord).join(' ')}`
    const have = byText.get(key)
    if (!have) { byText.set(key, { ...w, sources: [...w.sources] }); continue }
    for (const src of w.sources) if (!have.sources.some(x => x.id === src.id)) have.sources.push(src)
  }
  return [...byText.values()].sort((a, b) => b.sources.length - a.sources.length)
}

function buildVariants(source: TextEntry, others: TextEntry[]): Variant[] {
  const srcNorm = tokenize(source.matn).map(normWord)
  const byKey = new Map<string, Wording>()

  for (const other of others) {
    const words = tokenize(other.matn)
    const pairs = align(srcNorm, words.map(normWord))
    const ref: SourceRef = { id: other.id, bookTitle: other.bookTitle, num: other.num }

    for (let g = 0; g <= pairs.length; g++) {
      const prevAi = g === 0 ? -1 : pairs[g - 1].ai
      const nextAi = g === pairs.length ? srcNorm.length : pairs[g].ai
      const prevOi = g === 0 ? -1 : pairs[g - 1].oi
      const nextOi = g === pairs.length ? words.length : pairs[g].oi
      const theirs = words.slice(prevOi + 1, nextOi)
      if (theirs.length === 0) continue // this version simply lacks these words — not a wording of its own

      const edge = g === 0 || g === pairs.length
      // Not wordings of this matn, and shown in full under «نصوص الروايات» instead:
      // chain text that some records carry inside their matn (a second isnad «حدثنا فلان…»),
      if (theirs.some(w => SANAD_WORDS.has(normWord(w)))) continue
      // a longer telling's own opening or ending (the story before or after this matn),
      if (edge && theirs.length > MAX_EDGE_WORDS) continue
      // and a whole passage in the middle that has no counterpart here
      if (theirs.length > MAX_WORDS) continue
      let at: number, replaces: [number, number] | null
      const ours = nextAi - prevAi - 1
      // At either end, a short stretch of this matn against a short one of theirs is another wording
      // of the same words («نزل أهل قريظة» for «لما نزلت بنو قريظة»), not an addition
      if (ours > 0 && (!edge || ours <= theirs.length + 2)) {
        replaces = [prevAi + 1, nextAi - 1]; at = nextAi - 1
      } else {
        // An addition — or, at either end, where a version that tells only part of the story joins
        // or leaves the text: shown at that point rather than as replacing everything before or after
        replaces = null; at = g === 0 ? nextAi - 1 : prevAi
      }
      const text = theirs.join(' ')
      const key = `${at}|${replaces?.join('-') ?? ''}|${theirs.map(normWord).join(' ')}`
      const v = byKey.get(key) ?? { at, replaces, text, sources: [] }
      if (!v.sources.some(s => s.id === ref.id)) v.sources.push(ref)
      byKey.set(key, v)
    }
  }

  // Group the wordings whose stretches overlap or touch into one point of difference
  const range = (w: Wording): [number, number] => w.replaces ?? [w.at + .5, w.at + .5]
  const sorted = [...byKey.values()].sort((a, b) => range(a)[0] - range(b)[0] || range(a)[1] - range(b)[1])
  // (only short stretches: a wording that replaces a long passage would chain everything together,
  // so it stands as a point of its own)
  const SHORT = 6
  const groups: Wording[][] = []
  let end = -Infinity
  for (const w of sorted) {
    const [a, b] = range(w)
    if (b - a + 1 > SHORT) { groups.push([w]); continue }
    const g = groups.findLast(g => range(g[0])[1] - range(g[0])[0] + 1 <= SHORT)
    if (g && a <= end + 1) { g.push(w); end = Math.max(end, b) }
    else { groups.push([w]); end = b }
  }
  groups.sort((x, y) => Math.max(...x.map(w => range(w)[1])) - Math.max(...y.map(w => range(w)[1])))
  return groups.map((ws, i) => {
    const spans = ws.filter(w => w.replaces).map(w => w.replaces!)
    const last = Math.max(...ws.map(w => range(w)[1]))
    return {
      n: i + 1,
      at: Math.floor(last),
      span: spans.length ? [Math.min(...spans.map(r => r[0])), Math.max(...spans.map(r => r[1]))] : null,
      wordings: mergeWordings(ws),
    }
  })
}

const clip = (text: string, n: number) => { const w = text.split(' '); return w.length > n ? w.slice(0, n).join(' ') + ' …' : text }

// ── المتن المجمَّع ─────────────────────────────────────────────────────────────

function CompositeMatn({ source, variants, active, setActive }: {
  source: TextEntry
  variants: Variant[]
  active: number | null
  setActive: (n: number | null) => void
}) {
  const words = useMemo(() => tokenize(source.matn), [source])
  const after = useMemo(() => {
    const m = new Map<number, Variant[]>()
    for (const v of variants) m.set(v.at, [...(m.get(v.at) ?? []), v])
    return m
  }, [variants])
  const activeSpan = variants.find(v => v.n === active)?.span ?? null

  // Inline, a point shows its two most widely narrated wordings; the note lists them all
  const note = (v: Variant) => (
    <span key={v.n} tabIndex={0}
      title={v.wordings.map(w => `${w.text} — ${w.sources.map(x => x.bookTitle + (x.num ? ' ' + x.num : '')).join('، ')}`).join('\n')}
      onMouseEnter={() => setActive(v.n)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(v.n)} onBlur={() => setActive(null)}
      className={`inline rounded px-0.5 mx-0.5 cursor-help transition-colors text-[0.92em] ${active === v.n ? 'bg-amber-100 text-amber-950' : 'text-amber-900/80 hover:bg-amber-50'}`}>
      <span className="text-gray-400">[</span>
      <span className="text-gray-500">وفي رواية: </span>
      {v.wordings.slice(0, 2).map((w, i) => (
        <span key={i}>
          {i > 0 && <span className="text-gray-400"> · </span>}
          {!w.replaces && <span className="text-gray-500">زيادة </span>}{clip(w.text, 8)}
        </span>
      ))}
      {v.wordings.length > 2 && <span className="text-gray-500 font-sans text-[0.8em]"> +{v.wordings.length - 2}</span>}
      <span className="text-gray-400">]</span>
      <sup className="text-[0.62em] text-amber-700 font-sans font-semibold mr-0.5">{v.n}</sup>
    </span>
  )

  return (
    <p dir="rtl" className="font-[Amiri,serif] text-[1.125rem] leading-[2.3] text-gray-900 rounded-xl border border-border bg-surface px-5 py-4">
      {(after.get(-1) ?? []).map(note)}
      {words.map((w, i) => {
        const inSpan = activeSpan && i >= activeSpan[0] && i <= activeSpan[1]
        return (
          <span key={i}>
            {i > 0 && ' '}
            <span className={inSpan ? 'bg-amber-200/60 rounded' : undefined}>{w}</span>
            {(after.get(i) ?? []).map(note)}
          </span>
        )
      })}
    </p>
  )
}

// ── خريطة الاختلافات ───────────────────────────────────────────────────────────
// The whole matn as a line read right to left: this hadith's wording runs along the top in boxes,
// and wherever the versions part, the stretch they differ on is boxed (with its note number) and
// the other wordings hang beneath it, each with its books, rejoining the line after. Positions are
// computed, so boxes never overlap, and nothing is draggable.

const MAP_GAP_X = 34
const MAP_GAP_Y = 12
const MAP_ALT_TOP = 36      // space between the line and the wordings beneath it
const MAP_LONG_SPAN = 8

type MapSeg =
  | { kind: 'common'; id: string; words: string[] }
  | { kind: 'diff'; id: string; n: number; words: string[]; wordings: Wording[] }

// The matn cut into shared stretches and points of difference (overlapping points merged, so the
// line never doubles back)
function buildSegments(words: string[], variants: Variant[]): MapSeg[] {
  const range = (v: Variant): [number, number] => v.span ? [v.span[0], v.span[1]] : [v.at + 1, v.at]
  const isLong = (v: Variant) => !!v.span && v.span[1] - v.span[0] + 1 > MAP_LONG_SPAN
  // A wording that rewrites a long passage would swallow the points inside it into one box: it is
  // mapped only where it overlaps no other point (else it is read whole under «نصوص الروايات»)
  const short = variants.filter(v => !isLong(v))
  const overlaps = (v: Variant) => { const [s, e] = range(v); return short.some(o => { const [a, b] = range(o); return a <= e && s <= b }) }
  const kept = variants.filter(v => !isLong(v) || !overlaps(v)).sort((x, y) => range(x)[0] - range(y)[0])

  const points: { n: number; s: number; e: number; wordings: Wording[] }[] = []
  for (const v of kept) {
    const [s, e] = range(v)
    const last = points[points.length - 1]
    if (last && s <= last.e) { last.e = Math.max(last.e, e); last.wordings = mergeWordings([...last.wordings, ...v.wordings]) }
    else points.push({ n: v.n, s, e, wordings: [...v.wordings] })
  }
  const segs: MapSeg[] = []
  let cursor = 0
  for (const p of points) {
    if (p.s > cursor) segs.push({ kind: 'common', id: `c${cursor}`, words: words.slice(cursor, p.s) })
    segs.push({ kind: 'diff', id: `d${p.n}`, n: p.n, words: words.slice(p.s, p.e + 1), wordings: p.wordings })
    cursor = Math.max(cursor, p.e + 1)
  }
  if (cursor < words.length) segs.push({ kind: 'common', id: `c${cursor}`, words: words.slice(cursor) })
  return segs
}

// Rough rendered sizes (tashkeel takes no width of its own, so it is not counted)
const textWidth = (t: string) => t.replace(/[ً-ٰٟ]/g, '').length * 7.8
const boxWidth = (t: string) => Math.round(Math.max(56, Math.min(250, textWidth(t) + 30)))
const linesOf = (t: string, w: number) => Math.max(1, Math.ceil(textWidth(t) / (w - 26)))
function chipsHeight(sources: SourceRef[], w: number): number {
  let lines = sources.length ? 1 : 0, x = 0
  for (const s of sources) {
    const cw = s.bookTitle.length * 5.6 + (s.num ? s.num.length * 6.5 + 16 : 0) + 10
    if (x + cw > w - 20 && x > 0) { lines++; x = 0 }
    x += cw
  }
  return lines * 21
}
const wordingText = (w: Wording) => (w.replaces ? '' : 'زيادة: ') + w.text

function MapLineBox({ data }: { data: { seg: MapSeg; width: number } }) {
  const { seg, width } = data
  const diff = seg.kind === 'diff'
  return (
    <div dir="rtl" style={{ width }}
      className={`relative rounded-lg border px-3 py-2 text-center ${diff ? 'border-amber-400 bg-amber-50' : 'border-border bg-surface'}`}>
      <Handle type="target" position={Position.Right} style={{ opacity: 0 }} />
      {diff && <span className="absolute -top-2.5 right-2 rounded-full bg-amber-600 text-white text-[10px] font-sans font-semibold px-1.5 leading-4">{seg.n}</span>}
      <p className="font-[Amiri,serif] text-[16px] leading-[26px] text-gray-900">
        {seg.words.length ? seg.words.join(' ') : <span className="text-amber-600 font-sans text-sm">＋</span>}
      </p>
      <Handle type="source" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" id="down" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}

function MapWordingBox({ data }: { data: { w: Wording; width: number; currentId: number } }) {
  const { w, width } = data
  return (
    <div dir="rtl" style={{ width }} className="rounded-lg border border-border bg-surface px-3 py-2 text-center shadow-sm">
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <p className="font-[Amiri,serif] text-[15px] leading-[24px] text-gray-800" title={w.text}>{wordingText(w)}</p>
      <div className="mt-1 flex flex-wrap justify-center gap-x-1.5 gap-y-0.5">
        {w.sources.map(s => (
          // Opens in a new tab, so the reader keeps their place in the map; nopan/nodrag stop React
          // Flow from treating the click as the start of a pan
          <a key={s.id} href={`/hadith/${s.id}`} target="_blank" rel="noopener"
            title={`فتح ${s.bookTitle}${s.num ? ` ${s.num}` : ''} في صفحة جديدة`}
            className="nodrag nopan inline-flex items-center gap-1 text-[11px] font-sans text-green-800 hover:underline cursor-pointer">
            {s.bookTitle}
            {s.num && <span className="rounded-full bg-green-50 border border-green-100 px-1.5 text-green-700 hover:bg-green-100 hover:border-green-300">{s.num}</span>}
          </a>
        ))}
      </div>
    </div>
  )
}

const MAP_NODE_TYPES = { line: MapLineBox, wording: MapWordingBox }

function VariantMap({ source, variants }: { source: TextEntry; variants: Variant[] }) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const touchLock = useFlowTouchLock()
  const wrap = useRef<HTMLDivElement>(null)

  const { nodes, edges, total, height } = useMemo(() => {
    const segs = buildSegments(tokenize(source.matn), variants)
    // column widths: a point of difference is as wide as its widest wording
    const widths = segs.map(seg => {
      const own = seg.words.length ? boxWidth(seg.words.join(' ')) : 44
      return seg.kind === 'diff' ? Math.max(own, ...seg.wordings.map(w => Math.max(170, boxWidth(wordingText(w))))) : own
    })
    const lineH = Math.max(...segs.map((seg, i) => 16 + linesOf(seg.words.join(' ') || '+', widths[i]) * 26))
    const total = widths.reduce((a, w) => a + w, 0) + MAP_GAP_X * (segs.length - 1)

    const nodes: Node[] = []
    const edges: Edge[] = []
    const stroke = dark ? '#5B6470' : '#c9bfa8'
    let right = total, height = lineH
    segs.forEach((seg, i) => {
      const w = widths[i]
      const x = right - w
      right = x - MAP_GAP_X
      nodes.push({ id: seg.id, type: 'line', position: { x, y: 0 }, data: { seg, width: w }, draggable: false, selectable: false })
      if (i > 0) edges.push({ id: `e-${segs[i - 1].id}-${seg.id}`, source: segs[i - 1].id, target: seg.id, type: 'straight', style: { stroke, strokeWidth: 1.5 } })
      if (seg.kind !== 'diff') return
      let y = lineH + MAP_ALT_TOP
      seg.wordings.forEach((wd, k) => {
        const id = `${seg.id}-w${k}`
        nodes.push({ id, type: 'wording', position: { x, y }, data: { w: wd, width: w, currentId: source.id }, draggable: false, selectable: false })
        edges.push({ id: `e-${id}`, source: seg.id, sourceHandle: 'down', target: id, type: 'smoothstep',
          style: { stroke, strokeWidth: 1.2, strokeDasharray: '4 3' } })
        y += 20 + linesOf(wordingText(wd), w) * 24 + chipsHeight(wd.sources, w) + MAP_GAP_Y
      })
      height = Math.max(height, y)
    })
    return { nodes, edges, total, height }
  }, [source, variants, dark])

  // Opens at the start of the matn (the right end), at a readable size; drag to follow the text
  const [width, setWidth] = useState(900)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const zoom = 0.9
  const onInit = (rf: ReactFlowInstance) => rf.setViewport({ x: width - 16 - total * zoom, y: 24, zoom })
  const boxH = Math.min(900, Math.max(200, height * zoom + 48))

  return (
    <div ref={wrap} style={{ height: boxH }} className="relative w-full rounded-xl border border-border overflow-hidden bg-surface">
      <FlowTouchToggle {...touchLock} />
      <ReactFlow
        key={`${width}`}
        nodes={nodes}
        edges={edges}
        nodeTypes={MAP_NODE_TYPES}
        onInit={onInit}
        // React Flow gives nodes that are neither draggable nor selectable `pointer-events: none`;
        // a click handler keeps them live so the source links inside can be clicked
        onNodeClick={() => {}}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        preventScrolling={false}
        translateExtent={[[-80, -60], [total + 80, height + 80]]}
        minZoom={0.3}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
        {...touchLock.flowProps}
      >
        <Background color={dark ? '#2A313A' : '#e7e5e4'} gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
      <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-surface/90 border border-border px-3 py-1 text-[11px] font-sans text-gray-500">
        اسحب لمتابعة المتن ←
      </p>
    </div>
  )
}

// ── نصوص الروايات ──────────────────────────────────────────────────────────────
// Every parallel's own matn in full, with the words that differ from this hadith's matn marked, and
// how much of the two texts is shared.

interface VersionDiff {
  entry: TextEntry
  words: { text: string; differs: boolean }[]
  shared: number      // % of words the two texts share (Dice over the alignment)
  missing: number     // words of this hadith's matn this version does not have
  partial: boolean    // the version gives only part of the matn
}

function diffVersion(sourceNorm: string[], entry: TextEntry): VersionDiff {
  const words = tokenize(entry.matn)
  const pairs = align(sourceNorm, words.map(normWord))
  const matched = new Set(pairs.map(p => p.oi))
  const shared = Math.round((2 * pairs.length * 100) / (sourceNorm.length + words.length || 1))
  return {
    entry,
    words: words.map((text, i) => ({ text, differs: !matched.has(i) })),
    shared,
    missing: sourceNorm.length - pairs.length,
    partial: words.length < sourceNorm.length * 0.6,
  }
}

function VersionList({ source, others, chainOnly }: {
  source: TextEntry
  others: TextEntry[]
  chainOnly: SourceRef[]
}) {
  const [openAll, setOpenAll] = useState(false)
  const diffs = useMemo(() => {
    const sourceNorm = tokenize(source.matn).map(normWord)
    return others.map(e => diffVersion(sourceNorm, e)).sort((a, b) => b.shared - a.shared)
  }, [source, others])
  if (diffs.length === 0 && chainOnly.length === 0) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h3 className="text-sm font-bold text-gray-700">
          نصوص الروايات
          <span className="text-xs font-normal text-gray-400 mr-2">({diffs.length} رواية)</span>
        </h3>
        <button type="button" onClick={() => setOpenAll(o => !o)} className="text-xs text-green-700 hover:underline">
          {openAll ? 'طيّ الكل' : 'فتح الكل'}
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        متن كل روايةٍ كاملًا، والألفاظ التي تخالف متن هذا الحديث <mark className="bg-amber-100 text-amber-900 rounded px-1">مظلَّلة</mark> — مرتّبةً من الأقرب إلى الأبعد
      </p>
      <div className="space-y-2">
        {diffs.map(d => (
          <details key={`${d.entry.id}-${openAll}`} open={openAll || undefined}
            className="group rounded-xl border border-border bg-surface open:shadow-sm">
            <summary className="flex items-center gap-3 flex-wrap cursor-pointer list-none px-4 py-2.5">
              <span className="text-gray-400 text-xs transition-transform group-open:rotate-90">◀</span>
              <a href={`/hadith/${d.entry.id}`} onClick={e => e.stopPropagation()}
                className="font-semibold text-sm text-green-800 hover:underline">
                {d.entry.bookTitle}{d.entry.num ? ` (${d.entry.num})` : ''}
              </a>
              {d.entry.takhrij_death != null && <span className="text-xs text-gray-400">ت {d.entry.takhrij_death} هـ</span>}
              <span className="flex-1" />
              {d.partial && <span className="text-[11px] rounded-full bg-blue-50 text-blue-700 px-2 py-0.5">طرفٌ منه</span>}
              <span className={`text-[11px] rounded-full px-2 py-0.5 ${d.shared >= 85 ? 'bg-green-50 text-green-800' : d.shared >= 60 ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700'}`}>
                تطابق {d.shared}٪
              </span>
            </summary>
            <div className="px-4 pb-3 pt-1 border-t border-border">
              <p dir="rtl" className="font-[Amiri,serif] text-[1.0625rem] leading-loose text-gray-800">
                {d.words.map((w, i) => (
                  <span key={i}>{i > 0 && ' '}{w.differs ? <mark className="bg-amber-100 text-amber-900 rounded px-0.5">{w.text}</mark> : w.text}</span>
                ))}
              </p>
              <p className="text-[11px] text-gray-400 mt-1.5">
                {d.words.filter(w => w.differs).length} لفظًا مخالفًا أو زائدًا
                {d.missing > 0 && ` · ليس فيها ${d.missing} لفظًا من متن هذا الحديث`}
              </p>
            </div>
          </details>
        ))}
      </div>
      {chainOnly.length > 0 && (
        <p className="text-xs text-gray-500 mt-3 leading-relaxed">
          <span className="font-semibold text-gray-600">أسانيد أخرى دون متنٍ مسجَّل: </span>
          {chainOnly.map((c, i) => (
            <span key={c.id}>{i > 0 && '، '}<a href={`/hadith/${c.id}`} className="text-green-700 hover:underline">{c.bookTitle}{c.num ? ` (${c.num})` : ''}</a></span>
          ))}
        </p>
      )}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export default function MatnVariants({
  hadithId, currentTarf, currentBookTitle, currentDeath,
}: {
  hadithId: number
  currentTarf: string | null
  currentBookTitle: string
  currentDeath: number | null
}) {
  const [rawParallels, setRawParallels] = useState<RawParallel[]>([])
  const [sourceMatn, setSourceMatn] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    setLoading(true)
    setRawParallels([])
    setSourceMatn(null)

    Promise.all([
      fetch(`/api/hadith/${hadithId}/parallel`).then(r => r.json()),
      fetch(`/api/hadith/${hadithId}/text`).then(r => r.json()),
    ])
      .then(([parallelData, textData]) => {
        setRawParallels(parallelData.parallels || [])
        setSourceMatn(textData.text ?? null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [hadithId])

  // This hadith first, then every parallel that has a matn to compare
  const textEntries = useMemo(() => {
    const sourceText = sourceMatn ?? resolveMatnText(null, currentTarf)
    const entries: TextEntry[] = []
    if (sourceText.trim().length > 3) {
      entries.push({ id: hadithId, bookTitle: currentBookTitle, takhrij_death: currentDeath, matn: sourceText, num: null })
    }
    for (const p of rawParallels) {
      const matn = resolveMatnText(p.content, p.tarf)
      if (matn.trim().length > 3) {
        entries.push({
          id: p.main_id,
          bookTitle: p.book_title,
          takhrij_death: p.takhrij_death,
          matn,
          num: p.tarqeem_matboa1 ?? p.tarqeem_harf ?? null,
        })
      }
    }
    return entries
  }, [hadithId, rawParallels, sourceMatn, currentTarf, currentBookTitle, currentDeath])

  // Parallels with no matn recorded at all, listed after the comparisons
  const chainOnly = useMemo(() => rawParallels
    .filter(p => resolveMatnText(p.content, p.tarf).trim().length <= 3)
    .map(p => ({ id: p.main_id, bookTitle: p.book_title, num: p.tarqeem_matboa1 ?? p.tarqeem_harf ?? null })),
  [rawParallels])

  const variants = useMemo(
    () => textEntries.length >= 2 ? buildVariants(textEntries[0], textEntries.slice(1)) : [],
    [textEntries],
  )

  if (loading) {
    return <p className="text-xs text-gray-400 py-2">جاري تحميل المتون...</p>
  }

  if (textEntries.length < 2) {
    return <p className="text-xs text-gray-400">لا توجد روايات كافية للمقارنة</p>
  }

  return (
    <div className="space-y-8">

      {/* ── المتن المُجمَّع ── */}
      <div>
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <h3 className="text-sm font-bold text-gray-700">المتن المُجمَّع</h3>
          <span className="text-xs text-gray-400">
            {variants.length} اختلافًا في {textEntries.length - 1} رواية
          </span>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          متن هذا الحديث ({currentBookTitle})، وألفاظ الروايات الأخرى في مواضعها — مرّر على أي اختلافٍ لترى ما يقابله في المتن، ومصادرُه في الخريطة تحته برقمه
        </p>
        {variants.length === 0
          ? <p className="text-sm text-gray-500">الروايات متفقة في ألفاظ هذا المتن.</p>
          : <CompositeMatn source={textEntries[0]} variants={variants} active={active} setActive={setActive} />}
      </div>

      {/* ── خريطة الاختلافات ── */}
      {variants.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-1">خريطة الاختلافات</h3>
          <p className="text-xs text-gray-400 mb-3">
            المتن كاملًا من اليمين إلى اليسار: مواضع الاختلاف مظلَّلة بأرقامها، وتحت كلٍّ منها ألفاظ الروايات الأخرى وكتبها
          </p>
          <VariantMap source={textEntries[0]} variants={variants} />
        </div>
      )}

      {/* ── نصوص الروايات ── */}
      <VersionList source={textEntries[0]} others={textEntries.slice(1)} chainOnly={chainOnly} />

    </div>
  )
}
