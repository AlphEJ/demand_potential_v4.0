// DPU 后端 API 封装 —— 真正的壁垒（12维需求引擎 + 贝叶斯画像 + 关联矩阵）

// 12 维需求中文名（与后端 core/demands.py NeedMeta.NAMES 完全一致）
export const NEED_NAMES_CN = [
  '生理生存',
  '安全稳定',
  '社交归属',
  '情感陪伴',
  '尊重认可',
  '认知求知',
  '审美价值',
  '自我实现',
  '自由掌控',
  '公平公正',
  '成长进阶',
  '秩序规整',
]

export const NEED_COLORS = [
  '#ef4444', // 生理生存 - 红色
  '#f97316', // 安全稳定 - 橙色
  '#eab308', // 社交归属 - 黄色
  '#84cc16', // 情感陪伴 - 浅绿
  '#22c55e', // 尊重认可 - 绿色
  '#14b8a6', // 认知求知 - 青色
  '#06b6d4', // 审美价值 - 青蓝
  '#3b82f6', // 自我实现 - 蓝色
  '#6366f1', // 自由掌控 - 靛蓝
  '#8b5cf6', // 公平公正 - 紫色
  '#d946ef', // 成长进阶 - 粉红紫
  '#ec4899', // 秩序规整 - 粉红
]

// ===== 共享类型 =====
export interface DemandsRankingItem {
  rank: number
  need: string
  potential: number
  layer: string
  reason?: string
}

export interface AnalyzeResponse {
  success: boolean
  activation12?: number[]
  top_needs?: string[]
  suppressed?: string[]
  conflicts?: Array<{ need_a: string; need_b: string; winner?: string }>
  signals?: string[]
  llm_context?: any
  llm_available?: boolean
  source_text?: string
  demand_ranking?: DemandsRankingItem[]
  error?: string
}

export interface AskRequest {
  text: string
  activation12: number[]
  top_needs?: string[]
  suppressed?: string[]
  conflicts?: string[]
  signals?: string[]
  question: string
}

export interface AskResponse {
  success: boolean
  answer: string
  error?: string
}

export interface AvatarPersona {
  name: string
  avatar_emoji?: string
  relationship?: string
  gender_hint?: string
  age_hint?: string
  raw_description?: string
  speech_notes?: string
  custom_tags?: string[]
}

export interface AvatarProfileStats {
  total_messages_analyzed?: number
  total_their_messages?: number
  needs_12d_weights?: number[]
  activation_counts?: number[]
  suppressed_counts?: number[]
  core_needs?: number[]
  most_suppressed_needs?: number[]
  dominant_emotional_tones?: string[]
  generated_persona_description?: string
  avg_sentence_len?: number
  exclamation_ratio?: number
  question_ratio?: number
  ellipsis_ratio?: number
  co_occurrence_matrix?: number[][]
  speech_style_signature?: any
}

export interface AvatarListItem {
  avatar_id: string
  name: string
  avatar_emoji?: string
  relationship?: string
  core_needs?: string[]
  total_messages?: number
  created_at?: number
  updated_at?: number
  short_desc?: string
}

export interface AvatarDetailResponse {
  success: boolean
  avatar?: {
    avatar_id: string
    persona: AvatarPersona
    profile_stats?: AvatarProfileStats
    current_need_state?: number[]
    conversation_history?: Array<{ role: string; text: string; mood?: string; tier?: string }>
    dpu_snapshots?: Array<{
      text: string
      is_me: boolean
      need_state: number[]
      emotional_tone?: string
      top_need_ids?: number[]
    }>
  }
  error?: string
}

export interface AvatarCreateResponse {
  success: boolean
  avatar_id: string
  message?: string
  profile_stats?: AvatarProfileStats
  error?: string
}

export interface AvatarListResponse {
  success: boolean
  avatars: AvatarListItem[]
}

export interface AvatarChatResponse {
  success: boolean
  reply: string
  new_needs_state: number[]
  activated_needs?: number[]
  suppressed_needs?: number[]
  mood?: string
  dpu_comment?: string
  reply_source?: string
  tier?: string
  error?: string
}

export interface InsightTimelineItem {
  index: number
  messages: number
  top_need: string
  avg_state: number[]
  total_activation: number
  sample_text: string
}

export interface InsightQuoteItem {
  text: string
  emotional_tone: string
  top_need: string
  total_activation: number
}

export interface AvatarInsightResponse {
  success: boolean
  profile?: AvatarProfileStats
  need_names?: string[]
  timeline?: InsightTimelineItem[]
  top_quotes?: InsightQuoteItem[]
  error?: string
}

// ===== 消息格式 =====
export interface RawMessage {
  text: string
  is_me?: boolean // is_me=false 表示"TA说的话"（进入 TA 的画像）；is_me=true 表示用户自己说的
  timestamp_ms?: number
}

// ===== API 根路径 =====
// 本地开发: /api
// Vercel 部署: 相对路径，Vercel 会自动代理到 Railway 后端
export const API_BASE = import.meta.env.VITE_API_URL || '/api'

/**
 * 从 localStorage 读取用户在 /models 页面保存的 LLM 配置，
 * 塞到请求头里传给后端。这样后端能直接用前端用户自己配的 Key。
 */
export function getLlmHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('dpu_llm_config_v1')
    if (!raw) return {}
    const cfg = JSON.parse(raw) as {
      provider?: string
      apiKey?: string
      baseUrl?: string
      modelName?: string
    }
    const headers: Record<string, string> = {}
    if (cfg.provider && cfg.provider !== 'offline') {
      const providerMap: Record<string, string> = {
        qwen: 'tongyi',
        deepseek: 'deepseek',
        kimi: 'deepseek',
        openai: 'deepseek',
        ollama: 'ollama',
      }
      if (cfg.provider === 'claude') {
        console.warn('[dpuApi] Claude 暂不支持学习导师功能，将使用 Demo 模式')
        return {}
      }
      headers['X-LLM-Provider'] = providerMap[cfg.provider] || cfg.provider
    }
    if (cfg.apiKey) headers['X-LLM-Api-Key'] = cfg.apiKey
    if (cfg.baseUrl) headers['X-LLM-Base-Url'] = cfg.baseUrl
    if (cfg.modelName) headers['X-LLM-Model'] = cfg.modelName
    return headers
  } catch {
    return {}
  }
}

async function post<T>(path: string, body: any): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getLlmHeaders(),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  }
  return (await res.json()) as T
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(API_BASE + path)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  return (await res.json()) as T
}

// ===== 1. 文本分析 =====
export async function analyzeDemands(text: string): Promise<AnalyzeResponse> {
  return post<AnalyzeResponse>('/analyze/demands', { text })
}

// ===== 1b. 基于 DPU 分析结果追问 AI =====
export async function askAI(
  text: string,
  activation12: number[],
  question: string,
  topNeeds?: string[],
  suppressed?: string[],
  conflicts?: string[],
  signals?: string[]
): Promise<AskResponse> {
  return post<AskResponse>('/analyze/ask', {
    text,
    activation12,
    top_needs: topNeeds,
    suppressed,
    conflicts,
    signals,
    question,
  })
}

// ===== 2. 分身管理 =====
export async function createAvatar(persona: AvatarPersona, messages?: RawMessage[]): Promise<AvatarCreateResponse> {
  return post<AvatarCreateResponse>('/avatar/create', { persona, messages: messages || [] })
}

export async function appendMessages(avatar_id: string, messages: RawMessage[]): Promise<AvatarCreateResponse> {
  return post<AvatarCreateResponse>('/avatar/append', { avatar_id, messages })
}

export async function listAvatars(): Promise<AvatarListResponse> {
  return get<AvatarListResponse>('/avatar/list')
}

export async function getAvatarDetail(avatar_id: string): Promise<AvatarDetailResponse> {
  return get<AvatarDetailResponse>(`/avatar/${avatar_id}`)
}

export async function getAvatarInsight(avatar_id: string): Promise<AvatarInsightResponse> {
  return get<AvatarInsightResponse>(`/avatar/${avatar_id}/insight`)
}

// ===== 2b. L2 时间维度 —— 把分析结果追加到人物档案 =====
export async function appendActivation(
  avatar_id: string,
  activation12: number[],
  text: string,
  signals?: string[],
  top_needs?: string[]
): Promise<{
  success: boolean
  avatar_id: string
  snapshot_saved: boolean
  total_their_messages: number
  top_needs_now: string[]
  error?: string
}> {
  return post<any>(`/avatar/${avatar_id}/append-activation`, {
    activation12,
    text,
    signals,
    top_needs,
  })
}

// ===== 2c. L2 需求轨迹仪表盘 =====
export interface TrajectoryResponse {
  success: boolean
  need_names: string[]
  trajectory_points: {
    timestamp: number
    bucket_label: string
    need_state: number[]
    dominant_need: string
    dominant_value: number
    messages_in_point: number
  }[]
  trends: Record<string, {
    need_id: number
    first_value: number
    last_value: number
    change: number
    trend: string
    trend_cn: string
  }>
  current_layer: {
    layer: number
    layer_name: string
    layer_activation: number[]
    is_transitioning: boolean
    from_layer?: number
    from_layer_name?: string
    current_12d: number[]
  }
  suppressed_long_term: {
    need_id: number
    need_name: string
    early_value: number
    recent_value: number
  }[]
  ai_insight: string
  first_timestamp?: number
  last_timestamp?: number
  total_days: number
  total_snapshots: number
  avatar_name: string
  error?: string
}

export async function getTrajectory(avatar_id: string): Promise<TrajectoryResponse> {
  return get<TrajectoryResponse>(`/avatar/${avatar_id}/trajectory`)
}

export async function deleteAvatar(avatar_id: string): Promise<{ success: boolean; message?: string }> {
  const res = await fetch(API_BASE + `/avatar/${avatar_id}`, { method: 'DELETE' })
  return (await res.json()) as { success: boolean; message?: string }
}

// ===== 3. 对话 =====
export async function chatWithAvatar(
  avatar_id: string,
  user_input: string,
  needs_state?: number[],
  round_number: number = 1,
): Promise<AvatarChatResponse> {
  return post<AvatarChatResponse>('/avatar/chat', {
    avatar_id,
    user_input,
    needs_state: needs_state || undefined,
    round_number,
  })
}

// ===== 辅助工具：从 demand_ranking 抽取 12 维浮点数（给 NeedSphere 用）
// 后端返回的 ranking 含 need_id 字段（0~11），我们用 need_id 直接索引
export function extractNeeds12FromRanking(ranking?: Array<{ need_id?: number; need?: string; potential?: number }>): number[] {
  const result = new Array(12).fill(0)
  if (!ranking || ranking.length === 0) return result
  for (const item of ranking) {
    if (item.need_id !== undefined && item.need_id >= 0 && item.need_id < 12) {
      // 用 need_id 直接索引（优先方案——最可靠）
      result[item.need_id] = Math.max(result[item.need_id], Math.min(1.0, item.potential ?? 0))
    } else if (item.need) {
      // 回退：字符串匹配（后端老版本可能没有返回 need_id）
      for (let i = 0; i < NEED_NAMES_CN.length; i++) {
        if (item.need.includes(NEED_NAMES_CN[i]) || NEED_NAMES_CN[i].includes(item.need)) {
          result[i] = Math.max(result[i], Math.min(1.0, item.potential ?? 0))
          break
        }
      }
    }
  }
  return result
}

// ===== 辅助工具：从 12 维权重 → Top 排名 =====
export function rankNeeds(state: number[]): Array<{ id: number; name: string; value: number }> {
  return state
    .map((v, i) => ({ id: i, name: NEED_NAMES_CN[i], value: v }))
    .sort((a, b) => b.value - a.value)
}

// ===== 4. PathTracer —— "那根线" =====

export interface PathNodeData {
  need_id: number
  need_name: string
  value: number
  node_type: 'root' | 'l1' | 'l2' | 'conflict'
  source: string
  layer: number
}

export interface PathEdgeData {
  from_id: number
  to_id: number
  from_name: string
  to_name: string
  correlation: number
  propagated_value: number
  edge_type: 'activation' | 'suppression' | 'conflict'
  is_user_modified: boolean
}

export interface ConflictPairData {
  need_a: number
  need_b: number
  need_a_name: string
  need_b_name: string
  correlation: number
}

export interface TracePathResponse {
  success: boolean
  path: {
    source_text: string
    nodes: PathNodeData[]
    edges: PathEdgeData[]
    root_nodes: number[]
    conflict_pairs: ConflictPairData[]
  }
  activation12?: number[]
  source_text?: string
  error?: string
}

export interface TraceFeedbackResponse {
  success: boolean
  message?: string
  error?: string
}

export async function tracePath(text: string): Promise<TracePathResponse> {
  return post<TracePathResponse>('/analyze/trace', { text })
}

export async function sendTraceFeedback(
  from_id: number,
  to_id: number,
  is_correct: boolean,
): Promise<TraceFeedbackResponse> {
  return post<TraceFeedbackResponse>('/analyze/trace/feedback', { from_id, to_id, is_correct })
}
