'use client'
import { useState, useEffect, useMemo } from 'react'
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
  Position,
} from 'reactflow'
import 'reactflow/dist/style.css'
import dagre from 'dagre'

interface ParallelEntry {
  id: number
  bookTitle: string
  takhrij_death: number | null
  text: string
}

// ── text utilities ─────────────────────────────────────────────────────────────

function cleanText(s: string): string {
  return (s || '')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, c: string) => String.fromCharCode(parseInt(c, 10)))
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s*[-–—"«»]\s*/, '').replace(/\s+/g, ' ').trim()
}

function stripDiacritics(s: string): string {
  return (s || '')
    .replace(/[ً-ٟؐ-ؚٰۖ-ۭ]/g, '')
    .replace(/[،,؟?!:;"«»()\[\]]/g, '')
    .replace(/\s+/g, ' ').trim()
}

function tokenize(s: string): string[] {
  return stripDiacritics(s).split(/\s+/).filter(w => w.length > 1)
}

function makeSet(s: string): Set<string> { return new Set(tokenize(s)) }

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0
  for (const w of a) if (b.has(w)) inter++
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

// ── prefix-tree builder ────────────────────────────────────────────────────────

interface PNode {
  id: string
  display: string          // text shown in this node
  count: number
  children: PNode[]
  leafEntry: ParallelEntry | null
}

function buildTree(entries: ParallelEntry[], pfx: string, depth: number, startPos: number): PNode {
  if (entries.length === 0) {
    return { id: pfx, display: '', count: 0, children: [], leafEntry: null }
  }

  if (entries.length === 1) {
    const e = entries[0]
    return {
      id: `${pfx}-leaf`,
      display: `${e.bookTitle}${e.takhrij_death ? ` (${e.takhrij_death}هـ)` : ''}`,
      count: 1, children: [], leafEntry: e,
    }
  }

  if (depth >= 3) {
    const children = entries.map((e, i) => ({
      id: `${pfx}-leaf-${i}`,
      display: `${e.bookTitle}${e.takhrij_death ? ` (${e.takhrij_death}هـ)` : ''}`,
      count: 1, children: [], leafEntry: e,
    }))
    return { id: pfx, display: '…', count: entries.length, children, leafEntry: null }
  }

  const normTokens = entries.map(e => tokenize(e.text))
  const dispTokens = entries.map(e => e.text.split(/\s+/).filter(Boolean))

  // Find common prefix from startPos
  let commonLen = startPos
  while (true) {
    const pivot = normTokens[0][commonLen]
    if (!pivot) break
    if (!normTokens.every(t => t[commonLen] === pivot)) break
    commonLen++
  }

  // Node display: only the incremental words from startPos to commonLen
  const maxWords = 6
  const dispSlice = (dispTokens[0] ?? []).slice(startPos, Math.min(commonLen, startPos + maxWords))
  const display = dispSlice.join(' ') + (commonLen > startPos + maxWords ? '…' : '')

  // Group by diverging word at commonLen
  const groupMap = new Map<string, { dispWord: string; entries: ParallelEntry[] }>()
  for (let i = 0; i < entries.length; i++) {
    const normWord = normTokens[i][commonLen] ?? '__END__'
    const dispWord = dispTokens[i][commonLen] ?? ''
    if (!groupMap.has(normWord)) groupMap.set(normWord, { dispWord, entries: [] })
    groupMap.get(normWord)!.entries.push(entries[i])
  }

  // Can't branch — make all leaves directly
  if (groupMap.size === 1) {
    const children = entries.map((e, i) => ({
      id: `${pfx}-leaf-${i}`,
      display: `${e.bookTitle}${e.takhrij_death ? ` (${e.takhrij_death}هـ)` : ''}`,
      count: 1, children: [], leafEntry: e,
    }))
    return { id: pfx, display: display || '…', count: entries.length, children, leafEntry: null }
  }

  const sortedGroups = Array.from(groupMap.entries())
    .sort(([, a], [, b]) => b.entries.length - a.entries.length)

  const children = sortedGroups.map(([normKey, { entries: grpEntries }], i) => {
    if (normKey === '__END__') {
      if (grpEntries.length === 1) {
        const e = grpEntries[0]
        return {
          id: `${pfx}-end-leaf`,
          display: `${e.bookTitle}${e.takhrij_death ? ` (${e.takhrij_death}هـ)` : ''}`,
          count: 1, children: [], leafEntry: e,
        }
      }
      const endChildren = grpEntries.map((e, j) => ({
        id: `${pfx}-end-${j}`,
        display: `${e.bookTitle}${e.takhrij_death ? ` (${e.takhrij_death}هـ)` : ''}`,
        count: 1, children: [], leafEntry: e,
      }))
      return { id: `${pfx}-end`, display: '(نهاية)', count: grpEntries.length, children: endChildren, leafEntry: null }
    }
    return buildTree(grpEntries, `${pfx}-${i}`, depth + 1, commonLen)
  })

  return { id: pfx, display, count: entries.length, children, leafEntry: null }
}

// ── tree → ReactFlow ───────────────────────────────────────────────────────────

const NW = 158, NH = 38

function treeToFlow(root: PNode, totalEntries: number): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  function visit(node: PNode, isRoot: boolean) {
    const isLeaf = !!node.leafEntry
    const isMid = !isRoot && !isLeaf

    const style: React.CSSProperties = isRoot ? {
      background: '#14532d', color: '#ffffff',
      border: '2px solid #166534', borderRadius: 8,
      fontFamily: 'Amiri, serif', fontSize: 12, fontWeight: 'bold',
      width: NW, padding: '5px 8px', textAlign: 'center',
    } : isMid ? {
      background: '#fefce8', color: '#713f12',
      border: '1px solid #fde047', borderRadius: 6,
      fontFamily: 'Amiri, serif', fontSize: 11,
      width: NW, padding: '4px 6px', textAlign: 'center',
    } : {
      background: '#eff6ff', color: '#1d4ed8',
      border: '1px solid #93c5fd', borderRadius: 6,
      fontFamily: 'Amiri, serif', fontSize: 10,
      width: NW, padding: '3px 6px', textAlign: 'center',
      cursor: node.leafEntry ? 'pointer' : 'default',
    }

    const label = isRoot
      ? `الروايات (${totalEntries})`
      : `${node.display}${!isLeaf && node.count > 1 ? `  —  ${node.count}` : ''}`

    nodes.push({
      id: node.id,
      data: { label, hadithId: node.leafEntry?.id },
      position: { x: 0, y: 0 },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      style,
    })

    for (const child of node.children) {
      visit(child, false)
      edges.push({
        id: `${node.id}→${child.id}`,
        source: node.id, target: child.id,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#9ca3af', width: 10, height: 10 },
        style: { stroke: '#d1d5db', strokeWidth: 1 },
      })
    }
  }

  visit(root, true)

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 20, ranksep: 52, marginx: 20, marginy: 20 })
  nodes.forEach(n => g.setNode(n.id, { width: NW, height: NH }))
  edges.forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)
  nodes.forEach(n => {
    const pos = g.node(n.id)
    if (pos) n.position = { x: pos.x - NW / 2, y: pos.y - NH / 2 }
  })

  return { nodes, edges }
}

// ── ReactFlow chart ────────────────────────────────────────────────────────────

function VariantsFlowChart({ entries }: { entries: ParallelEntry[] }) {
  const computed = useMemo(() => {
    if (!entries.length) return { nodes: [], edges: [] }
    const root = buildTree(entries, 'root', 0, 0)
    return treeToFlow(root, entries.length)
  }, [entries])

  const [nodes, setNodes, onNodesChange] = useNodesState(computed.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(computed.edges)

  useEffect(() => {
    setNodes(computed.nodes)
    setEdges(computed.edges)
  }, [computed]) // eslint-disable-line react-hooks/exhaustive-deps

  const height = useMemo(() => {
    if (!nodes.length) return 260
    const maxY = Math.max(...nodes.map(n => n.position.y)) + NH + 50
    return Math.max(260, Math.min(maxY, 680))
  }, [nodes])

  function onNodeClick(_: React.MouseEvent, node: Node) {
    if (node.data?.hadithId) window.open(`/hadith/${node.data.hadithId}`, '_blank')
  }

  if (!nodes.length) return null

  return (
    <div style={{ height }} className="w-full rounded-xl border border-gray-100 overflow-hidden shadow-sm">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.25}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#f0fdf4" gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

// ── composite matn utilities ───────────────────────────────────────────────────

function clusterEntries(entries: ParallelEntry[], threshold: number): ParallelEntry[][] {
  const sets = entries.map(e => makeSet(e.text))
  const assigned = new Array(entries.length).fill(-1)
  const groups: ParallelEntry[][] = []
  for (let i = 0; i < entries.length; i++) {
    if (assigned[i] >= 0) continue
    const g = [entries[i]]
    assigned[i] = groups.length
    for (let j = i + 1; j < entries.length; j++) {
      if (assigned[j] >= 0) continue
      if (jaccard(sets[i], sets[j]) >= threshold) { g.push(entries[j]); assigned[j] = groups.length }
    }
    groups.push(g)
  }
  return groups.sort((a, b) => b.length - a.length)
}

function compositeWords(entries: ParallelEntry[]): { word: string; freq: number }[] {
  if (!entries.length) return []
  const base = entries.reduce((a, b) => a.text.length > b.text.length ? a : b)
  const allSets = entries.map(e => makeSet(e.text))
  return base.text.split(/\s+/).filter(Boolean).map(word => {
    const norm = stripDiacritics(word)
    const freq = allSets.filter(s => s.has(norm)).length / allSets.length
    return { word, freq }
  })
}

// ── main export ────────────────────────────────────────────────────────────────

export default function MatnVariants({
  hadithId, currentTarf, currentBookTitle, currentDeath,
}: {
  hadithId: number
  currentTarf: string | null
  currentBookTitle: string
  currentDeath: number | null
}) {
  const [raw, setRaw] = useState<Array<{
    main_id: number; book_title: string; takhrij_death: number | null; tarf: string | null
  }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/hadith/${hadithId}/parallel`)
      .then(r => r.json())
      .then(d => { setRaw(d.parallels || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [hadithId])

  const { entries, composite, dominantCluster } = useMemo(() => {
    const entries: ParallelEntry[] = [
      ...(currentTarf ? [{ id: hadithId, bookTitle: currentBookTitle, takhrij_death: currentDeath, text: cleanText(currentTarf) }] : []),
      ...raw.filter(p => p.tarf && p.tarf.trim().length > 3).map(p => ({
        id: p.main_id, bookTitle: p.book_title, takhrij_death: p.takhrij_death, text: cleanText(p.tarf!),
      }))
    ].filter(e => tokenize(e.text).length >= 2)

    const clusters = clusterEntries(entries, 0.3)
    const dominantCluster = clusters[0] ?? []
    const composite = dominantCluster.length > 1 ? compositeWords(dominantCluster) : []
    return { entries, composite, dominantCluster }
  }, [hadithId, raw, currentTarf, currentBookTitle, currentDeath])

  if (loading) return <p className="text-xs text-gray-400 py-2">جاري تحميل المتون...</p>
  if (!entries.length) return <p className="text-xs text-gray-400">لا توجد روايات كافية للمقارنة</p>

  return (
    <div className="space-y-8">

      {/* ── المتن المُجمَّع ── */}
      {composite.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-1">المتن المُجمَّع</h3>
          <p className="text-xs text-gray-400 mb-3">
            {`استُخرج من ${dominantCluster.length} رواية متشابهة — الأسود: متفق عليه · الأصفر: في أغلب الروايات · الأحمر: في بعضها`}
          </p>
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm" dir="rtl">
            <p className="text-base leading-loose">
              {composite.map(({ word, freq }, i) => (
                <span key={i} className={
                  freq === 1 ? '' :
                  freq >= 0.6 ? 'bg-amber-100 text-amber-900 rounded px-0.5 mx-px' :
                  'bg-red-50 text-red-800 rounded px-0.5 mx-px'
                }>{word}{' '}</span>
              ))}
            </p>
          </div>
        </div>
      )}

      {/* ── خريطة الاختلافات ── */}
      <div>
        <h3 className="text-sm font-bold text-gray-700 mb-1">خريطة الاختلافات</h3>
        <p className="text-xs text-gray-400 mb-3">
          {`${entries.length} رواية — شجرة تفرعات النص من نقطة الاختلاف، اضغط على أي كتاب للانتقال إليه`}
        </p>
        <VariantsFlowChart entries={entries} />
      </div>

    </div>
  )
}
