// DPU 核心算法：12 维需求势能引擎 + 连续层级压制 + 关联耦合
import type { DemandAnalysis, ExtendedAnalysis, DemandRankItem } from '@/types'
import { NEED_NAMES, NEED_LAYERS, LEVEL_WEIGHTS, KEYWORDS, LAYER_NAMES_CN, buildAssociationMatrix } from './needs-const'
import type { ExtractionResult, ExtractedNeed } from './llm'

export { NEED_NAMES, NEED_LAYERS, LEVEL_WEIGHTS }

// 增强关联矩阵（带静态定义，用于快速访问）
export const ASSOCIATION_MATRIX: number[][] = buildAssociationMatrix()

// ---------- 关键词得分 ----------
function keywordScores(text: string): number[] {
  const lower = text.toLowerCase()
  const scores = new Array(12).fill(0)
  for (let i = 0; i < 12; i++) {
    for (const kw of KEYWORDS[i]) {
      if (lower.includes(kw)) scores[i] += 1
    }
  }
  return scores
}

// ---------- 连续层级压制（核心算法升级）----------
// 旧版：当底层激活 -> 上层被 0/1 压制（二元开关）
// 新版：suppression = 连续函数，随底层激活值和层级差平滑变化
function computeSuppression(
  baseActivations: number[],      // 当前 12 维的基础激活值
  rawPotentials: number[],        // 尚未压制的原始势能
): number[] {
  // 每层平均激活值
  const layerAvg: number[] = [0, 0, 0, 0, 0]
  const layerCount: number[] = [0, 0, 0, 0, 0]
  for (let i = 0; i < 12; i++) {
    layerAvg[NEED_LAYERS[i]] += baseActivations[i]
    layerCount[NEED_LAYERS[i]] += 1
  }
  for (let l = 0; l < 5; l++) {
    if (layerCount[l] > 0) layerAvg[l] /= layerCount[l]
  }
  // 底层(0,1) 压制 高层(2,3,4)
  // 压制强度 = 1 - exp(-Σ底层激活 * 层级差系数)
  const lowLevelStrength = (layerAvg[0] * 0.6 + layerAvg[1] * 0.7) / 1.3
  return rawPotentials.map((raw, i) => {
    const layer = NEED_LAYERS[i]
    if (layer <= 1) return raw // 底层不受压制
    const layerGap = layer - 1 // 离底层的层级差
    // 指数衰减函数：底层越强、层级越高 → 压制越重
    const suppression = 1 - Math.exp(-lowLevelStrength * layerGap * 1.2)
    // 但允许上层有最小残留（0.2 倍），模拟"不是完全没，而是被推后"
    const retained = 0.2 + 0.8 * (1 - suppression)
    return raw * retained
  })
}

// ---------- 关联耦合（正向传播）----------
// 协同需求互相增强，冲突需求互相抑制
function applyCoupling(potentials: number[], matrix: number[][]): number[] {
  const next = potentials.slice()
  for (let iter = 0; iter < 2; iter++) {
    const temp = next.slice()
    for (let i = 0; i < 12; i++) {
      if (next[i] < 0.08) continue
      let delta = 0
      for (let j = 0; j < 12; j++) {
        if (i === j) continue
        const coef = matrix[i][j]
        if (Math.abs(coef) < 0.15) continue
        // 协同需求正相关，冲突负相关
        delta += temp[j] * coef * 0.15
      }
      next[i] = Math.max(0, Math.min(1, next[i] + delta * 0.5))
    }
  }
  return next
}

// ---------- 核心分析函数（统一入口）----------
export interface AnalyzeOptions {
  contextDemands?: number[]              // 最近对话激活的需求 id（上下文加成）
  profileWeights?: number[]              // 用户画像的长期权重（个性化加成）
  llmExtraction?: ExtractionResult       // LLM 语义抽取结果（如果已配置大模型）
  useLayerSuppression?: boolean          // 是否启用层级压制
  useCoupling?: boolean                  // 是否启用关联耦合
}

export function analyzeText(
  text: string,
  options: AnalyzeOptions = {},
): ExtendedAnalysis {
  const {
    contextDemands = [],
    profileWeights,
    llmExtraction,
    useLayerSuppression = true,
    useCoupling = true,
  } = options

  // ------- Step 1: 基础激活得分 -------
  let baseActivations: number[]
  let primaryReasons: Map<number, string[]> = new Map()
  let methodLabel = '关键词匹配'

  if (llmExtraction && llmExtraction.surface_needs.length > 0) {
    // LLM 语义抽取：以 strength * confidence 作为信号
    baseActivations = new Array(12).fill(0)
    for (const n of llmExtraction.surface_needs) {
      const val = Math.min(1, n.strength * (0.5 + n.confidence * 0.5))
      baseActivations[n.need_id] = Math.max(baseActivations[n.need_id], val)
      if (n.reason) {
        if (!primaryReasons.has(n.need_id)) primaryReasons.set(n.need_id, [])
        primaryReasons.get(n.need_id)!.push(n.reason)
      }
    }
    // 把隐性需求作为弱信号叠加（系数 0.45）
    for (const h of llmExtraction.hidden_needs) {
      const val = Math.min(1, h.strength * (0.5 + h.confidence * 0.5) * 0.45)
      baseActivations[h.need_id] = Math.max(baseActivations[h.need_id], val)
      if (h.reason) {
        if (!primaryReasons.has(h.need_id)) primaryReasons.set(h.need_id, [])
        primaryReasons.get(h.need_id)!.push(`隐性：${h.reason}`)
      }
    }
    methodLabel = 'LLM 语义理解'
  } else {
    // 关键词模式
    const scores = keywordScores(text)
    const maxScore = Math.max(...scores, 1)
    baseActivations = scores.map(s => {
      if (s === 0) return 0.03 // 基线噪声
      return Math.min(1, (s / maxScore) * 0.75 + 0.15)
    })
    for (let i = 0; i < 12; i++) {
      if (scores[i] > 0) {
        primaryReasons.set(i, [`命中 ${scores[i]} 个关键词`])
      }
    }
  }

  // ------- Step 2: 上下文 + 画像个性化加成 -------
  for (const cid of contextDemands) {
    if (cid >= 0 && cid < 12) baseActivations[cid] = Math.min(1, baseActivations[cid] + 0.08)
  }
  if (profileWeights) {
    // 画像权重做柔和加成（不是简单相乘，避免过度放大）
    baseActivations = baseActivations.map((v, i) => Math.min(1, v * (0.7 + profileWeights[i] * 0.6)))
  }

  // ------- Step 3: 关联耦合（正向传播）-------
  const coupled = useCoupling ? applyCoupling(baseActivations, ASSOCIATION_MATRIX) : baseActivations

  // ------- Step 4: 连续层级压制（马斯洛动态）-------
  const finalPotentials = useLayerSuppression
    ? computeSuppression(baseActivations, coupled)
    : coupled

  // ------- 打包结果 -------
  const ranking: DemandRankItem[] = finalPotentials
    .map((p, i) => ({ i, p }))
    .filter(({ p }) => p > 0.08)
    .sort((a, b) => b.p - a.p)
    .map(({ i, p }, rankIdx) => {
      const reasons = primaryReasons.get(i) || []
      const isSuppressed = useLayerSuppression && NEED_LAYERS[i] >= 2 && p < coupled[i] * 0.85
      return {
        rank: rankIdx + 1,
        need: NEED_NAMES[i],
        need_id: i,
        potential: +p.toFixed(3),
        raw_potential: +coupled[i].toFixed(3),
        layer: LAYER_NAMES_CN[NEED_LAYERS[i]],
        layer_level: NEED_LAYERS[i],
        suppressed: isSuppressed,
        reason: isSuppressed
          ? '被底层需求的连续压制函数衰减（底层激活越强，上层需求被拖后越明显）'
          : reasons.length > 0
            ? reasons.join('；')
            : `关联耦合激活`,
        matched_keywords: reasons,
        urgency: +baseActivations[i].toFixed(3),
        importance: +(profileWeights ? profileWeights[i] : LEVEL_WEIGHTS[i]).toFixed(3),
        intent: llmExtraction ? 0.7 : 0.5,
        level_weight: LEVEL_WEIGHTS[i],
      }
    })

  // ------- 冲突信息（来自 LLM 或 关联矩阵负相关）-------
  const conflicts: any[] = []
  if (llmExtraction && llmExtraction.conflicts.length > 0) {
    for (const c of llmExtraction.conflicts) {
      conflicts.push({
        type: 'strong' as const,
        need_a: NEED_NAMES[c.a],
        need_a_id: c.a,
        need_b: NEED_NAMES[c.b],
        need_b_id: c.b,
        winner: finalPotentials[c.a] >= finalPotentials[c.b] ? NEED_NAMES[c.a] : NEED_NAMES[c.b],
        winner_id: finalPotentials[c.a] >= finalPotentials[c.b] ? c.a : c.b,
        action: c.desc || 'LLM 识别的需求冲突',
        potential_diff: +Math.abs(finalPotentials[c.a] - finalPotentials[c.b]).toFixed(3),
      })
    }
  } else {
    // 从关联矩阵检测（负相关 + 同时被激活）
    const activeIds = ranking.slice(0, 5).map(r => r.need_id)
    for (let a = 0; a < activeIds.length; a++) {
      for (let b = a + 1; b < activeIds.length; b++) {
        const ia = activeIds[a], ib = activeIds[b]
        if (ASSOCIATION_MATRIX[ia][ib] < -0.2 && finalPotentials[ia] > 0.3 && finalPotentials[ib] > 0.3) {
          conflicts.push({
            type: 'weak' as const,
            need_a: NEED_NAMES[ia],
            need_a_id: ia,
            need_b: NEED_NAMES[ib],
            need_b_id: ib,
            winner: finalPotentials[ia] >= finalPotentials[ib] ? NEED_NAMES[ia] : NEED_NAMES[ib],
            winner_id: finalPotentials[ia] >= finalPotentials[ib] ? ia : ib,
            action: `关联矩阵 ${NEED_NAMES[ia]}↔${NEED_NAMES[ib]} 负相关 (${ASSOCIATION_MATRIX[ia][ib].toFixed(2)})`,
            potential_diff: +Math.abs(finalPotentials[ia] - finalPotentials[ib]).toFixed(3),
          })
        }
      }
    }
  }

  const hasConflict = conflicts.length > 0 ||
    ['但', '但是', '可是', '纠结', '矛盾', '两难', '然而'].some(k => text.includes(k))

  // ------- 图表专用数据 -------
  const radar = finalPotentials.map(v => +v.toFixed(3))
  const layerDist = [0, 0, 0, 0, 0]
  radar.forEach((v, i) => { layerDist[NEED_LAYERS[i]] += v })

  // ------- 决策路径（可视化用）-------
  const topNeed = ranking[0]
  const baseActivationStr = topNeed
    ? +(baseActivations[topNeed.need_id]).toFixed(3)
    : 0
  const coupledStr = topNeed
    ? +(coupled[topNeed.need_id]).toFixed(3)
    : 0
  const suppressedBy = topNeed && topNeed.suppressed
    ? `底层激活把「${topNeed.need}」的势能从 ${coupledStr} 衰减到 ${topNeed.potential}`
    : '无明显压制'

  const decision_path = [
    { step: '信号采集', detail: methodLabel, value: text.length > 30 ? '长文本 ✓' : '短文本' },
    { step: '基础激活', detail: `Top1 「${topNeed?.need || '-'}」激活值 ${baseActivationStr}`, value: baseActivationStr.toString() },
    { step: '关联耦合', detail: `协同/冲突网络双向传播一次 → 修正后 ${coupledStr}`, value: coupledStr.toString() },
    { step: '层级压制', detail: suppressedBy, value: topNeed?.suppressed ? '被衰减' : '通过' },
    { step: '最终排序', detail: topNeed ? `「${topNeed.need}」胜出（势能 ${topNeed.potential}）` : '无明显需求信号', value: topNeed ? `Rank #1` : '-' },
  ]

  return {
    success: true,
    source_text: text,
    demand_ranking: ranking,
    suppressed: ranking.filter(r => r.suppressed).map(r => r.need),
    conflicts,
    total_active_needs: ranking.length,
    suppression_report: {
      suppressed_layers: Array.from(new Set(ranking.filter(r => r.suppressed).map(r => r.layer_level))),
      trigger_layer: 0, // 连续压制中用的是整体激活，不再用"触发层"概念
      trigger_value: +(baseActivations.reduce((a, b, i) => (NEED_LAYERS[i] <= 1 ? a + b : a), 0) / 6).toFixed(3),
    },
    radar_data: radar,
    layer_distribution: layerDist,
    matrix: ASSOCIATION_MATRIX,
    decision_path,
    suppression_links: ranking.filter(r => r.suppressed).map(r => ({ source: 0, target: r.need_id, value: r.potential })),
    has_conflict: hasConflict,
    conflict_intensity: +Math.min(1, conflicts.length * 0.25 + 0.2).toFixed(2),
    method_label: methodLabel,
  } as ExtendedAnalysis & { method_label: string }
}

// ---------- 向后兼容（旧调用方式不变）----------
export function localAnalyze(text: string, contextDemands?: number[]): ExtendedAnalysis {
  return analyzeText(text, { contextDemands })
}

// ---------- 用户画像管理器（带 IndexedDB）----------
import {
  getProfile,
  saveProfile,
  addEntry,
  buildMemoryEntry,
  updateProfileWithEntry,
  resetAllMemory,
  getRecentEntries,
  getAllEntries,
  getTimeLineData,
  saveMessagesToStorage,
  loadMessagesFromStorage,
  clearMessagesStorage,
  type UserProfile,
  type MemoryEntry,
  type PersistedMessage,
} from './memory'

export { getProfile, saveProfile, addEntry, buildMemoryEntry, updateProfileWithEntry, resetAllMemory, getRecentEntries, getAllEntries, getTimeLineData, saveMessagesToStorage, loadMessagesFromStorage, clearMessagesStorage }
export type { UserProfile, MemoryEntry, PersistedMessage }
