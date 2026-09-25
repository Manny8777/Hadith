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
import { useFlowTouchLock, FlowTouchToggle } from './FlowTouchLock'
import dagre from 'dagre'

interface NarNode {
  id: number
  name: string
  chain_count: number
  is_companion: boolean
  death_year_num: number | null
  tabaqa: string | null
}

interface NarEdge {
  source: number
  target: number
  weight: number
}

const BASE_H = 34

function buildGraph(nodes: NarNode[], edges: NarEdge[]): { nodes: Node[]; edges: Edge[] } {
  const maxChains = Math.max(...nodes.map(n => n.chain_count), 1)
  const maxWeight = Math.max(...edges.map(e => e.weight), 1)

  const nodeW = (n: NarNode) => 90 + Math.round((n.chain_count / maxChains) * 60)

  const rfNodes: Node[] = nodes.map(n => {
    const w = nodeW(n)
    const label = n.name.split('،')[0].trim().split(' ').slice(0, 3).join(' ')
    return {
      id: String(n.id),
      data: { label, narratorId: n.id, chainCount: n.chain_count },
      position: { x: 0, y: 0 },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      style: {
        background: n.is_companion ? '#fffbeb' : '#f9fafb',
        color: '#111827',
        border: `${n.is_companion ? 2 : 1}px solid ${n.is_companion ? '#f59e0b' : '#d1d5db'}`,
        borderRadius: 8, fontFamily: 'Amiri, serif',
        fontSize: 11, width: w, padding: '4px 6px',
        textAlign: 'center', cursor: 'pointer',
        fontWeight: n.is_companion ? 'bold' : 'normal',
        boxShadow: n.chain_count === maxChains ? '0 0 0 2px #059669' : undefined,
      },
    }
  })

  const rfEdges: Edge[] = edges.map(e => {
    const w = 0.8 + (e.weight / maxWeight) * 3
    return {
      id: `${e.source}→${e.target}`,
      source: String(e.source),
      target: String(e.target),
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, color: '#9ca3af', width: 10, height: 10 },
      style: { stroke: '#9ca3af', strokeWidth: Math.min(w, 3.5), opacity: 0.6 },
    }
  })

  // Dagre layout — LR: earlier teachers on left, later students on right
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 80, marginx: 30, marginy: 30 })
  rfNodes.forEach(n => g.setNode(n.id, { width: nodeW(nodes.find(nn => String(nn.id) === n.id)!), height: BASE_H }))
  rfEdges.forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)

  return {
    nodes: rfNodes.map(n => {
      const pos = g.node(n.id)
      if (!pos) return n
      const w = nodeW(nodes.find(nn => String(nn.id) === n.id)!)
      return { ...n, position: { x: pos.x - w / 2, y: pos.y - BASE_H / 2 } }
    }),
    edges: rfEdges,
  }
}

export default function NarratorNetworkGraph({ limit = 20 }: { limit?: number }) {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const touchLock = useFlowTouchLock()
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [summary, setSummary] = useState({ narrators: 0, edges: 0 })

  async function load() {
    setPhase('loading')
    try {
      const res = await fetch(`/api/narrators/network-graph?limit=${limit}`)
      const data = await res.json()
      const rawNodes: NarNode[] = data.nodes || []
      const rawEdges: NarEdge[] = data.edges || []
      if (rawNodes.length === 0) { setPhase('error'); return }
      setSummary({ narrators: rawNodes.length, edges: rawEdges.length })
      const { nodes: n, edges: e } = buildGraph(rawNodes, rawEdges)
      setNodes(n)
      setEdges(e)
      setPhase('done')
    } catch {
      setPhase('error')
    }
  }

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.data.narratorId) window.location.href = `/narrator/${node.data.narratorId}`
  }, [])

  if (phase === 'idle') {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center">
        <p className="text-sm text-gray-500 mb-3">
          خريطة تفاعلية تُظهر العلاقات المباشرة بين أكثر الرواة ظهوراً في الأسانيد — مع تدفق الرواية من شيخ إلى تلميذ
        </p>
        <button
          onClick={load}
          className="text-sm text-teal-700 bg-teal-50 border border-teal-100 px-5 py-2 rounded-lg hover:bg-teal-100 transition-colors"
        >
          عرض خريطة الشبكة التفاعلية
        </button>
      </div>
    )
  }

  if (phase === 'loading') {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center text-sm text-gray-400">
        جاري بناء الشبكة...
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center text-sm text-gray-400">
        تعذّر تحميل بيانات الشبكة
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-400">
          {summary.narrators} راوٍ · {summary.edges} علاقة مباشرة — اسحب للتنقل · انقر على الراوي لترجمته
        </p>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-amber-200 border border-amber-400 inline-block" />
            صحابي
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-gray-100 border border-gray-300 inline-block" />
            تابعي أو محدِّث
          </span>
          <span className="flex items-center gap-1">
            <span className="w-5 h-px bg-gray-400 inline-block" />
            علاقة رواية
          </span>
        </div>
      </div>
      <div style={{ height: 560 }} className="relative w-full border border-gray-100 rounded-xl overflow-hidden bg-white">
        <FlowTouchToggle {...touchLock} />
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          attributionPosition="bottom-left"
          minZoom={0.06}
          maxZoom={2.5}
          nodesDraggable={true}
          nodesConnectable={false}
          {...touchLock.flowProps}
        >
          <Background color="#e5e7eb" gap={20} size={1} />
          <Controls position="bottom-right" showInteractive={false} />
          <MiniMap
            nodeColor={n =>
              (n.style?.border as string || '').includes('f59e0b') ? '#fcd34d' : '#d1d5db'
            }
            pannable
            zoomable
          />
        </ReactFlow>
      </div>
    </div>
  )
}
