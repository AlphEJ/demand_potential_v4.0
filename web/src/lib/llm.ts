// DPU LLM 多模型接入层 - 支持千问/DeepSeek/Kimi/OpenAI/Claude 等
import { NEED_NAMES, NEED_LAYERS, LEVEL_WEIGHTS, KEYWORDS } from './needs-const'
export type ModelProvider =
  | 'qwen'
  | 'deepseek'
  | 'kimi'
  | 'openai'
  | 'claude'
  | 'ollama'
  | 'offline' // 纯 DPU 算法（不需要 API Key）
export interface ModelConfig {
  provider: ModelProvider
  apiKey: string
  baseUrl?: string
  modelName?: string
  visionModelName?: string // 用于图片识别（如 qwen-vl-max, gpt-4o 等）
}
const STORAGE_KEY = 'dpu_llm_config_v1'
const DEFAULT_CONFIG: ModelConfig = { provider: 'offline', apiKey: '' }
export const PROVIDER_INFO: Record<ModelProvider, {
  label: string
  desc: string
  defaultBase: string
  defaultModel: string
  defaultVisionModel: string
  docs: string
}> = {
  offline: {
    label: '纯 DPU 算法（默认，无需 Key）',
    desc: '离线关键词匹配 + 势能引擎，快速可用',
    defaultBase: '',
    defaultModel: '',
    defaultVisionModel: '',
    docs: '',
  },
  qwen: {
    label: '阿里 千问（Qwen）',
    desc: 'dashscope.aliyuncs.com',
    defaultBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    defaultVisionModel: 'qwen-vl-max',
    docs: 'https://help.aliyun.com/zh/model-studio/',
  },
  deepseek: {
    label: 'DeepSeek',
    desc: 'api.deepseek.com',
    defaultBase: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    defaultVisionModel: 'deepseek-chat',
    docs: 'https://api-docs.deepseek.com/',
  },
  kimi: {
    label: '月之暗面 Kimi',
    desc: 'api.moonshot.cn',
    defaultBase: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    defaultVisionModel: 'moonshot-v1-8k',
    docs: 'https://platform.moonshot.cn/',
  },
  openai: {
    label: 'OpenAI（GPT）',
    desc: 'api.openai.com',
    defaultBase: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    defaultVisionModel: 'gpt-4o-mini',
    docs: 'https://platform.openai.com/',
  },
  claude: {
    label: 'Anthropic Claude',
    desc: 'api.anthropic.com',
    defaultBase: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-haiku-20240307',
    defaultVisionModel: 'claude-3-haiku-20240307',
    docs: 'https://console.anthropic.com/',
  },
  ollama: {
    label: '本地 Ollama',
    desc: '本地部署的开源大模型',
    defaultBase: 'http://localhost:11434/v1',
    defaultModel: 'llama3',
    defaultVisionModel: 'llama3',
    docs: 'https://ollama.com/',
  },
}
// ---------- 配置存储 ----------
export function saveModelConfig(config: ModelConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  }
  catch {}
}
export function loadModelConfig(): ModelConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw)
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  }
  catch {}
  return { ...DEFAULT_CONFIG }
}
export function clearModelConfig() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  }
  catch {}
}
// ---------- LLM 语义抽取核心 ----------
export interface ExtractedNeed {
  need_id: number
  need_name: string
  strength: number // 0 ~ 1
  confidence: number // 0 ~ 1 置信度
  reason: string // 简短描述：为什么命中这个需求
  is_hidden?: boolean // 是否为隐性/深层需求
}
export interface ExtractionResult {
  method: 'llm' | 'keywords'
  surface_needs: ExtractedNeed[]
  hidden_needs: ExtractedNeed[]
  conflicts: {
    a: number
    b: number
    desc: string
  }[]
  emotional_tone: '焦虑' | '迷茫' | '矛盾' | '渴望' | '平静' | '低落' | '兴奋' | '其他'
  summary: string
  raw_keyword_scores: number[] // 备用：纯关键词方法的分数
}
// 12 需求完整描述（给 LLM 用）
const NEEDS_PROMPT_LINES = NEED_NAMES.map((name, i) => {
  return `${i + 1}.【${name}】${getNeedFullDesc(i)}（层级=${NEED_LAYERS[i]}，关键词=${KEYWORDS[i].slice(0, 4).join('/')}）`
}).join('\n')
function getNeedFullDesc(id: number): string {
  const descriptions = [
    '身体消耗、疲劳、健康、饮食、睡眠、生理不适',
    '工作稳定、收入、存款、风险恐惧、安全保障、经济压力',
    '朋友关系、孤独感、被接纳、社交参与、归属感',
    '爱情、亲密关系、被关心、温暖陪伴、心灵慰藉',
    '面子、地位、被尊重、成就认可、攀比、自尊心',
    '学习渴望、知识获取、技能提升、好奇心、职业发展',
    '艺术体验、品味、美感、生活品质、审美追求',
    '梦想、理想、人生意义、自我突破、价值实现、使命',
    '自由选择、不想被束缚、独立掌控、逃离约束',
    '公平对待、正义、权益、不合理规则、被压榨感',
    '成长进步、自律习惯、变强、突破舒适圈',
    '生活秩序、时间管理、条理、规划、避免混乱',
  ]
  return descriptions[id]
}
// ---------- 纯关键词 fallback ----------
function keywordExtract(text: string): ExtractionResult {
  const lower = text.toLowerCase()
  const scores: number[] = new Array(12).fill(0)
  const matchedKeywords: string[][] = new Array(12).fill(null).map(() => [])
  for (let i = 0; i < 12; i++) {
    for (const kw of KEYWORDS[i]) {
      if (lower.includes(kw)) {
        scores[i] += 1
        matchedKeywords[i].push(kw)
      }
    }
  }
  const max = Math.max(...scores, 1)
  // 归一化，加上一点基线噪声防止全 0
  const surface: ExtractedNeed[] = []
  scores.forEach((s, i) => {
    if (s > 0) {
      const normalized = Math.min(1, (s / max) * 0.7 + 0.15)
      surface.push({
        need_id: i,
        need_name: NEED_NAMES[i],
        strength: normalized,
        confidence: Math.min(1, s * 0.25 + 0.4),
        reason: matchedKeywords[i].length > 0
          ? `匹配到：${matchedKeywords[i].slice(0, 3).join('、')}`
          : `检测到「${NEED_NAMES[i]}」相关信号`,
      })
    }
  })
  surface.sort((a, b) => b.strength - a.strength)
  return {
    method: 'keywords',
    surface_needs: surface,
    hidden_needs: [],
    conflicts: [],
    emotional_tone: '其他',
    summary: '基于关键词匹配分析',
    raw_keyword_scores: scores,
  }
}
// ---------- LLM 抽取 ----------
function buildPrompt(text: string): string {
  return `你是一个心理学需求分析助手。请分析下面这段用户文本，识别用户的需求结构。

【12 维需求体系参考】
${NEEDS_PROMPT_LINES}

【用户文本】
${text}

【输出要求】
请输出严格的 JSON，不要任何额外文字。JSON 结构：
{
  "surface_needs": [{"need_id": 0~11, "strength": 0~1, "confidence": 0~1, "reason": "一句话"}],
  "hidden_needs": [{"need_id": 0~11, "strength": 0~1, "confidence": 0~1, "reason": "一句话说明为什么这是隐性需求"}],
  "conflicts": [{"a": need_id, "b": need_id, "desc": "为什么这两个需求矛盾"}],
  "emotional_tone": "焦虑|迷茫|矛盾|渴望|平静|低落|兴奋|其他",
  "summary": "一句话概括用户的核心困境或渴望（不超过50字）"
}

说明：
- strength 表示该需求的潜在激活强度，不要全部设 0.8
- 不要输出不存在的字段
- 任何时候都只返回 JSON`
}
function safeParseJSON(text: string): any {
  // 尝试去掉 ```json ... ``` 包裹
  let cleaned = text.trim()
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch)
    cleaned = fenceMatch[1]
  // 找到第一个 { 和最后一个 }
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) {
    cleaned = cleaned.slice(start, end + 1)
  }
  try {
    return JSON.parse(cleaned)
  }
  catch {
    return null
  }
}
async function callOpenAICompat(config: ModelConfig, userMsg: string, systemMsg: string, maxTokens = 800): Promise<string> {
  const url = `${config.baseUrl}/chat/completions`
  const body: any = {
    model: config.modelName || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemMsg },
      { role: 'user', content: userMsg },
    ],
    max_tokens: maxTokens,
    temperature: 0.3,
  }
  // Claude 的 messages API 略有不同，但 OpenAI 兼容模式通常可统一
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
      ...(config.provider === 'claude' ? { 'anthropic-version': '2023-06-01' } : {}),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`API 调用失败 (${res.status}): ${errText || res.statusText}`)
  }
  const data = await res.json()
  return data?.choices?.[0]?.message?.content || ''
}

// ---------- 视觉模型：从截图提取对话 ----------
export async function extractDialogueFromImage(base64Image: string, config?: ModelConfig): Promise<string> {
  const cfg = config || loadModelConfig()
  if (cfg.provider === 'offline' || !cfg.apiKey) {
    return '（当前未配置大模型，无法进行图片识别。请在"模型配置"页面填入 API Key，或直接手动粘贴对话内容。）'
  }
  const systemPrompt = '你是一个聊天截图识别助手。请从截图中提取所有对话内容，包括文字、表情包、图片、语音等。\n\n输出规则：\n1. 文字消息：角色名：内容\n2. 表情包：角色名：（表情描述，如 墨镜表情/得意表情/哭泣表情）\n3. 图片消息：角色名：（图片：描述图片内容，如 王者荣耀战绩截图显示王者段位/美食照片显示精致摆盘/奢侈品照片显示手表）\n4. 语音消息：角色名：（语音X秒）\n5. 其他类型：角色名：（类型描述）\n\n注意：\n- 左边气泡和右边气泡的说话人必须区分开\n- 对于图片，尽可能详细描述图片里的关键信息（如游戏战绩数据、品牌logo、场景等）\n- 保持时间顺序，不要遗漏任何消息'
  const userPrompt = '请从这张聊天截图中提取所有对话内容，按时间顺序一行一条。\n\n输出格式：\n角色名：内容\n角色名：（表情描述）\n角色名：（图片：图片内容描述）\n\n要求：\n1. 文字消息保持原话，不要改写\n2. 左边气泡和右边气泡的说话人必须区分开\n3. 表情包用中文括号标注，如（墨镜表情）、（得意表情）\n4. 图片消息必须描述图片里的关键内容，如（图片：王者荣耀战绩截图，显示王者段位，战绩12/3/5）\n5. 语音消息标注时长，如（语音15秒）\n6. 不要遗漏任何消息，包括图片和表情'

  try {
    const url = `${cfg.baseUrl}/chat/completions`
    // 构造多模态消息：文本 + 图片
    // base64Image 已经是 "data:image/xxx;base64,xxxx" 格式
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          { type: 'image_url', image_url: { url: base64Image } },
        ],
      },
    ]
    // 优先用用户配置的视觉模型，否则用默认值
    const visionModel = cfg.visionModelName || PROVIDER_INFO[cfg.provider].defaultVisionModel || 'qwen-vl-max'
    const body = {
      model: visionModel,
      messages,
      max_tokens: 3000,
      temperature: 0.1,
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`,
        ...(cfg.provider === 'claude' ? { 'anthropic-version': '2023-06-01' } : {}),
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`视觉模型调用失败 (${res.status}): ${errText || res.statusText}`)
    }
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content || ''
    if (!content.trim()) {
      throw new Error('视觉模型返回内容为空，可能图片不清晰或模型无法识别')
    }
    return content
  }
  catch (err: any) {
    const msg = err?.message || '未知错误'
    console.error('[llm] extractDialogueFromImage failed:', msg)
    return `（图片识别失败：${msg}。请检查：1) 是否在"模型配置"页面填入了 API Key 2) 是否选择了支持图片识别的模型（推荐：qwen-vl-max / gpt-4o-mini）3) 图片是否清晰可读）`
  }
}
async function extractWithLLM(text: string, config: ModelConfig): Promise<ExtractionResult> {
  const systemPrompt = '你是一个心理学需求分析专家，严格按用户的 JSON 格式要求输出。'
  const userPrompt = buildPrompt(text)
  const raw = await callOpenAICompat(config, userPrompt, systemPrompt, 1000)
  const parsed = safeParseJSON(raw)
  if (!parsed)
    throw new Error('LLM 输出不是合法 JSON')
  const normalize = (arr: any[]): ExtractedNeed[] => {
    if (!Array.isArray(arr))
      return []
    return arr
      .filter(x => typeof x.need_id === 'number' && x.need_id >= 0 && x.need_id < 12)
      .map(x => ({
      need_id: x.need_id,
      need_name: NEED_NAMES[x.need_id],
      strength: Math.max(0, Math.min(1, Number(x.strength) || 0.3)),
      confidence: Math.max(0, Math.min(1, Number(x.confidence) || 0.5)),
      reason: String(x.reason || ''),
      is_hidden: false,
    }))
  }
  const surface = normalize(parsed.surface_needs || [])
  const hidden = (normalize(parsed.hidden_needs || [])).map(h => ({ ...h, is_hidden: true as const }))
  const conflicts: { a: number; b: number; desc: string }[] = Array.isArray(parsed.conflicts)
    ? (parsed.conflicts as any[])
        .map((c: any) => ({ a: c.a, b: c.b, desc: String(c.desc || '') }))
        .filter((c: any) => typeof c.a === 'number' && typeof c.b === 'number')
    : []
  return {
    method: 'llm',
    surface_needs: surface,
    hidden_needs: hidden,
    conflicts,
    emotional_tone: (parsed.emotional_tone as any) || '其他',
    summary: String(parsed.summary || ''),
    raw_keyword_scores: [],
  }
}
// ---------- 对外主接口 ----------
export async function analyzeWithModel(text: string, config?: ModelConfig): Promise<ExtractionResult> {
  const cfg = config || loadModelConfig()
  // 无 Key 或 offline 时，走关键词方法
  if (cfg.provider === 'offline' || !cfg.apiKey) {
    return keywordExtract(text)
  }
  try {
    return await extractWithLLM(text, cfg)
  }
  catch (err: any) {
    // LLM 失败时回退到关键词方法
    console.warn('[DPU LLM] 语义分析失败，回退关键词方法：', err?.message)
    const fallback = keywordExtract(text)
    fallback.summary = `（LLM 调用失败，已回退关键词分析。原因：${err?.message || '未知错误'}）`
    return fallback
  }
}
// ---------- LLM 对话（用于回答生成）----------
export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}
export async function chatWithModel(userText: string, history: ChatTurn[] = [], config?: ModelConfig, maxTokens = 2000, systemPromptOverride?: string): Promise<string> {
  const cfg = config || loadModelConfig()
  if (cfg.provider === 'offline' || !cfg.apiKey) {
    return '（当前未配置大模型，使用纯 DPU 算法模式。请在"模型配置"页面填入 API Key 以获得更智能的回答。）'
  }
  const defaultSystemPrompt = `你是一个基于"12维需求体系"的对话助手。你擅长理解用户的隐性需求，而不是直接给建议。先共情，再洞察，最后给出温和的行动方向。
需求体系：生理生存、安全稳定、社交归属、情感陪伴、尊重认可、认知求知、审美价值、自我实现、自由掌控、公平公正、成长进阶、秩序规整。`
  const finalSystemPrompt = systemPromptOverride && systemPromptOverride.trim().length > 10 ? systemPromptOverride : defaultSystemPrompt
  const messages = [...history.map(h => ({ role: h.role, content: h.content })), { role: 'user' as const, content: userText }]
  try {
    const url = `${cfg.baseUrl}/chat/completions`
    const body = {
      model: cfg.modelName || 'gpt-4o-mini',
      messages: [{ role: 'system', content: finalSystemPrompt }, ...messages],
      max_tokens: maxTokens,
      temperature: 0.7,
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`,
        ...(cfg.provider === 'claude' ? { 'anthropic-version': '2023-06-01' } : {}),
      },
      body: JSON.stringify(body),
    })
    if (!res.ok)
      throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return data?.choices?.[0]?.message?.content || '（无响应内容）'
  }
  catch (err: any) {
    return `（大模型调用失败：${err?.message || '未知错误'}。请检查 API Key 和网络。）`
  }
}
// ---------- 连通性测试 ----------
export async function testConnection(config: ModelConfig): Promise<{
  ok: boolean
  msg: string
}> {
  if (config.provider === 'offline')
    return { ok: true, msg: '纯 DPU 算法模式（离线可用）' }
  if (!config.apiKey)
    return { ok: false, msg: 'API Key 为空' }
  try {
    const url = `${config.baseUrl}/chat/completions`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        ...(config.provider === 'claude' ? { 'anthropic-version': '2023-06-01' } : {}),
      },
      body: JSON.stringify({
        model: config.modelName || 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
      }),
    })
    if (res.ok)
      return { ok: true, msg: '✓ 连通成功' }
    const text = await res.text().catch(() => '')
    return { ok: false, msg: `✗ HTTP ${res.status}：${text.slice(0, 120)}` }
  }
  catch (err: any) {
    return { ok: false, msg: `✗ 调用失败：${err?.message || '网络问题'}` }
  }
}
// ---------- 辅助数据 ----------
export { NEED_NAMES, NEED_LAYERS, LEVEL_WEIGHTS, KEYWORDS }
