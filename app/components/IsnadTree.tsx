'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Node,
  Edge,
  Position,
} from 'reactflow'
import 'reactflow/dist/style.css'
import dagre from 'dagre'
import { useTheme } from '@/lib/themeContext'

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

type ViewMode = 'chain' | 'graph'
type Phase = 'idle' | 'loading' | 'done' | 'error'

const NW = 170
const NH = 50
const MAX_GRAPH_CHAINS = 28

// ─── ReactFlow full-graph builder ─────────────────────────────────────────────

function buildGraph(chains: ChainRow[], currentHadithId: number, dark: boolean): { nodes: Node[]; edges: Edge[] } {
  const P = dark ? {
    rootBg: '#103A2E', rootBorder: '#4EBA65', rootText: '#ECE6DA',
    narratorCompanionBg: '#2A2210', narratorBg: '#1C212A',
    narratorText: '#ECE6DA', narratorCompanionBorder: '#D9AD5B', narratorBorder: '#2A313A',
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

  // Pre-compute which edge keys belong to the current hadith's chains
  const currentEdgeKeys = new Set<string>()
  for (const chain of chains) {
    if (chain.hadithId !== currentHadithId) continue
    let prev = 'root'
    for (const nar of chain.narrators) {
      const nid = `n-${nar.id}`
      currentEdgeKeys.add(`${prev}→${nid}`)
      prev = nid
    }
    currentEdgeKeys.add(`${prev}→book-${chain.hadithId}`)
  }

  nodeMap.set('root', {
    id: 'root',
    data: { label: 'النبي ﷺ' },
    position: { x: 0, y: 0 },
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

    for (const nar of chain.narrators) {
      const nodeId = `n-${nar.id}`
      if (!nodeMap.has(nodeId)) {
        const raw = (nar.abb_name || nar.name).split('،')[0].trim()
        const deathLine = nar.death_year ? `\nت ${nar.death_year}` : (nar.death_year_num ? `\nت ${nar.death_year_num}هـ` : '')
        const label = (nar.is_companion ? `◆ ${raw}` : raw) + deathLine
        nodeMap.set(nodeId, {
          id: nodeId,
          data: { label, narratorId: nar.id },
          position: { x: 0, y: 0 },
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          style: {
            background: nar.is_companion ? P.narratorCompanionBg : P.narratorBg,
            color: P.narratorText,
            border: `1px solid ${nar.is_companion ? P.narratorCompanionBorder : P.narratorBorder}`,
            borderRadius: 6, fontFamily: 'Amiri, serif',
            fontSize: 11, width: NW, padding: '3px 6px',
            textAlign: 'center', cursor: 'pointer', whiteSpace: 'pre-line',
          },
        })
      }

      const eKey = `${prevId}→${nodeId}`
      if (!edgeSet.has(eKey)) {
        edgeSet.add(eKey)
        const isCurrent = currentEdgeKeys.has(eKey)
        rawEdges.push({
          id: eKey, source: prevId, target: nodeId, type: 'smoothstep',
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
          zIndex: isCurrent ? 10 : 1,
        })
      }
      prevId = nodeId
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

    const bKey = `${prevId}→${bookId}`
    if (!edgeSet.has(bKey)) {
      edgeSet.add(bKey)
      const isCurrent = currentEdgeKeys.has(bKey)
      rawEdges.push({
        id: bKey, source: prevId, target: bookId, type: 'smoothstep',
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
        zIndex: isCurrent ? 10 : 1,
      })
    }
  }

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 36, ranksep: 55, marginx: 24, marginy: 24 })
  nodeMap.forEach(n => g.setNode(n.id, { width: NW, height: NH }))
  rawEdges.forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)

  const nodes: Node[] = []
  nodeMap.forEach(n => {
    const pos = g.node(n.id)
    if (!pos) return
    nodes.push({ ...n, position: { x: pos.x - NW / 2, y: pos.y - NH / 2 } })
  })

  return { nodes, edges: rawEdges }
}

// ─── Linear single-chain display ──────────────────────────────────────────────

// sand_tahdeth format: "narrator_id type_id$ narrator_id type_id$ ..." (last entry may omit type_id)
function parseTahdeth(raw: string | null | undefined, types: Record<number, string>): Record<number, string> {
  if (!raw) return {}
  const result: Record<number, string> = {}
  for (const seg of raw.split('$')) {
    const parts = seg.trim().split(/\s+/)
    if (parts.length >= 2) {
      const narratorId = parseInt(parts[0], 10)
      const typeId = parseInt(parts[1], 10)
      if (!isNaN(narratorId) && !isNaN(typeId) && types[typeId]) {
        result[narratorId] = types[typeId]
      }
    }
  }
  return result
}

function LinearChain({
  chain,
  hadithId,
  allChains,
  selectedNarratorId,
  expandedNarrators,
  onSelectNarrator,
  onToggleExpand,
  tahdethTypes,
}: {
  chain: ChainRow
  hadithId: number
  allChains: ChainRow[]
  selectedNarratorId: number | null
  expandedNarrators: Set<number>
  onSelectNarrator: (n: Narrator | null) => void
  onToggleExpand: (id: number) => void
  tahdethTypes: Record<number, string>
}) {
  const bookLabel = chain.takhrij_author
    ? chain.takhrij_author + (chain.takhrij_death ? ` (${chain.takhrij_death}هـ)` : '')
    : chain.bookTitle

  const narratorTermMap = parseTahdeth(chain.tahdethRaw, tahdethTypes)

  return (
    <div className="flex flex-col items-center">
      {/* Prophet root */}
      <div className="bg-green-900 text-white font-bold text-sm font-serif px-5 py-2.5 rounded-xl border-2 border-green-700 min-w-40 text-center shadow-sm">
        النبي ﷺ
      </div>

      {chain.narrators.map((nar, narIdx) => {
        const isSelected = selectedNarratorId === nar.id
        const isExpanded = expandedNarrators.has(nar.id)
        const relatedChains = allChains.filter(
          c => c.hadithId !== hadithId && c.narrators.some(n => n.id === nar.id)
        )
        // Each entry stores the method the SENDER used to transmit to the next narrator,
        // so the term above narrator[i] comes from narrator[i-1]'s map entry.
        const prevId = narIdx > 0 ? chain.narrators[narIdx - 1].id : null

        return (
          <div key={nar.id} className="flex flex-col items-center w-full">
            {/* Connector */}
            {(() => {
              const term = (prevId != null ? narratorTermMap[prevId] : '') || ''
              return term ? (
                <div className="flex flex-col items-center py-0.5">
                  <div className="w-px h-2 bg-gray-300 shrink-0" />
                  <span className="text-[9px] font-serif text-teal-600 bg-teal-50 border border-teal-100 px-2 py-px rounded-full leading-none my-0.5 max-w-[140px] text-center truncate" title={term}>
                    {term}
                  </span>
                  <div className="w-px h-2 bg-gray-300 shrink-0" />
                </div>
              ) : (
                <div className="w-px h-5 bg-gray-300 shrink-0" />
              )
            })()}

            {/* Card + expand button row */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => onSelectNarrator(isSelected ? null : nar)}
                className={`min-w-40 text-center text-sm font-serif px-4 py-2.5 rounded-xl border-2 transition-all shadow-sm ${
                  isSelected
                    ? 'bg-teal-50 border-teal-400 text-teal-900 shadow-teal-100/50'
                    : nar.is_companion
                      ? 'bg-amber-50 border-amber-200 text-gray-800 hover:border-amber-400'
                      : 'bg-white border-gray-200 text-gray-800 hover:border-teal-200 hover:bg-teal-50/40'
                }`}
              >
                {nar.is_companion && <span className="text-amber-500 ml-1 text-xs">◆</span>}
                <span>{(nar.abb_name || nar.name).split('،')[0].trim()}</span>
                {(nar.death_year || nar.death_year_num) && (
                  <span className="block text-[10px] text-gray-400 font-sans mt-0.5">ت {nar.death_year || `${nar.death_year_num}هـ`}</span>
                )}
              </button>

              {relatedChains.length > 0 && (
                <button
                  onClick={() => onToggleExpand(nar.id)}
                  title={`يظهر في ${relatedChains.length} إسناد آخر`}
                  className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border transition-all whitespace-nowrap ${
                    isExpanded
                      ? 'bg-blue-100 border-blue-300 text-blue-700'
                      : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-blue-200 hover:text-blue-500'
                  }`}
                >
                  <span>{relatedChains.length}</span>
                  <span>{isExpanded ? '▲' : '▼'}</span>
                </button>
              )}
            </div>

            {/* Expanded: other books that share this narrator */}
            {isExpanded && relatedChains.length > 0 && (
              <div className="mt-2 text-xs bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 w-72 text-right shadow-sm">
                <p className="text-blue-600 font-semibold mb-1.5 text-[11px]">يروي في أسانيد أخرى:</p>
                <ul className="space-y-1">
                  {relatedChains.slice(0, 6).map(rc => (
                    <li key={rc.hadithId}>
                      <a href={`/hadith/${rc.hadithId}`} className="text-blue-700 hover:text-blue-900 hover:underline">
                        {rc.takhrij_author || rc.bookTitle}
                        {rc.takhrij_death
                          ? <span className="text-blue-400"> ({rc.takhrij_death}هـ)</span>
                          : null}
                      </a>
                    </li>
                  ))}
                  {relatedChains.length > 6 && (
                    <li className="text-blue-400">و{relatedChains.length - 6} مصادر أخرى</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )
      })}

      {/* Book leaf */}
      <div className="w-px h-5 bg-gray-300 shrink-0" />
      <div className="bg-amber-600 text-white text-xs font-bold font-serif px-4 py-2.5 rounded-xl border-2 border-amber-700 min-w-40 text-center shadow-sm">
        {bookLabel}
      </div>
    </div>
  )
}

// ─── Narrator details panel ────────────────────────────────────────────────────

function NarratorPanel({ nar, onClose }: { nar: Narrator; onClose: () => void }) {
  return (
    <aside className="w-52 shrink-0 border border-gray-200 rounded-xl bg-white p-3 shadow-sm sticky top-16 self-start">
      <div className="flex items-start justify-between mb-2 gap-1">
        <h4 className="font-bold text-gray-800 leading-snug font-serif text-sm flex-1">{nar.name}</h4>
        <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-xl leading-none shrink-0 -mt-0.5">×</button>
      </div>

      <div className="space-y-1.5 text-xs text-gray-600">
        {nar.is_companion && (
          <span className="inline-block bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-[11px] mb-0.5">
            ◆ صحابي
          </span>
        )}
        {nar.tabaqa && (
          <p><span className="text-gray-400">الطبقة: </span>{nar.tabaqa}</p>
        )}
        {(nar.death_year || nar.death_year_num) && (
          <p><span className="text-gray-400">الوفاة: </span>{nar.death_year || `${nar.death_year_num} هـ`}</p>
        )}
        {nar.martaba_ibn_hajar && (
          <p><span className="text-gray-400">ابن حجر: </span>{nar.martaba_ibn_hajar}</p>
        )}
      </div>

      <a
        href={`/narrator/${nar.id}`}
        className="mt-3 block text-xs text-center text-teal-700 border border-teal-200 rounded-lg py-1.5 hover:bg-teal-50 transition-colors"
      >
        الترجمة الكاملة ←
      </a>
    </aside>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function IsnadTree({ hadithId }: { hadithId: number }) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [allChains, setAllChains] = useState<ChainRow[]>([])
  const [currentChains, setCurrentChains] = useState<ChainRow[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('chain')
  const [selectedChainIdx, setSelectedChainIdx] = useState(0)
  const [selectedNarrator, setSelectedNarrator] = useState<Narrator | null>(null)
  const [expandedNarrators, setExpandedNarrators] = useState<Set<number>>(new Set())
  const [tahdethTypes, setTahdethTypes] = useState<Record<number, string>>({})
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  // Cap chains fed to the full graph so it stays legible, current hadith's chains first.
  const graphChains = useMemo(() => {
    const cur = allChains.filter(c => c.hadithId === hadithId)
    const others = allChains.filter(c => c.hadithId !== hadithId)
    return [...cur, ...others].slice(0, MAX_GRAPH_CHAINS)
  }, [allChains, hadithId])

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (graphChains.length) {
      const { nodes: n, edges: e } = buildGraph(graphChains, hadithId, dark)
      setNodes(n); setEdges(e)
    }
  }, [dark, graphChains]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setPhase('loading')
    try {
      const res = await fetch(`/api/hadith/${hadithId}/tree`)
      const data = await res.json()
      if (data.message && (!data.chains || data.chains.length === 0)) {
        setErrorMsg(data.message); setPhase('error'); return
      }
      const chains: ChainRow[] = data.chains || []
      setTahdethTypes(data.tahdethTypes || {})
      if (chains.length === 0) { setErrorMsg('لا توجد أسانيد مرتبطة'); setPhase('error'); return }
      setAllChains(chains)
      const curr = chains.filter(c => c.hadithId === hadithId)
      setCurrentChains(curr.length > 0 ? curr : [chains[0]])
      // Graph nodes are built by the [dark, graphChains] effect once allChains is set.
      setPhase('done')
    } catch {
      setErrorMsg('تعذّر تحميل البيانات'); setPhase('error')
    }
  }

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.data.narratorId) window.location.href = `/narrator/${node.data.narratorId}`
    else if (node.data.hadithId) window.location.href = `/hadith/${node.data.hadithId}`
  }, [])

  function toggleExpand(id: number) {
    setExpandedNarrators(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  if (phase === 'idle' || phase === 'loading') return <span className="text-xs text-gray-400">جاري تحميل الإسناد...</span>
  if (phase === 'error') return <p className="text-sm text-gray-400">{errorMsg}</p>

  const activeChain = currentChains[selectedChainIdx] ?? currentChains[0]

  return (
    <div dir="rtl" className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setViewMode('chain')}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
            viewMode === 'chain'
              ? 'bg-teal-700 text-white'
              : 'text-gray-500 bg-gray-100 hover:bg-gray-200'
          }`}
        >
          عرض السلسلة
        </button>
        <button
          onClick={() => setViewMode('graph')}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
            viewMode === 'graph'
              ? 'bg-gray-700 text-white'
              : 'text-gray-400 bg-gray-50 border border-gray-200 hover:bg-gray-100'
          }`}
        >
          الشجرة الكاملة ({allChains.length} إسناد)
        </button>
      </div>

      {/* ── Chain view (default) ── */}
      {viewMode === 'chain' && activeChain && (
        <div className="flex gap-4 items-start">
          <div className="flex-1 min-w-0">
            {/* Chain selector tabs — only shown if this hadith has >1 chain */}
            {currentChains.length > 1 && (
              <div className="flex gap-1.5 mb-3 flex-wrap">
                {currentChains.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => { setSelectedChainIdx(i); setSelectedNarrator(null) }}
                    className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                      selectedChainIdx === i
                        ? 'bg-green-700 text-white border-green-700'
                        : 'text-gray-500 border-gray-200 hover:border-green-400'
                    }`}
                  >
                    إسناد {i + 1}
                  </button>
                ))}
              </div>
            )}

            <LinearChain
              chain={activeChain}
              hadithId={hadithId}
              allChains={allChains}
              selectedNarratorId={selectedNarrator?.id ?? null}
              expandedNarrators={expandedNarrators}
              onSelectNarrator={setSelectedNarrator}
              onToggleExpand={toggleExpand}
              tahdethTypes={tahdethTypes}
            />
          </div>

          {/* Narrator details panel — slides in on narrator click */}
          {selectedNarrator && (
            <NarratorPanel nar={selectedNarrator} onClose={() => setSelectedNarrator(null)} />
          )}
        </div>
      )}

      {/* ── Full graph (advanced) ── */}
      {viewMode === 'graph' && (
        <div>
          <p className="text-xs text-gray-400 mb-2">
            {allChains.length > graphChains.length
              ? `عرض ${graphChains.length} من ${allChains.length} إسناد (أسانيد هذا الحديث أولاً) — للمزيد استعرض الأسانيد فردياً`
              : `${allChains.length} إسناداً`}
            {' '}— اسحب للتنقل · عجلة الماوس للتكبير · انقر على الراوي لترجمته
          </p>
          <div style={{ height: 520 }} className="w-full border border-gray-100 rounded-xl overflow-hidden bg-surface">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              attributionPosition="bottom-left"
              minZoom={0.08}
              maxZoom={2.5}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={true}
            >
              <Background color={dark ? '#2A313A' : '#e5e7eb'} gap={20} size={1} />
              <Controls position="bottom-right" showInteractive={false} />
              <MiniMap
                nodeColor={n =>
                  n.id === 'root' ? '#14532d'
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
            </ReactFlow>
          </div>
        </div>
      )}
    </div>
  )
}
