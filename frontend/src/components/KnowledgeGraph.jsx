import { useMemo, useEffect, useState } from 'react'
import useSWR from 'swr'
import dagre from '@dagrejs/dagre'
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { apiGet } from '../api/client'

const NODE_COLORS = {
  concept: '#3b82f6',
  author:  '#22c55e',
  dataset: '#f59e0b',
}

const NODE_W = 150
const NODE_H = 36

function layoutWithDagre(rawNodes, rawEdges) {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 120, marginx: 40, marginy: 40 })

  rawNodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }))
  rawEdges.forEach((e) => g.setEdge(e.source, e.target))

  dagre.layout(g)

  const nodes = rawNodes.map((n) => {
    const { x, y } = g.node(n.id)
    return { ...n, position: { x: x - NODE_W / 2, y: y - NODE_H / 2 } }
  })

  return { nodes, edges: rawEdges }
}

function buildRaw(entities, relationships) {
  const connectedIds = new Set(
    relationships.flatMap((r) => [r.source_id, r.target_id])
  )
  const connected = entities.filter((e) => connectedIds.has(e.id))

  const nodes = connected.map((e) => {
    const color = NODE_COLORS[e.type] || '#64748b'
    return {
      id: e.id,
      data: { label: e.name },
      position: { x: 0, y: 0 },
      style: {
        background: color + '22',
        border: `1.5px solid ${color}`,
        borderRadius: 8,
        color: '#f1f5f9',
        fontSize: 11,
        padding: '4px 8px',
        width: NODE_W,
        textAlign: 'center',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
    }
  })

  const edges = relationships.map((r) => ({
    id: r.id,
    source: r.source_id,
    target: r.target_id,
    label: r.type,
    animated: r.type === 'cites',
    style: { stroke: '#475569' },
    labelStyle: { fontSize: 10, fill: '#94a3b8' },
    labelBgStyle: { fill: '#1e293b', fillOpacity: 0.9 },
  }))

  return { nodes, edges }
}

export default function KnowledgeGraph({ groupId }) {
  const swrKey = groupId ? `/api/graph/data?group_id=${groupId}` : null
  const { data, error, isLoading, mutate } = useSWR(swrKey, apiGet)

  const ALL_TYPES = Object.keys(NODE_COLORS)
  const [selectedTypes, setSelectedTypes] = useState(new Set(ALL_TYPES))

  function toggleType(type) {
    setSelectedTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        if (next.size === 1) return prev
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(() => {
    if (!data?.entities?.length) return { nodes: [], edges: [] }
    const filteredEntities = data.entities.filter((e) => selectedTypes.has(e.type))
    const filteredIds = new Set(filteredEntities.map((e) => e.id))
    const filteredRels = (data.relationships || []).filter(
      (r) => filteredIds.has(r.source_id) && filteredIds.has(r.target_id)
    )
    const { nodes: raw, edges: rawE } = buildRaw(filteredEntities, filteredRels)
    return layoutWithDagre(raw, rawE)
  }, [data, selectedTypes])

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges)

  useEffect(() => { setNodes(layoutNodes) }, [layoutNodes, setNodes])
  useEffect(() => { setEdges(layoutEdges) }, [layoutEdges, setEdges])

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-red-400 text-sm">Failed to load graph data.</p>
      </div>
    )
  }

  if (!data?.entities?.length) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-slate-400 text-sm">No entities yet.</p>
          <p className="text-slate-500 text-xs">Upload and process papers to build the graph.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 shrink-0">
        <div className="flex flex-wrap gap-2">
          {Object.entries(NODE_COLORS).map(([type, color]) => {
            const active = selectedTypes.has(type)
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition-all"
                style={{
                  borderColor: color,
                  background: active ? color + '22' : 'transparent',
                  color: active ? '#f1f5f9' : '#64748b',
                }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block transition-opacity"
                  style={{ background: color, opacity: active ? 1 : 0.3 }}
                />
                {type}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>{layoutNodes.length} entities · {layoutEdges.length} relationships</span>
          <button
            onClick={() => mutate()}
            className="text-slate-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1" style={{ background: '#0f172a' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.1}
          colorMode="dark"
        >
          <Controls />
          <MiniMap
            style={{ background: '#1e293b' }}
            nodeColor={(n) => n.style?.border?.replace('1.5px solid ', '') || '#64748b'}
          />
          <Background color="#334155" gap={20} />
        </ReactFlow>
      </div>
    </div>
  )
}
