'use client'
import { useCallback, useState } from 'react'
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

interface Narrator {
  id: number
  name: string
  abb_name: string | null
  martaba_ibn_hajar: string | null
  is_companion: boolean
}

interface ChainRow {
  hadithId: number
  bookTitle: string
  takhrij_author: string | null
  takhrij_death: number | null
  narrators: Narrator[]
}

const NW = 128
const NH = 34

function buildGraph(chains: ChainRow[], currentHadithId: number): { nodes: Node[]; edges: Edge[] } {
  const nodeMap = new Map<string, Node>()
  const edgeSet = new Set<string>()
  const rawEdges: Edge[] = []

  // Pre-compute which edge keys belong to the current hadith's chains
  // so we can style them distinctly regardless of processing order
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

  // Prophet root
  nodeMap.set('root', {
    id: 'root',
    data: { label: 'النبي ﷺ' },
    position: { x: 0, y: 0 },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    style: {
      background: '#14532d', color: 'white', fontFamily: 'Amiri, serif',
      fontSize: 13, fontWeight: 'bold', border: '2px solid #166534',
      borderRadius: 8, width: NW, padding: '4px 8px', textAlign: 'center',
    },
  })

  for (const chain of chains) {
    let prevId = 'root'

    for (const nar of chain.narrators) {
      const nodeId = `n-${nar.id}`
      if (!nodeMap.has(nodeId)) {
        const raw = (nar.abb_name || nar.name).split('،')[0].trim()
        const label = raw.split(' ').slice(0, 3).join(' ')
        nodeMap.set(nodeId, {
          id: nodeId,
          data: { label: nar.is_companion ? `◆ ${label}` : label, narratorId: nar.id },
          position: { x: 0, y: 0 },
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          style: {
            background: nar.is_companion ? '#fffbeb' : '#f9fafb',
            color: '#111827',
            border: `1px solid ${nar.is_companion ? '#f59e0b' : '#d1d5db'}`,
            borderRadius: 6, fontFamily: 'Amiri, serif',
            fontSize: 11, width: NW, padding: '3px 6px',
            textAlign: 'center', cursor: 'pointer',
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
            color: isCurrent ? '#15803d' : '#9ca3af',
            width: 12, height: 12,
          },
          style: {
            stroke: isCurrent ? '#16a34a' : '#d1d5db',
            strokeWidth: isCurrent ? 2.5 : 1,
            opacity: isCurrent ? 1 : 0.5,
          },
          zIndex: isCurrent ? 10 : 1,
        })
      }
      prevId = nodeId
    }

    // Book leaf — current book gets amber highlight, others stay blue
    const bookId = `book-${chain.hadithId}`
    const isCurrentBook = chain.hadithId === currentHadithId
    if (!nodeMap.has(bookId)) {
      const label = (chain.takhrij_author?.split(' ').slice(0, 2).join(' ') || chain.bookTitle.slice(0, 12))
        + (chain.takhrij_death ? ` (${chain.takhrij_death})` : '')
      nodeMap.set(bookId, {
        id: bookId,
        data: { label, hadithId: chain.hadithId },
        position: { x: 0, y: 0 },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        style: isCurrentBook ? {
          background: '#d97706', color: 'white',
          border: '2px solid #b45309', borderRadius: 6,
          fontFamily: 'Amiri, serif', fontSize: 10, width: NW,
          padding: '3px 6px', textAlign: 'center', cursor: 'pointer',
          fontWeight: 'bold',
        } : {
          background: '#eff6ff', color: '#1d4ed8',
          border: '1px solid #93c5fd', borderRadius: 6,
          fontFamily: 'Amiri, serif', fontSize: 10, width: NW,
          padding: '3px 6px', textAlign: 'center', cursor: 'pointer',
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
          color: isCurrent ? '#15803d' : '#93c5fd',
          width: 10, height: 10,
        },
        style: {
          stroke: isCurrent ? '#16a34a' : '#bfdbfe',
          strokeWidth: isCurrent ? 2.5 : 1,
          opacity: isCurrent ? 1 : 0.5,
        },
        zIndex: isCurrent ? 10 : 1,
      })
    }
  }

  // Dagre layout — top to bottom
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

export default function IsnadTree({ hadithId }: { hadithId: number }) {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [chainCount, setChainCount] = useState(0)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  async function load() {
    setPhase('loading')
    try {
      const res = await fetch(`/api/hadith/${hadithId}/tree`)
      const data = await res.json()
      if (data.message && (!data.chains || data.chains.length === 0)) {
        setErrorMsg(data.message)
        setPhase('error')
        return
      }
      const chains: ChainRow[] = data.chains || []
      if (chains.length === 0) { setErrorMsg('لا توجد أسانيد مرتبطة'); setPhase('error'); return }
      setChainCount(chains.length)
      const { nodes: n, edges: e } = buildGraph(chains, hadithId)
      setNodes(n)
      setEdges(e)
      setPhase('done')
    } catch {
      setErrorMsg('تعذّر تحميل البيانات')
      setPhase('error')
    }
  }

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.data.narratorId) window.location.href = `/narrator/${node.data.narratorId}`
    else if (node.data.hadithId) window.location.href = `/hadith/${node.data.hadithId}`
  }, [])

  if (phase === 'idle') {
    return (
      <button onClick={load}
        className="text-sm text-teal-700 bg-teal-50 border border-teal-100 px-4 py-2 rounded-lg hover:bg-teal-100 transition-colors">
        عرض شجرة الإسناد التفاعلية
      </button>
    )
  }
  if (phase === 'loading') return <span className="text-xs text-gray-400">جاري بناء الشجرة...</span>
  if (phase === 'error') return <p className="text-sm text-gray-400">{errorMsg}</p>

  return (
    <div>
      <p className="text-xs text-gray-400 mb-2">
        {chainCount} إسناداً — اسحب للتنقل · عجلة الماوس للتكبير · انقر على الراوي لترجمته
      </p>
      <div style={{ height: 520 }} className="w-full border border-gray-100 rounded-xl overflow-hidden bg-white">
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
          <Background color="#e5e7eb" gap={20} size={1} />
          <Controls position="bottom-right" showInteractive={false} />
          <MiniMap
            nodeColor={n =>
              n.id === 'root' ? '#14532d'
              : n.id === `book-${hadithId}` ? '#d97706'
              : n.id.startsWith('book-') ? '#93c5fd'
              : (n.style?.border as string || '').includes('f59e0b') ? '#fcd34d'
              : '#d1d5db'
            }
            pannable
            zoomable
          />
        </ReactFlow>
      </div>
    </div>
  )
}
