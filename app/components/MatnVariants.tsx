'use client'
import { useState, useEffect, useMemo } from 'react'
import { extractMatnForComparison, stripXmlToVerbatim } from '@/lib/hadithText'
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
  Position,
  Handle,
} from 'reactflow'
import 'reactflow/dist/style.css'

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

type DisplayItem =
  | { type: 'word'; canonical: string; presentIn: SourceRef[]; absentIn: SourceRef[]; totalSources: number }
  | { type: 'insertion'; words: { text: string; sources: SourceRef[] }[] }

// ── Text utilities ─────────────────────────────────────────────────────────────

function resolveMatnText(content: string | null, tarf: string | null): string {
  if (content) {
    const fromContent = extractMatnForComparison(content)
    if (fromContent) return fromContent
  }
  if (tarf) {
    const fromTarf = extractMatnForComparison(tarf)
    if (fromTarf) return fromTarf
    // tarf is the matn opening — no sanad
    const plain = stripXmlToVerbatim(tarf)
    return plain
      .replace(/[0-9٠-٩]+/g, ' ')
      .replace(/[-–—]/g, ' ')
      .replace(/[،؛؟,.;:!?()\[\]{}"'«»""'']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  return ''
}

function normWord(w: string): string {
  return w
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ًٌٍَُِّْ]/g, '')
}

function tokenize(s: string): string[] {
  return s.split(/\s+/).filter(w => w.length > 0)
}

// ── LCS alignment ──────────────────────────────────────────────────────────────
// Returns list of {ai, oi} pairs: anchor index → other index matched words

function lcsAlign(
  anchorNorm: string[],
  otherNorm: string[],
): Array<{ ai: number; oi: number }> {
  const m = anchorNorm.length
  const n = otherNorm.length
  // Build DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (anchorNorm[i - 1] === otherNorm[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }
  // Trace back
  const pairs: Array<{ ai: number; oi: number }> = []
  let i = m, j = n
  while (i > 0 && j > 0) {
    if (anchorNorm[i - 1] === otherNorm[j - 1]) {
      pairs.push({ ai: i - 1, oi: j - 1 })
      i--; j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }
  return pairs.reverse()
}

// ── Composite builder ──────────────────────────────────────────────────────────

function buildComposite(entries: TextEntry[]): DisplayItem[] {
  if (entries.length === 0) return []

  // Pick the longest text as the anchor
  const anchor = entries.reduce((a, b) => a.matn.length >= b.matn.length ? a : b)
  const others = entries.filter(e => e.id !== anchor.id)

  const anchorWords = tokenize(anchor.matn)
  const anchorNorm = anchorWords.map(normWord)

  // presentIn[i] = all sources whose LCS matched anchor word i
  // gaps[i] = words inserted by some source BEFORE anchor word i
  const presentIn: SourceRef[][] = anchorWords.map(() => [])
  const anchorRef: SourceRef = { id: anchor.id, bookTitle: anchor.bookTitle, num: anchor.num }
  anchorWords.forEach((_, i) => presentIn[i].push(anchorRef))

  // insertionsBefore[i] = Map<normWord, { text: string; sources: SourceRef[] }>
  // i = 0..anchorWords.length (index anchorWords.length = "after all anchor words")
  const insertionsBefore: Array<Map<string, { text: string; sources: SourceRef[] }>> =
    Array.from({ length: anchorWords.length + 1 }, () => new Map())

  for (const other of others) {
    const otherWords = tokenize(other.matn)
    const otherNorm = otherWords.map(normWord)
    const pairs = lcsAlign(anchorNorm, otherNorm)

    const ref: SourceRef = { id: other.id, bookTitle: other.bookTitle, num: other.num }

    // Mark matched anchor positions as present in this source
    const matchedOtherSet = new Set(pairs.map(p => p.oi))

    for (const { ai } of pairs) {
      presentIn[ai].push(ref)
    }

    // Find insertions: other words not matched to any anchor word.
    // For each unmatched other word, find the next anchor word it appears before
    // and bucket it there so we can display it as an insertion at that position.
    for (let oi = 0; oi < otherWords.length; oi++) {
      if (matchedOtherSet.has(oi)) continue
      // Find the next anchor position after this oi
      let nextAi = anchorWords.length // default: after all anchor words
      for (const p of pairs) {
        if (p.oi > oi) { nextAi = p.ai; break }
      }
      const w = otherWords[oi]
      const nw = normWord(w)
      const bucket = insertionsBefore[nextAi]
      if (!bucket.has(nw)) {
        bucket.set(nw, { text: w, sources: [] })
      }
      bucket.get(nw)!.sources.push(ref)
    }
  }

  const totalSources = entries.length

  // Build display items
  const items: DisplayItem[] = []

  for (let i = 0; i < anchorWords.length; i++) {
    // Insertions before anchor word i (only show if ≥2 sources share them)
    const bucket = insertionsBefore[i]
    const sharedInsertions = Array.from(bucket.values()).filter(ins => ins.sources.length >= 2)
    if (sharedInsertions.length > 0) {
      items.push({ type: 'insertion', words: sharedInsertions })
    }

    // Anchor word
    const present = presentIn[i]
    const absent = entries
      .filter(e => !present.some(r => r.id === e.id))
      .map(e => ({ id: e.id, bookTitle: e.bookTitle, num: e.num }))

    items.push({
      type: 'word',
      canonical: anchorWords[i],
      presentIn: present,
      absentIn: absent,
      totalSources,
    })
  }

  // Trailing insertions (after last anchor word)
  const trailingBucket = insertionsBefore[anchorWords.length]
  const trailingInsertions = Array.from(trailingBucket.values()).filter(ins => ins.sources.length >= 2)
  if (trailingInsertions.length > 0) {
    items.push({ type: 'insertion', words: trailingInsertions })
  }

  return items
}

// ── CompositeMatn component ────────────────────────────────────────────────────

function WordPopover({
  presentIn,
  absentIn,
  onClose,
}: {
  presentIn: SourceRef[]
  absentIn: SourceRef[]
  onClose: () => void
}) {
  return (
    <span
      className="absolute z-50 top-full right-0 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-right text-xs"
      dir="rtl"
      onClick={e => e.stopPropagation()}
    >
      {presentIn.length > 0 && (
        <div className="mb-2">
          <p className="font-bold text-green-800 mb-1">موجود في {presentIn.length} رواية:</p>
          <ul className="space-y-0.5">
            {presentIn.map(r => (
              <li key={r.id}>
                <a
                  href={`/hadith/${r.id}`}
                  className="text-green-700 hover:underline hover:text-green-900"
                  onClick={onClose}
                >
                  {r.bookTitle}{r.num ? ` (${r.num})` : ''}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {absentIn.length > 0 && (
        <div>
          <p className="font-bold text-red-700 mb-1">غائب في {absentIn.length} رواية:</p>
          <ul className="space-y-0.5">
            {absentIn.map(r => (
              <li key={r.id}>
                <a
                  href={`/hadith/${r.id}`}
                  className="text-red-600 hover:underline hover:text-red-800"
                  onClick={onClose}
                >
                  {r.bookTitle}{r.num ? ` (${r.num})` : ''}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        onClick={onClose}
        className="mt-2 text-[10px] text-gray-400 hover:text-gray-600"
      >
        ✕ إغلاق
      </button>
    </span>
  )
}

function InsertionPopover({
  words,
  onClose,
}: {
  words: { text: string; sources: SourceRef[] }[]
  onClose: () => void
}) {
  return (
    <span
      className="absolute z-50 top-full right-0 mt-1 w-72 bg-white border border-amber-200 rounded-xl shadow-lg p-3 text-right text-xs"
      dir="rtl"
      onClick={e => e.stopPropagation()}
    >
      <p className="font-bold text-amber-800 mb-2">زيادة في {words[0]?.sources.length ?? 0}+ رواية</p>
      {words.map((ins, i) => (
        <div key={i} className="mb-1.5">
          <p className="font-semibold text-amber-700 font-serif">{ins.text}</p>
          <ul className="space-y-0.5 mt-0.5">
            {ins.sources.map(r => (
              <li key={r.id}>
                <a
                  href={`/hadith/${r.id}`}
                  className="text-amber-600 hover:underline hover:text-amber-900"
                  onClick={onClose}
                >
                  {r.bookTitle}{r.num ? ` (${r.num})` : ''}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <button
        onClick={onClose}
        className="mt-2 text-[10px] text-gray-400 hover:text-gray-600"
      >
        ✕ إغلاق
      </button>
    </span>
  )
}

function CompositeMatn({ items, totalSources }: { items: DisplayItem[]; totalSources: number }) {
  const [activeKey, setActiveKey] = useState<string | null>(null)

  function toggle(key: string) {
    setActiveKey(prev => prev === key ? null : key)
  }

  // Close popover when clicking elsewhere
  useEffect(() => {
    function handler() { setActiveKey(null) }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  if (items.length === 0) return null

  return (
    <div
      className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm leading-loose text-base font-serif"
      dir="rtl"
    >
      {items.map((item, idx) => {
        if (item.type === 'word') {
          const freq = item.presentIn.length / item.totalSources
          const showCount = freq < 1.0
          const key = `w-${idx}`
          const isOpen = activeKey === key

          const colorCls =
            freq === 1.0 ? 'hover:bg-gray-100' :
            freq >= 0.7  ? 'bg-amber-50 text-amber-900 hover:bg-amber-100' :
            freq >= 0.4  ? 'bg-orange-100 text-orange-900 hover:bg-orange-200' :
                           'bg-red-100 text-red-800 hover:bg-red-200'

          return (
            <span key={key} className="relative inline-block">
              <button
                onClick={e => { e.stopPropagation(); toggle(key) }}
                className={`rounded px-0.5 mx-px transition-colors cursor-pointer dark:text-ink ${colorCls} ${isOpen ? 'ring-2 ring-offset-1 ring-green-400' : ''}`}
              >
                {item.canonical}
                {showCount && (
                  <sup className="text-[9px] text-gray-400 ml-px">
                    {item.presentIn.length}/{item.totalSources}
                  </sup>
                )}
              </button>
              {' '}
              {isOpen && (
                <WordPopover
                  presentIn={item.presentIn}
                  absentIn={item.absentIn}
                  onClose={() => setActiveKey(null)}
                />
              )}
            </span>
          )
        }

        // insertion
        const key = `ins-${idx}`
        const isOpen = activeKey === key
        const topCount = Math.max(...item.words.map(w => w.sources.length))

        return (
          <span key={key} className="relative inline-block">
            <button
              onClick={e => { e.stopPropagation(); toggle(key) }}
              className={`text-sm text-teal-700 dark:text-ink bg-teal-50 border border-teal-200 rounded px-1 mx-0.5 hover:bg-teal-100 transition-colors cursor-pointer ${isOpen ? 'ring-2 ring-offset-1 ring-teal-400' : ''}`}
            >
              [{item.words.map(w => w.text).join(' ')}]
              <sup className="text-[9px] text-teal-500 ml-px">{topCount}</sup>
            </button>
            {' '}
            {isOpen && (
              <InsertionPopover
                words={item.words}
                onClose={() => setActiveKey(null)}
              />
            )}
          </span>
        )
      })}
    </div>
  )
}

// ── Legend ─────────────────────────────────────────────────────────────────────

function CompositeLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-3" dir="rtl">
      <span className="flex items-center gap-1">
        <span className="inline-block w-3 h-3 rounded bg-white border border-gray-200" />
        متفق عليه في جميع الروايات
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block w-3 h-3 rounded bg-amber-50 border border-amber-200" />
        في أغلب الروايات (≥70%)
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block w-3 h-3 rounded bg-orange-100 border border-orange-200" />
        في بعض الروايات (40–70%)
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-200" />
        نادر (&lt;40%)
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block w-3 h-3 rounded bg-teal-50 border border-teal-200" />
        زيادة في بعض الروايات
      </span>
    </div>
  )
}

// ── Variant tree types ─────────────────────────────────────────────────────────

interface Divergence {
  type: 'variant' | 'insertion'
  word: string
  sources: SourceRef[]
  replacesWords?: string[]
}

interface VariantSegment {
  words: string[]
  divergences: Divergence[]
}

// ── buildVariantData ───────────────────────────────────────────────────────────

function buildVariantData(source: TextEntry, others: TextEntry[]): VariantSegment[] {
  const sourceWords = tokenize(source.matn)
  const sourceNorm = sourceWords.map(normWord)

  if (sourceWords.length < 5) return []

  // variantsAt[i]: variants attached to source position i (FIRST pos of its gap only)
  // insertionsBefore[i]: insertions before source position i (full phrase per source)
  // absorbedByGap: source positions that are part of a multi-word gap — rolled into first pos
  const variantsAt: Array<Array<{ word: string; ref: SourceRef }>> =
    Array.from({ length: sourceWords.length }, () => [])
  const insertionsBefore: Array<Array<{ word: string; ref: SourceRef }>> =
    Array.from({ length: sourceWords.length + 1 }, () => [])
  const absorbedByGap = new Set<number>()

  for (const other of others) {
    const otherWords = tokenize(other.matn)
    const otherNorm = otherWords.map(normWord)
    const pairs = lcsAlign(sourceNorm, otherNorm)
    const ref: SourceRef = { id: other.id, bookTitle: other.bookTitle, num: other.num }

    const matchedSrc = new Set(pairs.map(p => p.ai))
    const matchedOth = new Set(pairs.map(p => p.oi))
    const sortedByAi = [...pairs].sort((a, b) => a.ai - b.ai)

    // Process each gap between consecutive LCS matches (including before/after all matches)
    for (let g = 0; g <= sortedByAi.length; g++) {
      const prevAi = g === 0 ? -1 : sortedByAi[g - 1].ai
      const nextAi = g === sortedByAi.length ? sourceWords.length : sortedByAi[g].ai
      const prevOi = g === 0 ? -1 : sortedByAi[g - 1].oi
      const nextOi = g === sortedByAi.length ? otherWords.length : sortedByAi[g].oi

      // Collect unmatched source positions in this gap
      const srcUnmatched: number[] = []
      for (let ai = prevAi + 1; ai < nextAi; ai++) {
        if (!matchedSrc.has(ai)) srcUnmatched.push(ai)
      }

      // Collect unmatched other words in this gap
      const othUnmatched: string[] = []
      for (let oi = prevOi + 1; oi < nextOi; oi++) {
        if (!matchedOth.has(oi)) othUnmatched.push(otherWords[oi])
      }

      if (srcUnmatched.length > 0 && othUnmatched.length > 0) {
        // Substitution: attach variant phrase to FIRST source position in the gap only.
        // Mark remaining positions as absorbed so segmentation won't split on them.
        variantsAt[srcUnmatched[0]].push({ word: othUnmatched.join(' '), ref })
        for (let j = 1; j < srcUnmatched.length; j++) {
          absorbedByGap.add(srcUnmatched[j])
        }
      } else if (srcUnmatched.length === 0 && othUnmatched.length > 0) {
        // Pure insertion: join all words into one phrase attached before nextAi
        insertionsBefore[nextAi].push({ word: othUnmatched.join(' '), ref })
      }
      // srcUnmatched > 0 && othUnmatched === 0: other simply skips, nothing to show
    }
  }

  // Now build segments by walking source words and splitting at divergences
  // Group consecutive insertions/variants by their normalized word form
  function groupDivergences(
    type: 'variant' | 'insertion',
    raw: Array<{ word: string; ref: SourceRef }>,
    replacesWords?: string[],
  ): Divergence[] {
    // Group by normalized word
    const map = new Map<string, { word: string; sources: SourceRef[] }>()
    for (const { word, ref } of raw) {
      const nw = word.split(' ').map(normWord).join(' ')
      if (!map.has(nw)) map.set(nw, { word, sources: [] })
      // Avoid duplicate sources
      const entry = map.get(nw)!
      if (!entry.sources.some(s => s.id === ref.id)) entry.sources.push(ref)
    }
    return Array.from(map.values()).map(({ word, sources }) => ({
      type,
      word,
      sources,
      replacesWords,
    }))
  }

  // Build segments
  const segments: VariantSegment[] = []
  let currentWords: string[] = []

  for (let i = 0; i < sourceWords.length; i++) {
    // Insertions before position i (skip if this position is absorbed mid-gap)
    const ins = insertionsBefore[i]
    if (ins.length > 0 && !absorbedByGap.has(i)) {
      if (currentWords.length > 0) {
        segments.push({ words: currentWords, divergences: [] })
        currentWords = []
      }
      const insDivs = groupDivergences('insertion', ins)
      if (insDivs.length > 0) {
        segments.push({ words: [], divergences: insDivs })
      }
    }

    // Add source word
    currentWords.push(sourceWords[i])

    // Variants at position i — only if this position is the START of a gap (not absorbed)
    const vars = variantsAt[i]
    if (vars.length > 0 && !absorbedByGap.has(i)) {
      // Pull in all following absorbed positions so the whole replaced phrase is one segment
      let j = i + 1
      while (j < sourceWords.length && absorbedByGap.has(j)) {
        currentWords.push(sourceWords[j])
        j++
      }
      // Also collect variants recorded on absorbed positions (from parallels that produced
      // a narrower gap covering only those positions) so they are not silently dropped.
      const allVars = [...vars]
      for (let k = i + 1; k < j; k++) allVars.push(...variantsAt[k])
      const varDivs = groupDivergences('variant', allVars, currentWords.slice())
      segments.push({ words: currentWords, divergences: varDivs })
      currentWords = []
      i = j - 1  // skip absorbed positions (already consumed)
    }
  }

  // Trailing insertions (after last source word)
  const trailingIns = insertionsBefore[sourceWords.length]
  if (trailingIns.length > 0) {
    if (currentWords.length > 0) {
      segments.push({ words: currentWords, divergences: [] })
      currentWords = []
    }
    const insDivs = groupDivergences('insertion', trailingIns)
    if (insDivs.length > 0) {
      segments.push({ words: [], divergences: insDivs })
    }
  }

  if (currentWords.length > 0) {
    segments.push({ words: currentWords, divergences: [] })
  }

  return segments
}

// ── buildVariantFlow ───────────────────────────────────────────────────────────

const BACKBONE_HEIGHT = 60
const BACKBONE_Y = 40
const V_GAP = 18
const H_GAP = 24
const ROW_HEIGHT = 52
const ROW_GAP = 10
const LABEL_WIDTH = 140

// ── Custom ReactFlow node components ─────────────────────────────────────────

function BackboneNodeCmp({ data }: { data: { label: React.ReactNode; width: number } }) {
  return (
    <div style={{
      background: '#fafaf9', border: '1.5px solid #d6d3d1', borderRadius: 8,
      width: data.width, height: BACKBONE_HEIGHT,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '8px 12px', textAlign: 'center', boxSizing: 'border-box',
    }}>
      <Handle type="target" position={Position.Right} id="right"
        style={{ background: '#a8a29e', width: 8, height: 8, border: 'none' }} />
      <Handle type="source" position={Position.Left} id="left"
        style={{ background: '#a8a29e', width: 8, height: 8, border: 'none' }} />
      <Handle type="source" position={Position.Bottom} id="bottom"
        style={{ background: '#a8a29e', width: 8, height: 8, border: 'none' }} />
      {data.label}
    </div>
  )
}

function DivNodeCmp({ data }: { data: { label: React.ReactNode; isInsertion: boolean; width: number } }) {
  return (
    <div style={{
      background: data.isInsertion ? '#fffbeb' : '#ffffff',
      border: data.isInsertion ? '1.5px dashed #d97706' : '1px solid #a8a29e',
      borderRadius: 6, width: data.width, padding: '6px 10px',
      fontSize: 11, textAlign: 'right', boxSizing: 'border-box',
    }}>
      <Handle type="target" position={Position.Top} id="top"
        style={{ background: data.isInsertion ? '#d97706' : '#a8a29e', width: 8, height: 8, border: 'none' }} />
      {data.label}
    </div>
  )
}

function SourceLabelCmp({ data }: { data: { label: string; num: string | null; hadithId: number; width: number } }) {
  return (
    <a
      href={`/hadith/${data.hadithId}`}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      style={{
        background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6,
        width: data.width, height: ROW_HEIGHT,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
        justifyContent: 'center', padding: '4px 10px', boxSizing: 'border-box',
        textDecoration: 'none', cursor: 'pointer',
      }}
    >
      <div style={{ fontFamily: 'Amiri, serif', fontSize: 10, fontWeight: 600, color: '#3730a3', textAlign: 'right', lineHeight: 1.3 }}>
        {data.label}
      </div>
      {data.num && (
        <div style={{ fontSize: 9, color: '#6366f1', textAlign: 'right' }}>({data.num})</div>
      )}
    </a>
  )
}

function BackboneLabelCmp({ data }: { data: { label: string; width: number } }) {
  return (
    <div style={{
      background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6,
      width: data.width, height: BACKBONE_HEIGHT,
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
      justifyContent: 'center', padding: '4px 10px', boxSizing: 'border-box',
    }}>
      <div style={{ fontSize: 9, color: '#16a34a', fontWeight: 700, textAlign: 'right', marginBottom: 2 }}>
        الحديث الحالي
      </div>
      <div style={{ fontFamily: 'Amiri, serif', fontSize: 10, fontWeight: 600, color: '#15803d', textAlign: 'right', lineHeight: 1.3 }}>
        {data.label}
      </div>
    </div>
  )
}

function HLineCmp({ data }: { data: { width: number } }) {
  return (
    <div style={{
      width: data.width, height: 1,
      borderBottom: '1px dashed #e5e7eb',
      pointerEvents: 'none', boxSizing: 'border-box',
    }} />
  )
}

const FLOW_NODE_TYPES = {
  backbone: BackboneNodeCmp,
  div: DivNodeCmp,
  sourceLabel: SourceLabelCmp,
  backboneLabel: BackboneLabelCmp,
  hline: HLineCmp,
}

function calcBackboneWidth(words: string[]): number {
  if (words.length === 0) return 20  // narrow connector for pure insertions
  const charEstimate = words.join(' ').length
  return Math.max(80, Math.min(charEstimate * 11, 280))
}

function buildVariantFlow(
  segments: VariantSegment[],
  sourceBookTitle: string,
): { nodes: Node[]; edges: Edge[]; numSources: number } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  if (segments.length === 0) return { nodes, edges, numSources: 0 }

  // Collect unique sources in order of first appearance across all segments
  const sourceOrder: SourceRef[] = []
  const seenIds = new Set<number>()
  for (const seg of segments) {
    for (const div of seg.divergences) {
      for (const src of div.sources) {
        if (!seenIds.has(src.id)) {
          seenIds.add(src.id)
          sourceOrder.push(src)
        }
      }
    }
  }

  // Assign each source a fixed Y row — all nodes for a source share the same Y
  const sourceRowY = new Map<number, number>()
  sourceOrder.forEach((src, idx) => {
    sourceRowY.set(src.id, BACKBONE_Y + BACKBONE_HEIGHT + V_GAP + idx * (ROW_HEIGHT + ROW_GAP))
  })

  // Backbone X positions (right-to-left: segment 0 = rightmost)
  const widths = segments.map(s => calcBackboneWidth(s.words))
  const totalWidth = widths.reduce((sum, w) => sum + w + H_GAP, 0) - H_GAP
  let xCursor = totalWidth
  const xPositions: number[] = []
  for (let i = 0; i < segments.length; i++) {
    xCursor -= widths[i]
    xPositions.push(xCursor)
    xCursor -= H_GAP
  }

  // Full line width (from left edge of labels to right edge of rightmost backbone)
  const lineWidth = LABEL_WIDTH + H_GAP + totalWidth
  const lineX = -(LABEL_WIDTH + H_GAP)

  // Backbone row label (current hadith indicator)
  nodes.push({
    id: 'backbone-label',
    type: 'backboneLabel',
    data: { label: sourceBookTitle, width: LABEL_WIDTH },
    position: { x: lineX, y: BACKBONE_Y },
  })

  // Horizontal guide line between backbone row and source rows
  nodes.push({
    id: 'hline-top',
    type: 'hline',
    data: { width: lineWidth },
    position: { x: lineX, y: BACKBONE_Y + BACKBONE_HEIGHT + Math.floor(V_GAP / 2) },
  })

  // Source label nodes + horizontal guide lines — one per source row
  for (const [idx, src] of sourceOrder.entries()) {
    const rowY = sourceRowY.get(src.id)!
    nodes.push({
      id: `label-${src.id}`,
      type: 'sourceLabel',
      data: { label: src.bookTitle, num: src.num, hadithId: src.id, width: LABEL_WIDTH },
      position: { x: lineX, y: rowY },
    })
    // Guide line at bottom of this row (separates rows)
    if (idx < sourceOrder.length - 1) {
      nodes.push({
        id: `hline-${src.id}`,
        type: 'hline',
        data: { width: lineWidth },
        position: { x: lineX, y: rowY + ROW_HEIGHT + Math.floor(ROW_GAP / 2) },
      })
    }
  }

  // Backbone nodes and per-source divergence nodes
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const bx = xPositions[i]
    const bWidth = widths[i]
    const bId = `bb-${i}`

    nodes.push({
      id: bId,
      type: 'backbone',
      data: {
        label: (
          <div dir="rtl" style={{ fontFamily: 'Amiri, serif', fontSize: 13, lineHeight: 1.4 }}>
            {seg.words.length > 0 ? seg.words.join(' ') : '|'}
          </div>
        ),
        width: bWidth,
      },
      position: { x: bx, y: BACKBONE_Y },
    })

    if (i > 0) {
      edges.push({
        id: `bb-edge-${i - 1}-${i}`,
        source: `bb-${i - 1}`,
        target: bId,
        sourceHandle: 'left',
        targetHandle: 'right',
        type: 'straight',
        style: { stroke: '#d6d3d1', strokeWidth: 1.5 },
      })
    }

    // Expand divergences into per-source entries — one node per (segment, source)
    const srcDivMap = new Map<number, { word: string; isInsertion: boolean; src: SourceRef }>()
    for (const div of seg.divergences) {
      const isInsertion = div.type === 'insertion'
      for (const src of div.sources) {
        if (!srcDivMap.has(src.id)) {
          srcDivMap.set(src.id, { word: div.word, isInsertion, src })
        } else {
          const prev = srcDivMap.get(src.id)!
          srcDivMap.set(src.id, { word: prev.word + ' / ' + div.word, isInsertion: prev.isInsertion || isInsertion, src: prev.src })
        }
      }
    }

    const dWidth = Math.max(100, Math.min(bWidth + 10, 210))
    const dX = bx + (bWidth - dWidth) / 2

    for (const [srcId, { word, isInsertion, src }] of srcDivMap) {
      const dId = `div-${i}-${srcId}`
      nodes.push({
        id: dId,
        type: 'div',
        data: {
          isInsertion,
          width: dWidth,
          label: (
            <div dir="rtl" style={{ fontFamily: 'Amiri, serif', lineHeight: 1.4, textAlign: 'center' }}>
              {isInsertion && (
                <div style={{ fontSize: 9, color: '#b45309', marginBottom: 1, fontWeight: 'bold' }}>زيادة</div>
              )}
              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 3 }}>{word}</div>
              <a
                href={`/hadith/${srcId}`}
                onMouseDown={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
                style={{ fontSize: 9, color: '#4f46e5', textDecoration: 'underline', cursor: 'pointer', display: 'block' }}
              >
                {src.bookTitle}{src.num ? ` (${src.num})` : ''}
              </a>
            </div>
          ),
        },
        position: { x: dX, y: sourceRowY.get(srcId)! },
      })

      edges.push({
        id: `div-edge-${i}-${srcId}`,
        source: bId,
        target: dId,
        sourceHandle: 'bottom',
        targetHandle: 'top',
        type: 'step',
        style: isInsertion
          ? { stroke: '#d97706', strokeWidth: 1, strokeDasharray: '5 3' }
          : { stroke: '#a8a29e', strokeWidth: 1, strokeDasharray: '4 2' },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isInsertion ? '#d97706' : '#a8a29e',
          width: 8,
          height: 8,
        },
      })
    }
  }

  return { nodes, edges, numSources: sourceOrder.length }
}

// ── VariantsFlowChart ──────────────────────────────────────────────────────────

function VariantsFlowChart({ source, others }: { source: TextEntry; others: TextEntry[] }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const computed = useMemo(() => {
    const segments = buildVariantData(source, others)
    if (segments.length === 0) return { nodes: [], edges: [], empty: true, numSources: 0 }
    return { ...buildVariantFlow(segments, source.bookTitle), empty: false }
  }, [source, others])

  useEffect(() => {
    setNodes(computed.nodes)
    setEdges(computed.edges)
  }, [computed]) // eslint-disable-line react-hooks/exhaustive-deps

  const height = useMemo(() => {
    const rowsH = computed.numSources * (ROW_HEIGHT + ROW_GAP)
    return Math.max(300, Math.min(BACKBONE_Y + BACKBONE_HEIGHT + V_GAP + rowsH + 80, 900))
  }, [computed.numSources])

  if (computed.empty) {
    return <p className="text-xs text-gray-400">لا توجد روايات كافية</p>
  }

  return (
    <div style={{ height }} className="w-full rounded-xl border border-gray-100 overflow-hidden bg-[#faf9f7] shadow-sm">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={FLOW_NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#e7e5e4" gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
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

  // Build TextEntry list for composite and tree
  const textEntries = useMemo(() => {
    const sourceText = sourceMatn ?? resolveMatnText(null, currentTarf)

    const entries: TextEntry[] = []
    if (sourceText.trim().length > 3) {
      entries.push({
        id: hadithId,
        bookTitle: currentBookTitle,
        takhrij_death: currentDeath,
        matn: sourceText,
        num: null,
      })
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

  const compositeItems = useMemo(
    () => buildComposite(textEntries),
    [textEntries]
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
            {textEntries.length} رواية — اضغط على أي كلمة لرؤية مصادرها
          </span>
        </div>

        <CompositeLegend />

        <CompositeMatn items={compositeItems} totalSources={textEntries.length} />
      </div>

      {/* ── شجرة الاختلافات ── */}
      <div>
        <h3 className="text-sm font-bold text-gray-700 mb-1">
          شجرة الاختلافات
          <span className="text-xs font-normal text-gray-400 mr-2">({textEntries.length} رواية)</span>
        </h3>
        <p className="text-xs text-gray-400 mb-3">
          شجرة تفرعات النص — العمود الخلفي يمثل المتن الأصلي، والتفرعات تمثل الاختلافات
        </p>
        <VariantsFlowChart source={textEntries[0]} others={textEntries.slice(1)} />
      </div>

    </div>
  )
}
