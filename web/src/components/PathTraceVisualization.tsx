import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  NEED_NAMES_CN,
  NEED_COLORS,
  type TracePathResponse,
  type PathNodeData,
  type PathEdgeData,
  sendTraceFeedback,
} from '@/lib/dpuApi'

// ============================================================
// 布局算法：把节点按层级排列成放射状
// ============================================================

interface PositionedNode {
  node: PathNodeData
  x: number
  y: number
  radius: number
}

interface PositionedEdge {
  edge: PathEdgeData
  x1: number
  y1: number
  x2: number
  y2: number
}

const SVG_WIDTH = 720
const SVG_HEIGHT = 460
const CENTER_X = SVG_WIDTH / 2
const CENTER_Y = SVG_HEIGHT / 2

function layoutNodes(nodes: PathNodeData[]): PositionedNode[] {
  const roots = nodes.filter(n => n.node_type === 'root')
  const l1Nodes = nodes.filter(n => n.node_type === 'l1')
  const l2Nodes = nodes.filter(n => n.node_type === 'l2')

  const positioned: PositionedNode[] = []

  // 根节点：排成一行（顶部）
  const rootSpacing = Math.min(120, (SVG_WIDTH - 80) / Math.max(roots.length, 1))
  const rootStartX = CENTER_X - ((roots.length - 1) * rootSpacing) / 2
  roots.forEach((n, i) => {
    positioned.push({
      node: n,
      x: rootStartX + i * rootSpacing,
      y: 60,
      radius: 22 + n.value * 18,
    })
  })

  // L1 节点：排成一行（中间）
  const l1Spacing = Math.min(90, (SVG_WIDTH - 80) / Math.max(l1Nodes.length, 1))
  const l1StartX = CENTER_X - ((l1Nodes.length - 1) * l1Spacing) / 2
  l1Nodes.forEach((n, i) => {
    positioned.push({
      node: n,
      x: l1StartX + i * l1Spacing,
      y: 200,
      radius: 14 + n.value * 12,
    })
  })

  // L2 节点：排成一行（底部）
  const l2Spacing = Math.min(70, (SVG_WIDTH - 80) / Math.max(l2Nodes.length, 1))
  const l2StartX = CENTER_X - ((l2Nodes.length - 1) * l2Spacing) / 2
  l2Nodes.forEach((n, i) => {
    positioned.push({
      node: n,
      x: l2StartX + i * l2Spacing,
      y: 330,
      radius: 10 + n.value * 8,
    })
  })

  return positioned
}

function layoutEdges(
  edges: PathEdgeData[],
  positionedNodes: PositionedNode[],
): PositionedEdge[] {
  const nodeMap = new Map<number, PositionedNode>()
  positionedNodes.forEach(pn => nodeMap.set(pn.node.need_id, pn))

  return edges
    .map(edge => {
      const from = nodeMap.get(edge.from_id)
      const to = nodeMap.get(edge.to_id)
      if (!from || !to) return null
      return { edge, x1: from.x, y1: from.y, x2: to.x, y2: to.y }
    })
    .filter((e): e is PositionedEdge => e !== null)
}

// ============================================================
// 主组件
// ============================================================

interface Props {
  traceData: TracePathResponse | null
  loading: boolean
  error: string | null
}

export function PathTraceVisualization({ traceData, loading, error }: Props) {
  const [selectedEdge, setSelectedEdge] = useState<PathEdgeData | null>(null)
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)
  const [feedbackLoading, setFeedbackLoading] = useState(false)

  const path = traceData?.path

  const positionedNodes = useMemo(() => {
    if (!path?.nodes) return []
    return layoutNodes(path.nodes)
  }, [path])

  const positionedEdges = useMemo(() => {
    if (!path?.edges) return []
    return layoutEdges(path.edges, positionedNodes)
  }, [path, positionedNodes])

  const handleFeedback = useCallback(
    async (isCorrect: boolean) => {
      if (!selectedEdge) return
      setFeedbackLoading(true)
      try {
        const res = await sendTraceFeedback(
          selectedEdge.from_id,
          selectedEdge.to_id,
          isCorrect,
        )
        if (res.success) {
          setFeedbackMsg(
            isCorrect
              ? '✅ 已提升该路径的关联度（+10%）'
              : '✂️ 已降低该路径的关联度（-20%，切掉重连）',
          )
        } else {
          setFeedbackMsg('反馈失败：' + (res.error || '未知错误'))
        }
      } catch (e: any) {
        setFeedbackMsg('反馈失败：' + (e.message || e))
      } finally {
        setFeedbackLoading(false)
        setTimeout(() => {
          setFeedbackMsg(null)
          setSelectedEdge(null)
        }, 3000)
      }
    },
    [selectedEdge],
  )

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5">
        <div className="flex items-center gap-3 text-sm text-indigo-200">
          <span className="inline-block w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
          正在追踪推理路径...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-amber-500/20 bg-amber-950/20 p-5">
        <div className="text-sm text-amber-300">⚠️ {error}</div>
      </div>
    )
  }

  if (!path || path.nodes.length === 0) {
    return null
  }

  const maxValue = Math.max(...path.nodes.map(n => n.value), 0.01)

  return (
    <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/30 to-slate-950/40 backdrop-blur p-5">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-white font-semibold text-sm flex items-center gap-2">
            <span className="text-base">🔗</span>
            推理路径追踪
            <span className="text-xs text-white/40 ml-2">"那根线"</span>
          </h3>
          <p className="text-xs text-white/40 mt-1">
            需求激活是怎么沿着关联矩阵传过去的 — 点击连线可以标记对错（切掉重连）
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-white/40">
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#6366f1' }} />
            根节点
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#8b5cf6' }} />
            一级传导
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#ec4899' }} />
            二级传导
          </div>
        </div>
      </div>

      {/* SVG 图 */}
      <div className="relative overflow-x-auto">
        <svg
          width={SVG_WIDTH}
          height={SVG_HEIGHT}
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="mx-auto"
          style={{ maxWidth: '100%' }}
        >
          {/* 边 */}
          {positionedEdges.map((pe, i) => {
            const isConflict = pe.edge.edge_type === 'conflict' || pe.edge.edge_type === 'suppression'
            const isSelected = selectedEdge?.from_id === pe.edge.from_id && selectedEdge?.to_id === pe.edge.to_id
            const strokeWidth = Math.max(1, Math.abs(pe.edge.propagated_value) * 6)
            const color = isConflict
              ? '#f43f5e'
              : pe.edge.is_user_modified
                ? '#fbbf24'
                : '#6366f1'
            const opacity = isSelected ? 1 : 0.6

            return (
              <g key={i}>
                {/* 连线 */}
                <line
                  x1={pe.x1}
                  y1={pe.y1}
                  x2={pe.x2}
                  y2={pe.y2}
                  stroke={color}
                  strokeWidth={isSelected ? strokeWidth + 2 : strokeWidth}
                  strokeDasharray={isConflict ? '5 3' : 'none'}
                  opacity={opacity}
                  style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                  onClick={() => setSelectedEdge(pe.edge)}
                />
                {/* 关联度标签（仅在选中时显示） */}
                {isSelected && (
                  <g>
                    <rect
                      x={(pe.x1 + pe.x2) / 2 - 28}
                      y={(pe.y1 + pe.y2) / 2 - 10}
                      width={56}
                      height={20}
                      rx={4}
                      fill="#1e1b4b"
                      stroke={color}
                      strokeWidth={1}
                    />
                    <text
                      x={(pe.x1 + pe.x2) / 2}
                      y={(pe.y1 + pe.y2) / 2 + 4}
                      textAnchor="middle"
                      fill={color}
                      fontSize={10}
                      fontWeight="bold"
                    >
                      {pe.edge.correlation > 0 ? '+' : ''}{pe.edge.correlation.toFixed(2)}
                    </text>
                  </g>
                )}
                {/* 箭头方向标识（中点小三角） */}
                {!isConflict && (
                  <circle
                    cx={pe.x1 + (pe.x2 - pe.x1) * 0.5}
                    cy={pe.y1 + (pe.y2 - pe.y1) * 0.5}
                    r={2}
                    fill={color}
                    opacity={opacity * 0.8}
                  />
                )}
              </g>
            )
          })}

          {/* 节点 */}
          {positionedNodes.map((pn, i) => {
            const color = NEED_COLORS[pn.node.need_id] || '#6366f1'
            const intensity = pn.node.value / maxValue
            const isRoot = pn.node.node_type === 'root'
            const isL2 = pn.node.node_type === 'l2'

            return (
              <g key={i} style={{ cursor: 'pointer' }}>
                {/* 外圈光晕 */}
                {isRoot && (
                  <circle
                    cx={pn.x}
                    cy={pn.y}
                    r={pn.radius + 6}
                    fill={color}
                    opacity={0.1}
                  />
                )}
                {/* 主圆 */}
                <circle
                  cx={pn.x}
                  cy={pn.y}
                  r={pn.radius}
                  fill={color}
                  opacity={0.2 + intensity * 0.6}
                  stroke={color}
                  strokeWidth={isRoot ? 2.5 : isL2 ? 1 : 1.5}
                />
                {/* 内圈 */}
                <circle
                  cx={pn.x}
                  cy={pn.y}
                  r={pn.radius * 0.6}
                  fill={color}
                  opacity={0.3 + intensity * 0.4}
                />
                {/* 名称 */}
                <text
                  x={pn.x}
                  y={pn.y - pn.radius - 8}
                  textAnchor="middle"
                  fill="#fff"
                  fontSize={isRoot ? 11 : 10}
                  fontWeight={isRoot ? 'bold' : 'normal'}
                  opacity={0.9}
                >
                  {pn.node.need_name}
                </text>
                {/* 数值 */}
                <text
                  x={pn.x}
                  y={pn.y + 4}
                  textAnchor="middle"
                  fill="#fff"
                  fontSize={isRoot ? 12 : 10}
                  fontWeight="bold"
                  opacity={0.95}
                >
                  {pn.node.value.toFixed(2)}
                </text>
                {/* 层级标签 */}
                <text
                  x={pn.x + pn.radius + 4}
                  y={pn.y + pn.radius + 12}
                  textAnchor="start"
                  fill={color}
                  fontSize={8}
                  opacity={0.5}
                >
                  {isRoot ? '根' : isL2 ? 'L2' : 'L1'}
                </text>
              </g>
            )
          })}

          {/* 层级标签（左侧） */}
          <text x={20} y={65} fill="#6366f1" fontSize={10} opacity={0.5}>直接激活</text>
          <text x={20} y={205} fill="#8b5cf6" fontSize={10} opacity={0.5}>一级传导</text>
          <text x={20} y={335} fill="#ec4899" fontSize={10} opacity={0.5}>二级传导</text>
        </svg>
      </div>

      {/* 冲突对 */}
      {path.conflict_pairs && path.conflict_pairs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {path.conflict_pairs.map((cp, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-950/30 border border-rose-500/20 text-xs"
            >
              <span className="text-rose-300">{cp.need_a_name}</span>
              <span className="text-white/30">⇄</span>
              <span className="text-rose-300">{cp.need_b_name}</span>
              <span className="text-white/40 ml-1">({cp.correlation.toFixed(2)})</span>
            </div>
          ))}
        </div>
      )}

      {/* 选中边的操作面板 */}
      <AnimatePresence>
        {selectedEdge && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mt-3 rounded-xl bg-slate-950/60 border border-indigo-400/30 p-4"
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs text-white/70">
                <span className="text-white font-semibold">{selectedEdge.from_name}</span>
                <span className="text-white/40 mx-2">→</span>
                <span className="text-white font-semibold">{selectedEdge.to_name}</span>
                <span className="text-white/40 ml-3">
                  关联度: {selectedEdge.correlation.toFixed(2)} · 传导值: {selectedEdge.propagated_value.toFixed(3)}
                </span>
                {selectedEdge.is_user_modified && (
                  <span className="ml-2 text-amber-300 text-[10px]">（已被你修改过）</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleFeedback(false)}
                  disabled={feedbackLoading}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 text-xs font-medium hover:bg-rose-500/30 transition-colors border border-rose-500/30 disabled:opacity-50"
                >
                  ✂️ 路径不对（切掉）
                </button>
                <button
                  onClick={() => handleFeedback(true)}
                  disabled={feedbackLoading}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-medium hover:bg-emerald-500/30 transition-colors border border-emerald-500/30 disabled:opacity-50"
                >
                  ✅ 路径对
                </button>
                <button
                  onClick={() => setSelectedEdge(null)}
                  className="px-3 py-1.5 rounded-lg bg-white/5 text-white/50 text-xs hover:bg-white/10 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 反馈消息 */}
      <AnimatePresence>
        {feedbackMsg && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 text-xs text-indigo-300 bg-indigo-950/30 border border-indigo-500/20 rounded-lg p-3"
          >
            {feedbackMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 文字版路径摘要 */}
      <div className="mt-3 text-xs text-white/40 leading-relaxed border-t border-white/5 pt-3">
        {path.root_nodes && path.root_nodes.length > 0 && (
          <>
            <span className="text-white/60">根节点：</span>
            {path.root_nodes.map(id => NEED_NAMES_CN[id]).join('、')}
            <span className="text-white/40 mx-2">→</span>
            <span className="text-white/60">传导至</span>
            <span className="text-white/40 mx-1">
              {positionedNodes.filter(pn => pn.node.node_type === 'l1').length}
            </span>
            <span className="text-white/60">个一级节点 +</span>
            <span className="text-white/40 mx-1">
              {positionedNodes.filter(pn => pn.node.node_type === 'l2').length}
            </span>
            <span className="text-white/60">个二级节点</span>
          </>
        )}
      </div>
    </div>
  )
}
