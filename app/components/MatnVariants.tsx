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
//   · خريطة الاختلافات — how the versions word the hadith, as a tree that branches where they part;
//   · the numbered notes — which books carry each wording;
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
      wordings: ws.sort((a, b) => b.sources.length - a.sources.length),
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
    <a key={v.n} href={`#matn-variant-${v.n}`}
      onMouseEnter={() => setActive(v.n)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(v.n)} onBlur={() => setActive(null)}
      className={`inline rounded px-0.5 mx-0.5 no-underline transition-colors text-[0.92em] ${active === v.n ? 'bg-amber-100 text-amber-950' : 'text-amber-900/80 hover:bg-amber-50'}`}>
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
    </a>
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

function VariantNotes({ variants, active, setActive }: {
  variants: Variant[]
  active: number | null
  setActive: (n: number | null) => void
}) {
  return (
    <ol className="rounded-xl border border-border bg-surface divide-y divide-border">
      {variants.map(v => (
        <li key={v.n} id={`matn-variant-${v.n}`}
          onMouseEnter={() => setActive(v.n)} onMouseLeave={() => setActive(null)}
          className={`flex gap-3 px-4 py-2 scroll-mt-24 transition-colors ${active === v.n ? 'bg-amber-50' : ''}`}>
          <span className="shrink-0 w-8 text-xs font-semibold text-amber-700 font-sans pt-1">({v.n})</span>
          <div className="min-w-0 flex-1 space-y-2">
            {v.wordings.map((w, i) => (
              <div key={i}>
                <p className="font-[Amiri,serif] text-[0.95rem] text-gray-700 leading-relaxed">
                  {!w.replaces && <span className="text-gray-500">زيادة: </span>}{clip(w.text, 14)}
                </p>
                <p className="flex flex-wrap gap-x-1.5 gap-y-1">
                  {w.sources.map(s => (
                    <a key={s.id} href={`/hadith/${s.id}`}
                      className="inline-flex items-center gap-1 text-xs text-green-800 hover:underline">
                      {s.bookTitle}
                      {s.num && <span className="rounded-full bg-green-50 border border-green-100 px-1.5 text-[11px] text-green-700 font-sans">{s.num}</span>}
                    </a>
                  ))}
                </p>
              </div>
            ))}
          </div>
        </li>
      ))}
    </ol>
  )
}

// ── خريطة الاختلافات ───────────────────────────────────────────────────────────
// The versions' wordings as a tree read right to left: each box is a run of words that a set of versions
// share, and it branches where their wording parts. Only the opening MAP_WORDS words are mapped — the
// full texts diverge into as many branches as there are versions; the notes cover the rest.
// Positions are computed, so boxes never overlap, and nothing is draggable.

const MAP_WORDS = 10
const MAP_NODE_W = 210
const MAP_GAP_X = 36
const MAP_GAP_Y = 14

interface MapNode {
  id: string
  words: string[]           // display words (with tashkeel) of this run
  more: boolean             // a single version's run that continues past the mapped opening
  versions: TextEntry[]     // every version through this box
  ends: TextEntry[]         // versions whose mapped opening ends here (listed on the box)
  children: MapNode[]
}

function buildMap(entries: TextEntry[]): MapNode[] {
  const toks = new Map(entries.map(e => [e.id, tokenize(e.matn)]))
  const norm = new Map(entries.map(e => [e.id, toks.get(e.id)!.map(normWord)]))
  let seq = 0

  const grow = (versions: TextEntry[], pos: number): MapNode[] => {
    const groups = new Map<string, TextEntry[]>()
    for (const v of versions) {
      const w = norm.get(v.id)![pos]
      if (w === undefined || pos >= MAP_WORDS) continue
      groups.set(w, [...(groups.get(w) ?? []), v])
    }
    return [...groups.values()].sort((a, b) => b.length - a.length).map(g => node(g, pos))
  }

  const node = (versions: TextEntry[], start: number): MapNode => {
    const first = toks.get(versions[0].id)!
    let pos = start
    // extend the run while every version here has the same next word
    while (pos < MAP_WORDS) {
      const w = norm.get(versions[0].id)![pos]
      if (w === undefined || !versions.every(v => norm.get(v.id)![pos] === w)) break
      pos++
    }
    const ends = versions.filter(v => pos >= MAP_WORDS || norm.get(v.id)![pos] === undefined)
    const rest = versions.filter(v => !ends.includes(v))
    return {
      id: `m${seq++}`,
      words: first.slice(start, pos),
      more: ends.length > 0 && ends.every(v => toks.get(v.id)!.length > pos),
      versions,
      ends,
      children: rest.length ? grow(rest, pos) : [],
    }
  }

  return grow(entries, 0)
}

// Rough rendered heights, so each row of the tree is as tall as its tallest box
// (tashkeel takes no width of its own, so it is not counted)
const phraseHeight = (words: string[]) =>
  Math.max(1, Math.ceil((words.join(' ').replace(/[ً-ٰٟ]/g, '').length * 7.6) / (MAP_NODE_W - 28))) * 26
function chipsHeight(vs: TextEntry[]): number {
  let lines = vs.length ? 1 : 0, x = 0
  for (const v of vs) {
    const w = v.bookTitle.length * 6.6 + (v.num ? v.num.length * 7 + 18 : 0) + 14
    if (x + w > MAP_NODE_W - 20 && x > 0) { lines++; x = 0 }
    x += w
  }
  return lines * 22
}
const nodeHeight = (n: MapNode) => 22 + phraseHeight(n.words) + (n.ends.length ? 8 + chipsHeight(n.ends) : 0) + (n.children.length && !n.ends.length ? 16 : 0)

// Laid out sideways in reading order: each run continues to the left in the next column, and a
// box's other continuations stack beneath its first one. A tree that grew downward would be as wide
// as the number of versions; this one is as wide as the opening is long.
function layoutMap(roots: MapNode[]) {
  const depthOf = (n: MapNode): number => 1 + Math.max(0, ...n.children.map(depthOf))
  const columns = Math.max(1, ...roots.map(depthOf))
  const total = columns * MAP_NODE_W + (columns - 1) * MAP_GAP_X
  const colX = (d: number) => total - (d + 1) * MAP_NODE_W - d * MAP_GAP_X

  const pos = new Map<string, { x: number; y: number }>()
  // Returns the bottom edge of the subtree placed at row y
  const place = (n: MapNode, d: number, y: number): number => {
    pos.set(n.id, { x: colX(d), y })
    let bottom = y + nodeHeight(n)
    let cy = y
    for (const c of n.children) {
      const b = place(c, d + 1, cy)
      bottom = Math.max(bottom, b)
      cy = b + MAP_GAP_Y
    }
    return bottom
  }
  let y = 0, height = 0
  for (const r of roots) { height = place(r, 0, y); y = height + MAP_GAP_Y }

  return { pos, total, height }
}

function MapBox({ data }: { data: { n: MapNode; currentId: number } }) {
  const { n, currentId } = data
  const isCurrent = n.versions.some(v => v.id === currentId)
  return (
    <div dir="rtl" style={{ width: MAP_NODE_W }}
      className={`rounded-xl border bg-surface px-3 py-2.5 text-center shadow-sm ${isCurrent ? 'border-amber-400' : 'border-border'}`}>
      <Handle type="target" position={Position.Right} style={{ opacity: 0 }} />
      <p className="font-[Amiri,serif] text-[16px] leading-[26px] font-bold text-gray-900">
        {n.words.join(' ')}{n.more && <span className="text-gray-400"> …</span>}
      </p>
      {n.ends.length > 0 ? (
        <div className="mt-2 flex flex-wrap justify-center gap-x-1.5 gap-y-1">
          {n.ends.map(v => v.id === currentId ? (
            <span key={v.id} className="text-[11px] font-sans font-semibold text-amber-800 bg-amber-50 rounded-full px-2">هذا الحديث</span>
          ) : (
            <a key={v.id} href={`/hadith/${v.id}`} className="nodrag inline-flex items-center gap-1 text-[11px] font-sans text-green-800 hover:underline">
              {v.bookTitle}
              {v.num && <span className="rounded-full bg-green-50 border border-green-100 px-1.5 text-green-700">{v.num}</span>}
            </a>
          ))}
        </div>
      ) : n.children.length > 0 && (
        <p className="mt-1 text-[11px] font-sans text-gray-400">{n.versions.length} روايات</p>
      )}
      <Handle type="source" position={Position.Left} style={{ opacity: 0 }} />
    </div>
  )
}

const MAP_NODE_TYPES = { box: MapBox }

function VariantMap({ entries }: { entries: TextEntry[] }) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const touchLock = useFlowTouchLock()
  const wrap = useRef<HTMLDivElement>(null)

  const { nodes, edges, total, height } = useMemo(() => {
    const roots = buildMap(entries)
    const { pos, total, height } = layoutMap(roots)
    const nodes: Node[] = []
    const edges: Edge[] = []
    const add = (n: MapNode, parent: MapNode | null) => {
      const p = pos.get(n.id)!
      nodes.push({ id: n.id, type: 'box', position: p, data: { n, currentId: entries[0].id }, draggable: false, selectable: false })
      if (parent) edges.push({
        id: `${parent.id}-${n.id}`, source: parent.id, target: n.id, type: 'smoothstep',
        style: { stroke: dark ? '#5B6470' : '#c9bfa8', strokeWidth: 1.5 },
      })
      n.children.forEach(c => add(c, n))
    }
    roots.forEach(r => add(r, null))
    return { nodes, edges, total, height }
  }, [entries, dark])

  // Open at a readable size, aligned to the right (where Arabic text starts), rather than shrinking
  // a wide tree until nothing can be read
  // The whole map shown at a readable size: as wide as the page allows, and as tall as it needs
  const [width, setWidth] = useState(900)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const zoom = Math.max(0.7, Math.min(1, (width - 32) / total))
  const onInit = (rf: ReactFlowInstance) => rf.setViewport({ x: width - 16 - total * zoom, y: 16, zoom })
  const boxH = Math.min(1600, Math.max(160, height * zoom + 32))

  return (
    <div ref={wrap} style={{ height: boxH }} className="relative w-full rounded-xl border border-border overflow-hidden bg-surface">
      <FlowTouchToggle {...touchLock} />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={MAP_NODE_TYPES}
        key={`${width}`}
        onInit={onInit}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        preventScrolling={false}
        minZoom={0.3}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
        {...touchLock.flowProps}
      >
        <Background color={dark ? '#2A313A' : '#e7e5e4'} gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
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
          متن هذا الحديث ({currentBookTitle})، وألفاظ الروايات الأخرى في مواضعها — مرّر على أي اختلافٍ لترى ما يقابله في المتن ومصادره
        </p>
        {variants.length === 0
          ? <p className="text-sm text-gray-500">الروايات متفقة في ألفاظ هذا المتن.</p>
          : <CompositeMatn source={textEntries[0]} variants={variants} active={active} setActive={setActive} />}
      </div>

      {/* ── خريطة الاختلافات ── */}
      <div>
        <h3 className="text-sm font-bold text-gray-700 mb-1">خريطة الاختلافات</h3>
        <p className="text-xs text-gray-400 mb-3">
          كيف تبدأ الروايات: كل مربعٍ ألفاظٌ تتفق عليها مجموعةٌ من الروايات، ويتفرّع حيث تختلف — والكتب تحت آخر مربعٍ لكل رواية
        </p>
        <VariantMap entries={textEntries} />
      </div>

      {/* ── مصادر الاختلافات ── */}
      {variants.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-1">
            مصادر الاختلافات
            <span className="text-xs font-normal text-gray-400 mr-2">({variants.length})</span>
          </h3>
          <p className="text-xs text-gray-400 mb-3">كل رقمٍ في المتن أعلاه، والكتب التي جاء فيها ذلك اللفظ</p>
          <VariantNotes variants={variants} active={active} setActive={setActive} />
        </div>
      )}

      {/* ── نصوص الروايات ── */}
      <VersionList source={textEntries[0]} others={textEntries.slice(1)} chainOnly={chainOnly} />

    </div>
  )
}
