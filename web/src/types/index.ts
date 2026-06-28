export interface DemandAnalysis {
  success: boolean
  source_text: string
  demand_ranking: DemandRankItem[]
  suppressed: string[]
  conflicts: ConflictItem[]
  total_active_needs: number
  suppression_report: SuppressionReport
  error?: string
}

export interface ExtendedAnalysis extends DemandAnalysis {
  radar_data: number[]
  layer_distribution: number[]
  matrix: number[][]
  decision_path: { step: string; detail: string; value: string }[]
  suppression_links: { source: number; target: number; value: number }[]
  has_conflict: boolean
  conflict_intensity: number
}

export interface DemandRankItem {
  rank: number
  need: string
  need_id: number
  potential: number
  raw_potential?: number
  layer: string
  layer_level: number
  suppressed: boolean
  reason: string
  matched_keywords?: string[]
  urgency?: number
  importance?: number
  intent?: number
  level_weight?: number
}

export interface ConflictItem {
  type: 'strong' | 'weak'
  need_a: string
  need_a_id?: number
  need_b: string
  need_b_id?: number
  winner: string
  winner_id?: number
  action: string
  potential_diff: number
}

export interface SuppressionReport {
  suppressed_layers: number[]
  trigger_layer: number
  trigger_value: number
}

export interface NeedMeta {
  id: number
  name: string
  name_en: string
  layer: MaslowLayer
  level_weight: number
  description: string
  // —— 详细信息（用于点击查看详情）——
  long_description?: string     // 更完整的定义说明（2-3 段）
  scenarios?: string[]           // 常见触发场景（3-5 条）
  signal_keywords?: string[]     // 典型触发关键词
  relations?: string[]           // 与其他需求的关系
  real_cases?: string[]          // 真实案例（1-2 条）
  signals?: {
    satisfied: string[]
    ignored: string[]
    enforced: string[]
  }
  defense_patterns?: {
    surface: string   // 表面说的话
    hidden: string    // 真实需求
    example: string   // 举例说明
  }[]
}

export type MaslowLayer =
  | 'PHYSIOLOGICAL'
  | 'SAFETY'
  | 'SOCIAL'
  | 'ESTEEM'
  | 'SELF_ACTUALIZATION'

export interface LayerInfo {
  id: MaslowLayer
  name_cn: string
  level: number
  level_weight: number
  needs: number[]
}

export interface MatrixData {
  success: boolean
  matrix: number[][]
  needs: string[]
}

export interface ProfileData {
  user_id: string
  interaction_count: number
  needs_weights: number[]
  significant_changes: number[]
  current_prior_strength: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  demands?: DemandRankItem[]
}
