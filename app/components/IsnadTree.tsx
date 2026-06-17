'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Handle,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useNodesState,
  useEdgesState,
  MarkerType,
  Node,
  Edge,
  Position,
  NodeProps,
  EdgeProps,
} from 'reactflow'
import 'reactflow/dist/style.css'
import dagre from 'dagre'
import Link from 'next/link'
import { useTheme } from '@/lib/themeContext'
import HoverCard from './HoverCard'
import type { Chain, NarratorInChain, CriticismGroup } from './HadithSidebarLayout'

interface Narrator {
  id: number
  name: string
  abb_name: string | null
  martaba_ibn_hajar: string | null
  is_companion: boolean
  tabaqa: string | null
  death_year_num: number | null
  death_year: string | null
}

interface ChainRow {
  hadithId: number
  bookTitle: string
  takhrij_author: string | null
  takhrij_death: number | null
  hadith_num: string | null
  narrators: Narrator[]
  tahdethRaw?: string | null
}

type Mode = 'single' | 'full'
type FullPhase = 'idle' | 'loading' | 'done' | 'error'

const NW = 170
const NH = 50
const MAX_GRAPH_CHAINS = 28

// Estimate a full-tree node's rendered height so dagre leaves enough vertical room
// (long names wrap to several lines). `extraLines` covers the death-year / hadith-number line.
function graphNodeHeight(text: string, extraLines = 1): number {
  const nameLines = Math.min(4, Math.max(1, Math.ceil((text || '').length / 17)))
  return 14 + nameLines * 15 + extraLines * 13 + 8
}

// ─── Shared grade / death helpers (mirror IsnadChainTimeline styling) ──────────

const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']
function toArabicDigits(value: string | number | null | undefined): string {
  if (value == null) return ''
  return String(value).replace(/\d/g, d => AR_DIGITS[Number(d)])
}

// Compact death year (no "ت" prefix). Prefer the canonical numeric year — it's the first date
// listed and keeps nodes from overflowing when the free-text field lists several dates as a sentence.
function firstDeathYear(deathYearNum: number | null, deathYear: string | null | undefined): string | null {
  if (deathYearNum != null && deathYearNum > 0) return `${toArabicDigits(deathYearNum)}هـ`
  const raw = deathYear?.trim()
  if (raw) {
    const m = raw.match(/[\d٠-٩]{1,4}/)
    if (m && m[0] !== '0' && m[0] !== '٠') return `${toArabicDigits(m[0])}هـ`
  }
  return null
}

function deathLabel(nar: NarratorInChain): string | null {
  return firstDeathYear(nar.death_year_num, nar.death_year)
}

// Colour a جرح/تعديل label (matches the narrator page).
function gradingColor(label: string | null): string {
  if (!label) return 'bg-gray-100 text-gray-600 border-gray-200'
  if (/ثقة|صحيح|عدل|صحابي|حافظ|ثبت|حجة|إمام/.test(label)) return 'bg-green-100 text-green-800 border-green-200'
  if (/صدوق|حسن|مقبول|لا بأس|صالح/.test(label)) return 'bg-amber-100 text-amber-800 border-amber-200'
  if (/ضعيف|منكر|متروك|كذاب|واه|متهم|مجهول/.test(label)) return 'bg-red-100 text-red-700 border-red-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

// جرح وتعديل popover: every critic's saying for one narrator (transparency — no single standard).
function CriticismPopover({ nar, groups }: { nar: { id: number; name: string; abb_name?: string | null }; groups: CriticismGroup[] }) {
  const labelCounts: Record<string, number> = {}
  for (const g of groups) for (const e of g.entries) if (e.garh_label) labelCounts[e.garh_label] = (labelCounts[e.garh_label] ?? 0) + 1
  const labels = Object.entries(labelCounts).sort((a, b) => b[1] - a[1])
  return (
    <div>
      <p className="text-xs font-bold text-green-900 mb-2">جرح وتعديل — {nar.abb_name || nar.name}</p>
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2 pb-2 border-b border-border">
          {labels.map(([l, n]) => (
            <span key={l} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${gradingColor(l)}`}>
              {l}{n > 1 ? ` (${n})` : ''}
            </span>
          ))}
        </div>
      )}
      <ul className="space-y-2">
        {groups.map((g, i) => (
          <li key={i} className="text-xs">
            <div className="font-bold text-green-800">{g.scientist_name}</div>
            <div className="space-y-1 mt-0.5">
              {g.entries.map((e, j) => (
                <div key={j} className="flex flex-wrap items-start gap-1.5">
                  {e.garh_label && (
                    <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${gradingColor(e.garh_label)}`}>
                      {e.garh_label}
                    </span>
                  )}
                  <p className="text-ink leading-relaxed flex-1">{e.text}</p>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <Link href={`/narrator/${nar.id}`} className="block mt-2 pt-2 border-t border-border text-[11px] text-green-700 hover:underline">
        الترجمة الكاملة وجميع أقوال النقاد ←
      </Link>
    </div>
  )
}

// ─── Custom ReactFlow node: a rich سلسلة-style narrator card ────────────────────

const RAIL_W = 288

function IsnadRailNode({ data }: NodeProps) {
  const nar = data.nar as NarratorInChain
  const criticism = (data.criticism as CriticismGroup[] | undefined) || []
  const death = deathLabel(nar)
  const hasMeta = nar.is_companion || criticism.length > 0 || nar.tabaqa || nar.mudallis
  return (
    <div
      dir="rtl"
      style={{ width: RAIL_W }}
      className="rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm text-center"
    >
      <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !bg-border !border-0" />
      <Link
        href={`/narrator/${nar.id}`}
        title={nar.name}
        className="block font-bold text-green-800 hover:text-green-600 hover:underline text-[15px] font-serif leading-snug line-clamp-2"
      >
        {nar.abb_name || nar.name}
      </Link>
      {death && (
        <div className="text-[11px] text-gray-400 font-sans mt-2">ت {death}</div>
      )}
      {hasMeta && (
        <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 mt-2">
          {nar.is_companion ? (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-sans font-medium text-amber-800 cursor-help"
              title="صحابي — والصحابة كلهم عدول"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> صحابي
            </span>
          ) : criticism.length > 0 ? (
            <HoverCard
              width="25rem"
              trigger={
                <span className="inline-flex items-center gap-1 text-[11px] font-sans font-medium text-gray-600 bg-surface-sunken border border-border px-2 py-0.5 rounded-full cursor-help">
                  جرح وتعديل
                  <span className="text-gray-400 text-[9px]">▾</span>
                </span>
              }
            >
              <CriticismPopover nar={nar} groups={criticism} />
            </HoverCard>
          ) : null}
          {nar.tabaqa && <span className="text-[11px] text-gray-500 font-sans">{nar.tabaqa}</span>}
          {nar.mudallis && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-sans font-medium text-red-600" title="ذُكر بالتدليس">
              <span aria-hidden>⚠</span> التدليس
            </span>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !bg-border !border-0" />
    </div>
  )
}

const NODE_TYPES = { isnadRail: IsnadRailNode }

// ─── صِيَغ التحديث on edges: aggregate the transmission term per link ─────────────
// For each link A→B, B's receiving صيغة (حدثنا / عن / أخبرنا …) tallied across every
// cross-book route that shares that exact link, with the route count.

interface EdgeTerm { count: number; terms: string[] }

function parseTahdethTerms(raw: string | null | undefined, types: Record<number, string>): Record<number, string> {
  const out: Record<number, string> = {}
  if (!raw) return out
  for (const seg of raw.split('$')) {
    const parts = seg.trim().split(/\s+/)
    if (parts.length >= 2) {
      const nid = parseInt(parts[0], 10), tid = parseInt(parts[1], 10)
      if (!isNaN(nid) && !isNaN(tid) && types[tid] && !out[nid]) out[nid] = types[tid]
    }
  }
  return out
}

function computeEdgeTerms(routes: Array<{ ids: number[]; terms: Record<number, string> }>): Map<string, EdgeTerm> {
  const perTerm = new Map<string, Map<string, number>>() // edgeKey -> term -> count
  const totals = new Map<string, number>()               // edgeKey -> routes on this link
  for (const r of routes) {
    for (let i = 1; i < r.ids.length; i++) {
      const key = `${r.ids[i - 1]}->${r.ids[i]}`
      totals.set(key, (totals.get(key) || 0) + 1)
      const term = (r.terms[r.ids[i]] || '').trim()
      if (!term) continue
      if (!perTerm.has(key)) perTerm.set(key, new Map())
      const m = perTerm.get(key)!
      m.set(term, (m.get(term) || 0) + 1)
    }
  }
  const out = new Map<string, EdgeTerm>()
  for (const [key, count] of totals) {
    const m = perTerm.get(key)
    const terms = m ? [...m.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t) : []
    out.set(key, { count, terms })
  }
  return out
}

// Custom edge that renders the صيغة-التحديث pill just above the TARGET narrator — on the vertical
// entry segment rather than the busy horizontal fan-out line, so labels stay clear of each other.
function TermEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data }: EdgeProps) {
  const [path] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const count = data?.count as number | undefined // shown only in the full tree (and only when > 1)
  const terms = (data?.terms as string[] | undefined) || []
  const labelX = targetX
  const labelY = targetY - 18
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {terms.length > 0 && (
        <EdgeLabelRenderer>
          <div
            dir="rtl"
            className="nodrag nopan flex items-center gap-1 text-[10px] font-serif px-2 py-0.5 rounded-full bg-surface-sunken border border-border text-gray-600 whitespace-nowrap shadow-sm"
            style={{ position: 'absolute', transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'all', zIndex: 0 }}
            title={terms.join(' / ')}
          >
            {count != null && count > 1 && <span className="font-bold text-gray-400">{toArabicDigits(count)}×</span>}
            <span>{terms.join(' / ')}</span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const EDGE_TYPES = { term: TermEdge }

// ─── Single isnad builder: this hadith's chain(s) as a rich vertical flow ───────

function estimateRailHeight(nar: NarratorInChain, hasCriticism: boolean): number {
  // Centered, stacked card: name (≤2 lines) · death line · meta line (جرح وتعديل / tabaqa / tadlis chips).
  const name = nar.abb_name || nar.name || ''
  const nameLines = Math.min(2, Math.max(1, Math.ceil(name.length / 24)))
  const metaItems = (nar.is_companion || hasCriticism ? 1 : 0) + (nar.tabaqa ? 1 : 0) + (nar.mudallis ? 1 : 0)
  const metaLines = metaItems === 0 ? 0 : metaItems >= 3 ? 2 : 1
  return 28 + nameLines * 24 + (deathLabel(nar) ? 18 : 0) + metaLines * 18
}

function buildSingleChain(chains: Chain[], dark: boolean, narratorCriticism: Record<number, CriticismGroup[]>): { nodes: Node[]; edges: Edge[] } {
  const nodeMap = new Map<string, Node>()
  const edgeSet = new Set<string>()
  const edges: Edge[] = []

  nodeMap.set('root', {
    id: 'root',
    data: { label: 'النبي ﷺ' },
    position: { x: 0, y: 0 },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    width: 150,
    height: 44,
    style: {
      background: dark ? '#103A2E' : '#14532d',
      color: dark ? '#ECE6DA' : '#ffffff',
      border: `2px solid ${dark ? '#4EBA65' : '#166534'}`,
      borderRadius: 10, fontFamily: 'Amiri, serif', fontWeight: 'bold',
      fontSize: 14, width: 150, padding: '6px 10px', textAlign: 'center',
    },
  })

  for (const chain of chains) {
    const terms = chain.narratorTerms || {}
    let prev = 'root'
    let prevNar: number | null = null
    for (const nar of chain.narrators) {
      const nid = `n-${nar.id}`
      if (!nodeMap.has(nid)) {
        const criticism = narratorCriticism[nar.id] || []
        nodeMap.set(nid, {
          id: nid,
          type: 'isnadRail',
          data: { nar, criticism },
          position: { x: 0, y: 0 },
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          width: RAIL_W,
          height: estimateRailHeight(nar, criticism.length > 0),
        })
      }
      const ek = `${prev}->${nid}`
      if (!edgeSet.has(ek)) {
        edgeSet.add(ek)
        // Single isnad = one route → show this hadith's own صيغة for the link, no count.
        const term = prevNar != null ? terms[nar.id] : undefined
        edges.push({
          id: ek, source: prev, target: nid,
          type: term ? 'term' : 'smoothstep',
          data: term ? { terms: [term] } : undefined,
          markerEnd: { type: MarkerType.ArrowClosed, color: dark ? '#4EBA65' : '#0F8F6A', width: 14, height: 14 },
          style: { stroke: dark ? '#3A6B57' : '#9FC9BC', strokeWidth: 1.5 },
        })
      }
      prev = nid
      prevNar = nar.id
    }
  }

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  // Extra ranksep leaves a clear gap for the صيغة pill above each card.
  g.setGraph({ rankdir: 'TB', nodesep: 46, ranksep: 76, marginx: 16, marginy: 16 })
  nodeMap.forEach(n => g.setNode(n.id, { width: n.width as number, height: n.height as number }))
  edges.forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)

  const nodes: Node[] = []
  nodeMap.forEach(n => {
    const pos = g.node(n.id)
    if (!pos) return
    const w = n.width as number, h = n.height as number
    nodes.push({ ...n, position: { x: pos.x - w / 2, y: pos.y - h / 2 } })
  })
  return { nodes, edges }
}

// ─── مدار الحديث ───────────────────────────────────────────────────────────────
// The narrator at whom EVERY route converges — derived from the full cross-book tree
// (not the single isnad). It's the full-coverage narrator from whom the routes fan out.
export interface Madar { id: number; name: string; grade: string | null }

function computeMadar(chains: ChainRow[]): Madar | null {
  const total = chains.length
  if (total < 2) return null
  const cov = new Map<number, number>()
  const firstPos = new Map<number, number>()
  const succ = new Map<number, Set<number>>()
  const info = new Map<number, { name: string; grade: string | null }>()
  for (const ch of chains) {
    ch.narrators.forEach((nar, i) => {
      cov.set(nar.id, (cov.get(nar.id) || 0) + 1)
      const fp = firstPos.get(nar.id)
      if (fp == null || i < fp) firstPos.set(nar.id, i)
      if (!info.has(nar.id)) info.set(nar.id, { name: nar.abb_name || nar.name, grade: nar.martaba_ibn_hajar })
      const next = ch.narrators[i + 1]
      if (next) {
        if (!succ.has(nar.id)) succ.set(nar.id, new Set())
        succ.get(nar.id)!.add(next.id)
      }
    })
  }
  // مدار = the FIRST narrator (descending from the Prophet) that sits on the shared trunk
  // (present in every chain) AND whose chain splits to more than one transmitter — i.e. the
  // point where 1→1 transmission first becomes 1→(many).
  const branchPoints = [...cov.entries()]
    .filter(([id, c]) => c === total && (succ.get(id)?.size || 0) >= 2)
    .map(([id]) => id)
    .sort((a, b) => firstPos.get(a)! - firstPos.get(b)!) // shallowest (closest to the Prophet) first
  if (branchPoints.length === 0) return null
  const id = branchPoints[0]
  const meta = info.get(id)!
  return { id, name: meta.name, grade: meta.grade }
}

// Trace the full route through a clicked edge: every ancestor up to النبي ﷺ and every
// descendant down to the book(s). Returns the node + edge ids that make up the path.
function tracePathThroughEdge(source: string, target: string, edges: Edge[]): { nodes: Set<string>; edges: Set<string> } {
  const childMap = new Map<string, string[]>()
  const parentMap = new Map<string, string[]>()
  for (const e of edges) {
    if (!childMap.has(e.source)) childMap.set(e.source, [])
    childMap.get(e.source)!.push(e.target)
    if (!parentMap.has(e.target)) parentMap.set(e.target, [])
    parentMap.get(e.target)!.push(e.source)
  }
  const nodes = new Set<string>([source, target])
  const eids = new Set<string>([`${source}→${target}`])
  const up = [source]
  while (up.length) {
    const n = up.pop()!
    for (const p of parentMap.get(n) ?? []) {
      const id = `${p}→${n}`
      if (!eids.has(id)) { eids.add(id); nodes.add(p); up.push(p) }
    }
  }
  const down = [target]
  while (down.length) {
    const n = down.pop()!
    for (const c of childMap.get(n) ?? []) {
      const id = `${n}→${c}`
      if (!eids.has(id)) { eids.add(id); nodes.add(c); down.push(c) }
    }
  }
  return { nodes, edges: eids }
}

// ─── Full-tree builder (all chains across every takhrij book) ──────────────────

function buildGraph(chains: ChainRow[], currentHadithId: number, dark: boolean, madarId: number | null = null, edgeTerms?: Map<string, EdgeTerm>): { nodes: Node[]; edges: Edge[] } {
  const P = dark ? {
    rootBg: '#103A2E', rootBorder: '#4EBA65', rootText: '#ECE6DA',
    narratorCompanionBg: '#2A2210', narratorBg: '#1C212A',
    narratorText: '#ECE6DA', narratorCompanionBorder: '#D9AD5B', narratorBorder: '#2A313A',
    madarBg: '#2A1F3D', madarBorder: '#B68CFF', madarText: '#F1EAFF',
    currentBookBg: '#D9AD5B', currentBookText: '#1A140A', currentBookBorder: '#E5C27E',
    otherBookBg: '#103450', otherBookText: '#A0DBFF', otherBookBorder: '#4DB9FF',
    edgeCurrentStroke: '#4EBA65', edgeCurrentMarker: '#4EBA65',
    edgeOtherStroke: '#3A424D', edgeOtherMarker: '#5A6470',
    bookEdgeOtherStroke: '#1E466B', bookEdgeOtherMarker: '#4DB9FF',
    grid: '#2A313A',
  } : {
    rootBg: '#14532d', rootBorder: '#166534', rootText: 'white',
    narratorCompanionBg: '#fffbeb', narratorBg: '#f9fafb',
    narratorText: '#111827', narratorCompanionBorder: '#f59e0b', narratorBorder: '#d1d5db',
    madarBg: '#F1ECFA', madarBorder: '#7C4DB8', madarText: '#3F2A66',
    currentBookBg: '#d97706', currentBookText: 'white', currentBookBorder: '#b45309',
    otherBookBg: '#eff6ff', otherBookText: '#1d4ed8', otherBookBorder: '#93c5fd',
    edgeCurrentStroke: '#16a34a', edgeCurrentMarker: '#15803d',
    edgeOtherStroke: '#d1d5db', edgeOtherMarker: '#9ca3af',
    bookEdgeOtherStroke: '#bfdbfe', bookEdgeOtherMarker: '#93c5fd',
    grid: '#e5e7eb',
  }

  const nodeMap = new Map<string, Node>()
  const edgeSet = new Set<string>()
  const rawEdges: Edge[] = []

  // The last narrator in each chain is the book's author/collector — it's represented by the
  // book node itself (book name + hadith reference), so we don't draw a separate node for it.
  const currentEdgeKeys = new Set<string>()
  for (const chain of chains) {
    if (chain.hadithId !== currentHadithId) continue
    let prev = 'root'
    for (let i = 0; i < chain.narrators.length - 1; i++) {
      const nid = `n-${chain.narrators[i].id}`
      currentEdgeKeys.add(`${prev}→${nid}`)
      prev = nid
    }
    currentEdgeKeys.add(`${prev}→book-${chain.hadithId}`)
  }

  nodeMap.set('root', {
    id: 'root',
    data: { label: 'النبي ﷺ' },
    position: { x: 0, y: 0 },
    height: 40,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    style: {
      background: P.rootBg, color: P.rootText, fontFamily: 'Amiri, serif',
      fontSize: 13, fontWeight: 'bold', border: `2px solid ${P.rootBorder}`,
      borderRadius: 8, width: NW, padding: '4px 8px', textAlign: 'center',
    },
  })

  for (const chain of chains) {
    let prevId = 'root'
    let prevNar: number | null = null

    // Skip the last narrator — it's the book's author, shown as the book node itself.
    for (let i = 0; i < chain.narrators.length - 1; i++) {
      const nar = chain.narrators[i]
      const nodeId = `n-${nar.id}`
      if (!nodeMap.has(nodeId)) {
        const raw = (nar.abb_name || nar.name).split('،')[0].trim()
        const dy = firstDeathYear(nar.death_year_num, nar.death_year)
        const deathLine = dy ? `\nت ${dy}` : ''
        const isMadar = madarId != null && nar.id === madarId
        const baseName = nar.is_companion ? `◆ ${raw}` : raw
        const label = (isMadar ? `★ ${baseName}` : baseName) + deathLine
        nodeMap.set(nodeId, {
          id: nodeId,
          data: { label, narratorId: nar.id },
          position: { x: 0, y: 0 },
          height: graphNodeHeight(raw, dy ? 1 : 0),
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          style: {
            background: isMadar ? P.madarBg : (nar.is_companion ? P.narratorCompanionBg : P.narratorBg),
            color: isMadar ? P.madarText : P.narratorText,
            border: `${isMadar ? '2.5px' : '1px'} solid ${isMadar ? P.madarBorder : (nar.is_companion ? P.narratorCompanionBorder : P.narratorBorder)}`,
            borderRadius: 6, fontFamily: 'Amiri, serif',
            fontSize: 11, fontWeight: isMadar ? 'bold' : undefined, width: NW, padding: '3px 6px',
            textAlign: 'center', cursor: 'pointer', whiteSpace: 'pre-line',
          },
        })
      }

      const eKey = `${prevId}→${nodeId}`
      if (!edgeSet.has(eKey)) {
        edgeSet.add(eKey)
        const isCurrent = currentEdgeKeys.has(eKey)
        const et = prevNar != null ? edgeTerms?.get(`${prevNar}->${nar.id}`) : undefined
        rawEdges.push({
          id: eKey, source: prevId, target: nodeId,
          type: et ? 'term' : 'smoothstep',
          data: { ...(et ? { count: et.count, terms: et.terms } : {}), isCurrent },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isCurrent ? P.edgeCurrentMarker : P.edgeOtherMarker,
            width: 12, height: 12,
          },
          style: {
            stroke: isCurrent ? P.edgeCurrentStroke : P.edgeOtherStroke,
            strokeWidth: isCurrent ? 2.5 : 1,
            opacity: isCurrent ? 1 : 0.5,
          },
        })
      }
      prevId = nodeId
      prevNar = nar.id
    }

    const bookId = `book-${chain.hadithId}`
    const isCurrentBook = chain.hadithId === currentHadithId
    if (!nodeMap.has(bookId)) {
      const label = chain.bookTitle
        + (chain.hadith_num ? `\nح ${chain.hadith_num}` : '')
      nodeMap.set(bookId, {
        id: bookId,
        data: { label, hadithId: chain.hadithId },
        position: { x: 0, y: 0 },
        height: graphNodeHeight(chain.bookTitle, chain.hadith_num ? 1 : 0),
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        style: isCurrentBook ? {
          background: P.currentBookBg, color: P.currentBookText,
          border: `2px solid ${P.currentBookBorder}`, borderRadius: 6,
          fontFamily: 'Amiri, serif', fontSize: 10, width: NW,
          padding: '3px 6px', textAlign: 'center', cursor: 'pointer',
          fontWeight: 'bold', whiteSpace: 'pre-line',
        } : {
          background: P.otherBookBg, color: P.otherBookText,
          border: `1px solid ${P.otherBookBorder}`, borderRadius: 6,
          fontFamily: 'Amiri, serif', fontSize: 10, width: NW,
          padding: '3px 6px', textAlign: 'center', cursor: 'pointer',
          whiteSpace: 'pre-line',
        },
      })
    }

    // The final link carries the book author's receiving صيغة (last narrator's term).
    const lastNar = chain.narrators[chain.narrators.length - 1]
    const bKey = `${prevId}→${bookId}`
    if (!edgeSet.has(bKey)) {
      edgeSet.add(bKey)
      const isCurrent = currentEdgeKeys.has(bKey)
      const et = prevNar != null ? edgeTerms?.get(`${prevNar}->${lastNar.id}`) : undefined
      rawEdges.push({
        id: bKey, source: prevId, target: bookId,
        type: et ? 'term' : 'smoothstep',
        data: { ...(et ? { count: et.count, terms: et.terms } : {}), isCurrent },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isCurrent ? P.edgeCurrentMarker : P.bookEdgeOtherMarker,
          width: 10, height: 10,
        },
        style: {
          stroke: isCurrent ? P.edgeCurrentStroke : P.bookEdgeOtherStroke,
          strokeWidth: isCurrent ? 2.5 : 1,
          opacity: isCurrent ? 1 : 0.5,
        },
      })
    }
  }

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  // Generous spacing: room for the multi-line names and the صيغة pills above each node.
  g.setGraph({ rankdir: 'TB', nodesep: 58, ranksep: 96, marginx: 28, marginy: 28 })
  nodeMap.forEach(n => g.setNode(n.id, { width: NW, height: (n.height as number) || NH }))
  rawEdges.forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)

  const nodes: Node[] = []
  nodeMap.forEach(n => {
    const pos = g.node(n.id)
    if (!pos) return
    const h = (n.height as number) || NH
    nodes.push({ ...n, position: { x: pos.x - NW / 2, y: pos.y - h / 2 } })
  })

  return { nodes, edges: rawEdges }
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function IsnadTree({ hadithId, chains, narratorCriticism = {} }: { hadithId: number; chains: Chain[]; narratorCriticism?: Record<number, CriticismGroup[]> }) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const [mode, setMode] = useState<Mode>('single')
  const [fitKey, setFitKey] = useState(0)

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  // Full cross-book tree — fetched once on mount; powers the مدار, the term counts and the full graph.
  const [treePhase, setTreePhase] = useState<FullPhase>('idle')
  const [treeErr, setTreeErr] = useState('')
  const [allChains, setAllChains] = useState<ChainRow[]>([])
  const [tahdethTypes, setTahdethTypes] = useState<Record<number, string>>({})

  // Single isnad view — this hadith's chain(s); each link shows its own صيغة (no count).
  const single = useMemo(() => buildSingleChain(chains, dark, narratorCriticism), [chains, dark, narratorCriticism])

  const graphChains = useMemo(() => {
    const cur = allChains.filter(c => c.hadithId === hadithId)
    const others = allChains.filter(c => c.hadithId !== hadithId)
    return [...cur, ...others].slice(0, MAX_GRAPH_CHAINS)
  }, [allChains, hadithId])

  // صِيَغ التحديث per link, counted across every cross-book route — only meaningful in the full tree.
  const fullEdgeTerms = useMemo(
    () => computeEdgeTerms(allChains.map(c => ({ ids: c.narrators.map(n => n.id), terms: parseTahdethTerms(c.tahdethRaw, tahdethTypes) }))),
    [allChains, tahdethTypes]
  )

  // مدار الحديث — computed from the full cross-book chain set (not the single isnad).
  const madar = useMemo(() => computeMadar(allChains), [allChains])

  const full = useMemo(
    () => (graphChains.length ? buildGraph(graphChains, hadithId, dark, madar?.id ?? null, fullEdgeTerms) : { nodes: [] as Node[], edges: [] as Edge[] }),
    [graphChains, hadithId, dark, madar, fullEdgeTerms]
  )

  // Selected route (full tree only): clicking a line highlights its whole path in blue.
  const [selPath, setSelPath] = useState<{ anchor: string; nodes: Set<string>; edges: Set<string> } | null>(null)

  const fullStyled = useMemo(() => {
    if (!selPath) return full
    const blue = dark ? '#4DB9FF' : '#2563EB'
    const styledNodes: Node[] = full.nodes.map((n): Node =>
      selPath.nodes.has(n.id) ? { ...n, style: { ...n.style, boxShadow: `0 0 0 2.5px ${blue}` } } : n
    )
    const styledEdges: Edge[] = full.edges.map((e): Edge => {
      if (!selPath.edges.has(e.id) || e.data?.isCurrent) return e // keep the original green for the current route
      const mk = e.markerEnd
      return {
        ...e,
        style: { ...e.style, stroke: blue, strokeWidth: 2.5, opacity: 1 },
        markerEnd: mk && typeof mk === 'object' ? { ...mk, color: blue } : mk,
      }
    })
    return { nodes: styledNodes, edges: styledEdges }
  }, [full, selPath, dark])

  // Keep the rendered graph in sync with the active view's data…
  useEffect(() => {
    const view = mode === 'single' ? single : fullStyled
    setNodes(view.nodes)
    setEdges(view.edges)
  }, [mode, single, fullStyled]) // eslint-disable-line react-hooks/exhaustive-deps

  // …and only force a re-fit (remount) when the reader switches mode.
  useEffect(() => { setFitKey(k => k + 1) }, [mode])

  useEffect(() => {
    let cancelled = false
    setTreePhase('loading')
    fetch(`/api/hadith/${hadithId}/tree`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        const rows: ChainRow[] = data.chains || []
        setTahdethTypes(data.tahdethTypes || {})
        if (rows.length === 0) { setTreeErr(data.message || 'لا توجد أسانيد مرتبطة'); setTreePhase('error'); return }
        setAllChains(rows)
        setTreePhase('done')
      })
      .catch(() => { if (!cancelled) { setTreeErr('تعذّر تحميل الشجرة'); setTreePhase('error') } })
    return () => { cancelled = true }
  }, [hadithId])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.data?.narratorId) window.location.href = `/narrator/${node.data.narratorId}`
    else if (node.data?.hadithId) window.location.href = `/hadith/${node.data.hadithId}`
  }, [])

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelPath(prev => {
      if (prev && prev.anchor === edge.id) return null // click the same line again → deselect
      const p = tracePathThroughEdge(edge.source, edge.target, full.edges)
      return { anchor: edge.id, nodes: p.nodes, edges: p.edges }
    })
  }, [full.edges])

  const onPaneClick = useCallback(() => setSelPath(null), [])

  // Drop a stale selection when leaving the full tree or loading a different hadith.
  useEffect(() => { if (mode !== 'full') setSelPath(null) }, [mode])
  useEffect(() => { setSelPath(null) }, [hadithId])

  if (chains.length === 0) return <p className="text-sm text-gray-400">لا يوجد إسناد مسجل لهذا الحديث</p>

  const showGraph = mode === 'single' || treePhase === 'done'
  const isFullTruncated = mode === 'full' && allChains.length > graphChains.length

  return (
    <div dir="rtl" className="space-y-3">
      {/* Mode toggle */}
      <div className="ui-segmented w-fit">
        <button
          type="button"
          onClick={() => setMode('single')}
          className={`ui-segmented-item ${mode === 'single' ? 'ui-segmented-item-active' : ''}`}
        >
          السلسلة
        </button>
        <button
          type="button"
          onClick={() => setMode('full')}
          className={`ui-segmented-item ${mode === 'full' ? 'ui-segmented-item-active' : ''}`}
        >
          الشجرة الكاملة{allChains.length > 0 ? ` (${allChains.length})` : ''}
        </button>
      </div>

      <p className="text-xs text-gray-400">
        {mode === 'single'
          ? 'إسناد هذا الحديث — انقر على الراوي لترجمته · اسحب للتنقل'
          : (isFullTruncated
              ? `عرض ${graphChains.length} من ${allChains.length} إسناد (أسانيد هذا الحديث أولاً)`
              : 'جميع مسارات الرواية عبر كتب التخريج')
            + (selPath ? ' — مسار محدّد (أزرق) · انقر الخلفية لإلغائه' : ' — انقر على خطٍّ لتظليل مساره كاملاً')}
      </p>

      {mode === 'full' && treePhase === 'done' && madar && (
        <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs rounded-lg border border-purple-200 bg-purple-50 px-3 py-2">
          <span className="font-bold text-purple-800 whitespace-nowrap">★ مدار الحديث:</span>
          <Link href={`/narrator/${madar.id}`} className="font-bold text-purple-900 hover:underline whitespace-nowrap">
            {madar.name}
          </Link>
          {(narratorCriticism[madar.id]?.length ?? 0) > 0 && (
            <HoverCard
              width="25rem"
              trigger={<span className="text-purple-700 underline decoration-dotted underline-offset-2 cursor-help">· جرح وتعديل ▾</span>}
            >
              <CriticismPopover nar={{ id: madar.id, name: madar.name }} groups={narratorCriticism[madar.id]} />
            </HoverCard>
          )}
          <span className="text-gray-400 ms-auto whitespace-nowrap">تجتمع عنده جميع الطرق</span>
        </div>
      )}

      {mode === 'full' && treePhase === 'loading' && (
        <p className="text-xs text-gray-400 py-8 text-center">جاري تحميل الشجرة الكاملة…</p>
      )}
      {mode === 'full' && treePhase === 'error' && (
        <p className="text-sm text-gray-400 py-8 text-center">{treeErr}</p>
      )}

      {showGraph && (
        <div
          style={{ height: mode === 'single' ? 600 : 520 }}
          className="w-full border border-gray-100 rounded-xl overflow-hidden bg-surface"
        >
          <ReactFlow
            key={fitKey}
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onEdgeClick={mode === 'full' ? onEdgeClick : undefined}
            onPaneClick={onPaneClick}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={mode === 'single' ? 0.3 : 0.08}
            maxZoom={mode === 'single' ? 1.15 : 2.5}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={true}
          >
            <Background color={dark ? '#2A313A' : '#e5e7eb'} gap={20} size={1} />
            <Controls position="bottom-right" showInteractive={false} />
            {mode === 'full' && (
              <MiniMap
                nodeColor={n =>
                  n.id === 'root' ? '#14532d'
                  : madar && n.id === `n-${madar.id}` ? '#7C4DB8'
                  : n.id === `book-${hadithId}` ? '#d97706'
                  : n.id.startsWith('book-') ? '#93c5fd'
                  : (n.style?.border as string || '').includes('f59e0b') ? '#fcd34d'
                  : '#d1d5db'
                }
                maskColor={dark ? 'rgba(5,6,7,0.6)' : undefined}
                style={{ background: dark ? '#0E1116' : undefined }}
                pannable
                zoomable
              />
            )}
          </ReactFlow>
        </div>
      )}
    </div>
  )
}
