import { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send,
  Bot,
  User,
  Sparkles,
  Radar,
  Flame,
  Brain,
  TrendingUp,
  BookOpen,
  Zap,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Network,
  GitBranch,
  LineChart,
  Layers,
  RotateCcw,
  Settings,
  Plus,
  Copy,
  RefreshCw,
  Trash2,
  Mic,
  MicOff,
  Menu,
  MessageSquare,
  Maximize2,
} from 'lucide-react'
import ReactECharts from 'echarts-for-react'
import {
  NEED_NAMES,
  NEED_LAYERS,
  LEVEL_WEIGHTS,
  analyzeText,
  getProfile,
  saveProfile,
  addEntry,
  buildMemoryEntry,
  updateProfileWithEntry,
  resetAllMemory,
  saveMessagesToStorage,
  loadMessagesFromStorage,
  clearMessagesStorage,
  type UserProfile,
} from '../lib/api'
import { analyzeWithModel, chatWithModel, loadModelConfig } from '../lib/llm'
import { useLlmStatus, LlmStatusBadge } from '@/components/LlmStatusBadge'
import type { ExtendedAnalysis } from '@/types'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  demands?: ExtendedAnalysis
  timestamp: number
  method_label?: string
  tone?: string
  summary?: string
}

interface Conversation {
  id: string
  title: string
  messages: Message[]
  created_at: number
}

const CONVERSATION_STORAGE_KEY = 'dpu_agent_conversations_v1'
const CURRENT_ID_KEY = 'dpu_agent_current_id_v1'

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(CONVERSATION_STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    if (Array.isArray(data)) return data as Conversation[]
    return []
  } catch {
    return []
  }
}

function saveConversations(conversations: Conversation[]) {
  try {
    localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify(conversations))
  } catch {}
}

function loadCurrentConversationId(): string | null {
  return localStorage.getItem(CURRENT_ID_KEY)
}

function saveCurrentConversationId(id: string) {
  try {
    localStorage.setItem(CURRENT_ID_KEY, id)
  } catch {}
}

function createConversation(): Conversation {
  return {
    id: Date.now().toString(),
    title: '新对话',
    messages: [],
    created_at: Date.now(),
  }
}

type TabKey = 'radar' | 'matrix' | 'network' | 'decision' | 'timeline' | 'formula'

const TABS: { key: TabKey; label: string; icon: React.ElementType; desc: string }[] = [
  { key: 'radar', label: '12维雷达', icon: Radar, desc: '需求全景画像' },
  { key: 'matrix', label: '注意力矩阵', icon: Flame, desc: 'v4.2 动态注意力加权' },
  { key: 'network', label: '冲突网络', icon: Network, desc: '层级压制关系图' },
  { key: 'decision', label: '决策路径', icon: GitBranch, desc: 'LLM+DPU 协同决策' },
  { key: 'timeline', label: '需求走势', icon: TrendingUp, desc: '对话中需求变化趋势' },
  { key: 'formula', label: '公式原理', icon: BookOpen, desc: 'v4.2 核心算法说明' },
]

const NEED_COLORS_RGB: string[] = [
  '#3B82F6', '#0EA5E9', '#8B5CF6', '#EC4899', '#F59E0B',
  '#14B8A6', '#F97316', '#84CC16', '#06B6D4', '#6366F1',
  '#22C55E', '#A855F7',
]

const LAYER_LABELS = ['生理层', '安全层', '社交层', '尊重层', '自我实现层']
const SAMPLE_INPUTS = [
  '我最近工作很累，每天加班到很晚，感觉身体吃不消。但是我又很担心如果松懈下来，会被别人超越，影响我的职业发展。',
  '想辞职去追求梦想，但又怕万一失败了怎么办，家里人也不支持。',
  '同事总是抢我的功劳，领导也不尊重我，但我又不想吵架，忍得好难受。',
  '每天下班精疲力尽，一个人在家很孤独，想学习但学不进去。',
]

export function AgentPage() {
  const { status: llmStatus, refresh: refreshLlmStatus } = useLlmStatus()
  // ---------- 多会话管理 ----------
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentId, setCurrentId] = useState<string>('')
  // 当前会话的消息（从 conversations 里取）
  const currentConv = useMemo(
    () => conversations.find(c => c.id === currentId) || conversations[0] || null,
    [conversations, currentId],
  )
  const messages = currentConv?.messages || []

  // ---------- UI 状态 ----------
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('radar')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const newConvCounter = useRef(conversations.length + 1)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [llmConfig, setLlmConfig] = useState<{ provider: string; hasKey: boolean }>({ provider: 'offline', hasKey: false })
  // 语音输入状态
  const [isListening, setIsListening] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const speechRecRef = useRef<any>(null)
  // 抽屉状态
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const toggleDrawer = () => setIsDrawerOpen(prev => !prev)
  // 图表全屏弹窗状态
  const [isChartModalOpen, setIsChartModalOpen] = useState(false)
  // 对话全屏弹窗状态
  const [isDialogModalOpen, setIsDialogModalOpen] = useState(false)

  // ------- 初始化：加载记忆 + 模型配置 + 多会话 + 迁移旧 messages -------
  useEffect(() => {
    (async () => {
      const p = await getProfile()
      setProfile(p)
      const cfg = loadModelConfig()
      setLlmConfig({ provider: cfg.provider, hasKey: !!cfg.apiKey })

      // 1. 先试加载新的多会话格式
      let convs = loadConversations()
      // 2. 如果没有多会话数据，从旧版 messages storage 迁移过来
      if (convs.length === 0) {
        const oldMessages = loadMessagesFromStorage()
        if (oldMessages.length > 0) {
          const migrated: Conversation = {
            id: Date.now().toString(),
            title: '历史对话',
            messages: oldMessages as Message[],
            created_at: Date.now(),
          }
          convs = [migrated]
          saveConversations(convs)
        }
      }
      // 3. 如果还没有，创建一个新的空会话
      if (convs.length === 0) {
        convs = [createConversation()]
        saveConversations(convs)
      }
      setConversations(convs)
      const savedId = loadCurrentConversationId()
      const effectiveId = savedId && convs.some(c => c.id === savedId) ? savedId : convs[0].id
      setCurrentId(effectiveId)
      saveCurrentConversationId(effectiveId)
    })()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ------- 多会话变化时自动存到 localStorage -------
  useEffect(() => {
    if (conversations.length > 0) {
      saveConversations(conversations)
    }
  }, [conversations])

  useEffect(() => {
    if (currentId) {
      saveCurrentConversationId(currentId)
    }
  }, [currentId])

  // ------- 操作：更新当前会话 messages -------
  const updateCurrentMessages = (updater: (old: Message[]) => Message[]) => {
    if (!currentConv) return
    setConversations(prev =>
      prev.map(c => (c.id === currentConv.id ? { ...c, messages: updater(c.messages) } : c)),
    )
  }

  // ------- 操作：更新当前会话 title -------
  const updateCurrentTitle = (title: string) => {
    if (!currentConv) return
    setConversations(prev => prev.map(c => (c.id === currentConv.id ? { ...c, title } : c)))
  }

  // ------- 操作：新建对话 -------
  const handleNewConversation = () => {
    const c = newConvCounter.current++
    const conv = createConversation()
    conv.title = `新对话 ${c}`
    setConversations(prev => [conv, ...prev])
    setCurrentId(conv.id)
    setInput('')
  }

  // ------- 操作：清空当前对话 -------
  const handleClearCurrent = () => {
    if (!currentConv) return
    updateCurrentMessages(() => [])
    setInput('')
  }

  // ------- 操作：删除会话 -------
  const handleDeleteConversation = (id: string) => {
    if (conversations.length <= 1) {
      // 如果只剩一个，删除后重置为新的空会话
      const newConv = createConversation()
      setConversations([newConv])
      setCurrentId(newConv.id)
      return
    }
    const rest = conversations.filter(c => c.id !== id)
    setConversations(rest)
    if (id === currentId) {
      setCurrentId(rest[0].id)
    }
  }

  // ------- 操作：重置所有对话 & 记忆 -------
  const handleReset = async () => {
    await resetAllMemory()
    clearMessagesStorage()
    const p = await getProfile()
    setProfile(p)
    const newConv = createConversation()
    setConversations([newConv])
    setCurrentId(newConv.id)
  }

  // ------- 操作：复制消息文字 -------
  const copyMessageText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // 不支持 clipboard API 的降级
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
    }
  }

  // ------- 操作：删除单条消息（用户和 AI 的一对） -------
  const deleteMessagePair = (msgId: string) => {
    if (!currentConv) return
    updateCurrentMessages(prev => {
      const idx = prev.findIndex(m => m.id === msgId)
      if (idx < 0) return prev
      // 如果是用户消息，同时删掉它后面跟着的 AI 回复
      // 如果是 AI 消息，只删它自己
      const toRemove = new Set<string>()
      const msg = prev[idx]
      toRemove.add(msg.id)
      if (msg.role === 'user' && idx + 1 < prev.length && prev[idx + 1].role === 'assistant') {
        toRemove.add(prev[idx + 1].id)
      }
      return prev.filter(m => !toRemove.has(m.id))
    })
  }

  // ------- 语音输入：Web Speech API -------
  const toggleVoiceInput = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      alert('你的浏览器不支持语音识别。推荐使用 Chrome 或 Edge。')
      return
    }
    if (isListening) {
      speechRecRef.current?.stop?.()
      setIsListening(false)
      return
    }
    try {
      const rec = new SR()
      rec.lang = 'zh-CN'
      rec.continuous = true
      rec.interimResults = true
      rec.onresult = (e: any) => {
        let finalText = ''
        let interimText = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]
          if (r.isFinal) finalText += r[0].transcript
          else interimText += r[0].transcript
        }
        if (finalText) {
          setInput(prev => prev + (prev && !prev.endsWith(' ') && !prev.endsWith('\n') ? '' : '') + finalText)
          setVoiceTranscript('')
        } else if (interimText) {
          setVoiceTranscript(interimText)
        }
      }
      rec.onend = () => {
        setIsListening(false)
        setVoiceTranscript('')
      }
      rec.onerror = (e: any) => {
        console.warn('语音识别错误:', e.error)
        setIsListening(false)
      }
      rec.start()
      speechRecRef.current = rec
      setIsListening(true)
    } catch (err) {
      console.warn('启动语音识别失败:', err)
    }
  }

  // 组件卸载时关掉语音
  useEffect(() => {
    return () => {
      speechRecRef.current?.stop?.()
    }
  }, [])

  // ESC 关闭弹窗
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isChartModalOpen) setIsChartModalOpen(false)
        if (isDialogModalOpen) setIsDialogModalOpen(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isChartModalOpen, isDialogModalOpen])

  // ------- 取最新分析结果 -------
  const latestAnalysis = useMemo(() => {
    const m = [...messages].reverse().find(msg => msg.demands)
    return m?.demands
  }, [messages])

  const activeNeeds = useMemo(
    () => latestAnalysis?.demand_ranking.filter(r => r.potential > 0.2).map(r => r.need_id) || [],
    [latestAnalysis],
  )

  // ------- 发送消息 -------
  const handleSend = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || isTyping) return
    setInput('')
    setIsTyping(true)

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    updateCurrentMessages(prev => [...prev, userMsg])

    // 上下文：最近消息中的需求 id
    const contextIds = messages
      .flatMap(m => m.demands?.demand_ranking.filter(r => r.potential > 0.3).map(r => r.need_id) || [])
      .slice(-12)

    let result: ExtendedAnalysis | null = null
    try {
      // 1. 先走 LLM 语义抽取（如果有配置）
      let llmExtraction: any = undefined
      if (llmConfig.hasKey && llmConfig.provider !== 'offline') {
        try {
          const r = await analyzeWithModel(content)
          llmExtraction = r
        } catch (e) {
          console.warn('LLM 抽取失败，回退关键词', e)
        }
      }

      // 2. DPU 核心分析
      result = analyzeText(content, {
        contextDemands: contextIds,
        profileWeights: profile?.weights,
        llmExtraction: llmExtraction,
      })

      // 3. 写入记忆
      const entry = buildMemoryEntry({
        text: content,
        ranking: result.demand_ranking.map(r => ({ need_id: r.need_id, potential: r.potential, layer_level: r.layer_level })),
        has_conflict: result.has_conflict,
        conflict_pair: result.conflicts[0] ? [result.conflicts[0].need_a_id ?? 0, result.conflicts[0].need_b_id ?? 0] as [number, number] : undefined,
        emotional_tone: llmExtraction?.emotional_tone || '其他',
        session_id: currentId,
      })
      await addEntry(entry)
      if (profile) {
        const newProfile = updateProfileWithEntry(profile, entry)
        await saveProfile(newProfile)
        setProfile(newProfile)
      }

      // 4. 用 LLM 生成自然语言回复（如果有配置）
      let replyText = generateReply(result, llmExtraction)
      if (llmConfig.hasKey && llmConfig.provider !== 'offline') {
        try {
          const rankingLines = result.demand_ranking.slice(0, 5).map((r, i) =>
            `${i + 1}. ${r.need}（势能 ${r.potential.toFixed(2)}）${r.suppressed ? '[被压制]' : ''}`
          ).join('\n')
          const suppressedLine = result.suppressed.length > 0
            ? `\n被压制的需求：${result.suppressed.join('、')}（它们在排队，不是不重要）`
            : ''
          const conflictLine = result.has_conflict
            ? `\n检测到需求冲突：${result.demand_ranking[0]?.need} vs ${result.demand_ranking[1]?.need}`
            : ''

          const dpuContext = `【DPU v4.2 白盒诊断】
用户输入：${content}
${rankingLines}${conflictLine}${suppressedLine}
算法版本：注意力加权矩阵 + 生存层压制 + 上层主动增益`

          const aiReply = await chatWithModel(
            `你是一个基于 DPU（需求势能引擎）的 AI 顾问。DPU 已经完成了白盒化的需求分析。

${dpuContext}

请用自然语言把以上分析结果传达给用户。要求：
1. 开头直接说 DPU 发现了什么，不要说"我理解你了"
2. 引用具体的需求名称和势能值，体现专业判断
3. 如果存在需求冲突，解释为什么这两个需求在拉扯
4. 给出一个具体的、可执行的行动建议，不要空泛的"相信自己"
5. 整体语气：专业但温暖，像心理咨询师，不是客服机器人
6. 回复控制在 3-5 段，每段不超过 3 句话`,
            [
              ...messages.slice(-4).map(m => ({ role: m.role, content: m.content })),
            ],
          )
          if (aiReply && aiReply.length > 10 && !aiReply.startsWith('（') && !aiReply.startsWith(' (')) {
            replyText = aiReply
          }
        } catch (e) {
          console.warn('LLM 回复失败，用默认回复', e)
        }
      }

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: replyText,
        demands: result,
        timestamp: Date.now(),
        method_label: (result as any).method_label,
        tone: llmExtraction?.emotional_tone,
        summary: llmExtraction?.summary,
      }
      updateCurrentMessages(prev => [...prev, assistantMsg])
    } finally {
      setIsTyping(false)
    }
  }

  // ------- 白盒化输出：DPU 诊断报告（无 LLM / LLM 回退时用）-------
  const generateReply = (result: ExtendedAnalysis, llmResult: any): string => {
    if (!result.demand_ranking.length) {
      return '🔍 DPU 未检测到强烈的需求信号。可能是表达比较含蓄，能否再具体描述一下你现在的感受或处境？'
    }
    const top = result.demand_ranking[0]
    const second = result.demand_ranking[1]
    const activeCount = result.demand_ranking.length
    const suppressedCount = result.suppressed.length

    // 白盒诊断报告
    const lines: string[] = []

    // ── 第一段：发现什么 ──
    lines.push('## 🔍 DPU 诊断报告\n')
    lines.push(`**共识别 ${activeCount} 个活跃需求**，其中${suppressedCount > 0 ? `有 ${suppressedCount} 个被层级压制` : '无层级压制发生'}。\n`)

    // 需求排序（清晰展示，不是模糊的"我理解你了"）
    lines.push('### 需求优先级排序')
    result.demand_ranking.slice(0, 5).forEach((r, i) => {
      const bar = '█'.repeat(Math.round(r.potential * 10))
      const sup = r.suppressed ? ' [被压制]' : ''
      lines.push(`${i + 1}. **${r.need}** ${bar} ${(r.potential * 100).toFixed(0)}%${sup}`)
    })
    lines.push('')

    // ── 第二段：为什么这样排序 ──
    lines.push('### 为什么这样排序？')
    if (top.suppressed) {
      lines.push(`⚠️ 「${top.need}」虽然是最高势能，但被更底层的需求压下去了。你的身体/安全感在喊"先处理我"，而你内心真正在意的被推后了。`)
      lines.push(`这是典型的"心里有事但说不出来"的状态——不是你不重要，是你的生存本能抢了话筒。`)
    } else if (result.has_conflict && second) {
      lines.push(`⚡ 检测到需求冲突：「${top.need}」 和 「${second.need}」相互拉扯。`)
      lines.push(`这不是你优柔寡断——是你的需求结构本身就充满张力。两个都是你真正在乎的，但当前只能二选一。`)
    } else {
      lines.push(`📊 根据 DPU 势能计算（注意力加权矩阵 + 4步公式），「${top.need}」在当前语境下激活最强烈。`)
      if (second) {
        lines.push(`「${second.need}」作为次优先级被同时激活，两者之间存在${result.demand_ranking[0] && result.demand_ranking[1] ? '正向协同' : ''}关系。`)
      }
    }
    lines.push('')

    // ── 第三段：压制情况（透明展示） ──
    if (result.suppressed.length > 0) {
      lines.push('### 被压制的需求')
      lines.push(`以下需求并非不重要，而是被生存/安全层需求暂时推后：`)
      result.suppressed.forEach(name => {
        lines.push(`- ${name}（等待底层需求满足后自然回升）`)
      })
      lines.push('')
    }

    // ── 第四段：行动建议 ──
    lines.push('### 💡 行动建议')
    if (result.has_conflict) {
      lines.push(`**第一步**：先理清「${top.need}」和「${second?.need}」哪个是当前最紧迫的，写完一个再想另一个。`)
      lines.push(`**第二步**：给被选中的需求设定一个具体的小目标。比如如果选${top.need}，今天可以做的一件小事是什么。`)
    } else {
      lines.push(`**聚焦「${top.need}」**：问自己——为这个需求，今天能做的最小一件事是什么？`)
      lines.push(`**留意次优先级**：完成主要目标后，给「${second?.need || '其他需求'}」也留出空间。`)
    }
    if (result.suppressed.length > 0) {
      lines.push(`**关注被压制需求**：当底层压力缓解后，${result.suppressed.join('、')}会自然触底反弹。现在知道它们在排队就好。`)
    }
    lines.push('')
    lines.push('*DPU v4.2 · 注意力加权矩阵 · 可解释白盒判断*')

    return lines.join('\n')
  }

  // ======================== 图表配置 ========================
  const radarOption = useMemo(() => {
    if (!latestAnalysis) return {}
    return {
      tooltip: { trigger: 'item' },
      legend: { data: ['当前势能', '用户画像权重'], bottom: 0, textStyle: { color: '#475569', fontSize: 12 } },
      radar: {
        indicator: NEED_NAMES.map(name => ({ name, max: 1 })),
        shape: 'polygon',
        splitNumber: 4,
        axisName: { color: '#334155', fontSize: 12, fontWeight: 'bold' },
        splitLine: { lineStyle: { color: 'rgba(59,130,246,0.15)' } },
        splitArea: { areaStyle: { color: ['rgba(59,130,246,0.02)', 'rgba(59,130,246,0.05)', 'rgba(59,130,246,0.08)', 'rgba(59,130,246,0.12)'] } },
        axisLine: { lineStyle: { color: 'rgba(59,130,246,0.3)' } },
      },
      series: [{
        name: '需求势能分布',
        type: 'radar',
        data: [
          {
            value: latestAnalysis.radar_data,
            name: '当前势能',
            areaStyle: { color: 'rgba(59,130,246,0.35)' },
            lineStyle: { color: '#3B82F6', width: 2.5 },
            itemStyle: { color: '#3B82F6' },
            symbol: 'circle', symbolSize: 8,
          },
          {
            value: profile?.weights || LEVEL_WEIGHTS.map(w => w * 0.35),
            name: '用户画像权重',
            areaStyle: { color: 'rgba(139,92,246,0.25)' },
            lineStyle: { color: '#8B5CF6', width: 2, type: 'dashed' },
            itemStyle: { color: '#8B5CF6' },
            symbol: 'diamond', symbolSize: 6,
          },
        ],
      }],
    }
  }, [latestAnalysis, profile])

  const barOption = useMemo(() => {
    if (!latestAnalysis) return {}
    const ranking = [...latestAnalysis.demand_ranking]
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '4%', bottom: '3%', top: '3%', containLabel: true },
      xAxis: { type: 'value', max: 1, axisLine: { lineStyle: { color: '#CBD5E1' } }, axisLabel: { color: '#64748B' }, splitLine: { lineStyle: { color: 'rgba(203,213,225,0.4)' } } },
      yAxis: { type: 'category', data: ranking.map(r => r.need).reverse(), axisLine: { lineStyle: { color: '#CBD5E1' } }, axisLabel: { color: '#334155', fontWeight: 'bold' } },
      series: [{
        name: '势能值',
        type: 'bar',
        data: ranking.map((r, i) => ({
          value: r.potential,
          itemStyle: {
            color: r.suppressed
              ? { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: '#F87171' }, { offset: 1, color: '#FCA5A5' }] }
              : { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: NEED_COLORS_RGB[r.need_id] }, { offset: 1, color: '#93C5FD' }] },
            borderRadius: [0, 6, 6, 0],
          },
        })).reverse(),
        label: { show: true, position: 'right', color: '#334155', fontWeight: 'bold', formatter: (p: any) => p.value.toFixed(3) },
      }],
    }
  }, [latestAnalysis])

  const heatmapOption = useMemo(() => {
    if (!latestAnalysis) return {}
    const data: [number, number, number][] = []
    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 12; j++) {
        const staticCorr = latestAnalysis.matrix[i][j]
        // v4.2 注意力加权: C_attn = C_base × (1 + α × √(aᵢ×aⱼ))
        const ai = latestAnalysis.radar_data[i]
        const aj = latestAnalysis.radar_data[j]
        const alpha = 0.5
        const overlap = Math.sqrt(Math.max(0, ai * aj))
        const value = staticCorr * (1 + alpha * overlap)
        data.push([j, i, +Math.min(1.0, value).toFixed(2)])
      }
    }
    return {
      tooltip: {
        position: 'top',
        formatter: (p: any) => {
          const [x, y, v] = p.value
          const sign = v >= 0 ? '协同' : '冲突'
          return `${NEED_NAMES[y]} ↔ ${NEED_NAMES[x]}<br/>${sign}强度: <b>${Math.abs(v).toFixed(2)}</b>`
        },
      },
      grid: { top: 20, left: 110, right: 20, bottom: 100 },
      xAxis: { type: 'category', data: NEED_NAMES, axisLabel: { rotate: 45, color: '#475569', fontSize: 11 }, splitArea: { show: true } },
      yAxis: { type: 'category', data: NEED_NAMES, axisLabel: { color: '#475569', fontSize: 11 }, splitArea: { show: true } },
      visualMap: {
        min: -0.5, max: 0.8, calculable: true, orient: 'horizontal', left: 'center', bottom: 10,
        text: ['强协同', '强冲突'], textStyle: { color: '#475569' },
        inRange: { color: ['#F87171', '#FED7AA', '#FEF3C7', '#D1FAE5', '#34D399', '#10B981'] },
      },
      series: [{ name: '关联度', type: 'heatmap', data, label: { show: false } }],
    }
  }, [latestAnalysis])

  const networkOption = useMemo(() => {
    if (!latestAnalysis) return {}
    const activeRanking = latestAnalysis.demand_ranking.filter(r => r.potential > 0.15)
    const nodes = activeRanking.map((r, i) => ({
      id: r.need_id.toString(),
      name: r.need,
      category: r.layer_level,
      symbolSize: 20 + r.potential * 40,
      value: r.potential,
      itemStyle: { color: NEED_COLORS_RGB[r.need_id], shadowBlur: 15, shadowColor: NEED_COLORS_RGB[r.need_id], opacity: r.suppressed ? 0.4 : 1 },
      label: { show: true, position: 'right', color: '#334155', fontSize: 11, fontWeight: 'bold' },
    }))
    const links: { source: string; target: string; lineStyle: any; value: number }[] = []
    // 压制关系（红色实线）
    latestAnalysis.suppression_links.forEach(link => {
      const sourceNode = nodes.find(n => n.id === link.source.toString())
      const targetNode = nodes.find(n => n.id === link.target.toString())
      if (sourceNode && targetNode) {
        links.push({ source: link.source.toString(), target: link.target.toString(), value: link.value, lineStyle: { color: '#EF4444', width: 3, type: 'solid' } })
      }
    })
    // 冲突关系（橙色虚线）
    latestAnalysis.conflicts.forEach(c => {
      if (c.need_a_id !== undefined && c.need_b_id !== undefined) {
        links.push({ source: c.need_a_id.toString(), target: c.need_b_id.toString(), value: c.potential_diff, lineStyle: { color: '#F59E0B', width: 2.5, type: 'dashed' } })
      }
    })
    // 协同关系（浅色细线）
    const activeIds = new Set(activeRanking.map(r => r.need_id))
    const matrix = latestAnalysis.matrix
    for (let i = 0; i < 12; i++) {
      for (let j = i + 1; j < 12; j++) {
        if (activeIds.has(i) && activeIds.has(j) && matrix[i][j] > 0.3) {
          links.push({ source: i.toString(), target: j.toString(), value: matrix[i][j], lineStyle: { color: '#93C5FD', width: 1, opacity: 0.4 } })
        }
      }
    }
    const categories = LAYER_LABELS.map((name, i) => ({ name, itemStyle: { color: ['#3B82F6', '#0EA5E9', '#8B5CF6', '#F59E0B', '#84CC16'][i] } }))
    return {
      tooltip: {
        formatter: (p: any) => {
          if (p.dataType === 'node') return `<b>${p.data.name}</b><br/>层级: ${LAYER_LABELS[p.data.category]}<br/>势能: ${p.data.value.toFixed(3)}`
          if (p.dataType === 'edge') return `${NEED_NAMES[parseInt(p.data.source)]} → ${NEED_NAMES[parseInt(p.data.target)]}<br/>强度: ${p.data.value.toFixed(2)}`
          return ''
        },
      },
      legend: [{ data: categories.map(c => c.name), bottom: 0, textStyle: { color: '#475569', fontSize: 12 } }],
      animationDuration: 1500,
      series: [{
        name: '需求关系网络', type: 'graph', layout: 'force', data: nodes, links, categories, roam: true, draggable: true,
        force: { repulsion: 400, gravity: 0.1, edgeLength: [80, 200] },
        emphasis: { focus: 'adjacency', lineStyle: { width: 5 } },
        lineStyle: { opacity: 0.9, curveness: 0.2 },
      }],
    }
  }, [latestAnalysis])

  const timelineOption = useMemo(() => {
    if (!profile || !messages.length) return {}
    const history = messages.filter(m => m.demands).map((_, idx) => idx + 1)
    if (history.length === 0) return {}
    // Top 4 用户权重需求
    const topIds = profile.weights.map((w, i) => ({ id: i, w })).sort((a, b) => b.w - a.w).slice(0, 4).map(x => x.id)
    const demandData: Record<number, number[]> = {}
    topIds.forEach(id => { demandData[id] = [] })
    messages.filter(m => m.demands).forEach(m => {
      const rdata = m.demands!.radar_data
      topIds.forEach(id => demandData[id].push(+rdata[id].toFixed(3)))
    })
    const series = topIds.map(id => ({
      name: NEED_NAMES[id],
      type: 'line', smooth: true, symbol: 'circle', symbolSize: 7,
      data: demandData[id],
      lineStyle: { width: 3, color: NEED_COLORS_RGB[id] },
      itemStyle: { color: NEED_COLORS_RGB[id], borderColor: '#fff', borderWidth: 2 },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: NEED_COLORS_RGB[id] + '66' }, { offset: 1, color: NEED_COLORS_RGB[id] + '00' }] } },
    }))
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: topIds.map(i => NEED_NAMES[i]), bottom: 0, textStyle: { color: '#475569', fontSize: 12 } },
      grid: { left: '3%', right: '4%', top: '4%', bottom: '15%', containLabel: true },
      xAxis: { type: 'category', boundaryGap: false, data: history.map(h => `对话${h}`), axisLabel: { color: '#64748B' }, axisLine: { lineStyle: { color: '#CBD5E1' } } },
      yAxis: { type: 'value', min: 0, max: 1, axisLabel: { color: '#64748B' }, axisLine: { lineStyle: { color: '#CBD5E1' } }, splitLine: { lineStyle: { color: 'rgba(203,213,225,0.4)' } } },
      series,
    }
  }, [messages, profile])

  const layerDistributionOption = useMemo(() => {
    if (!latestAnalysis) return {}
    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      series: [{
        name: '层级分布', type: 'pie', radius: ['40%', '75%'], center: ['50%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 3 },
        label: { show: true, color: '#334155', fontWeight: 'bold' },
        data: latestAnalysis.layer_distribution.map((v, i) => ({ value: +v.toFixed(3), name: LAYER_LABELS[i], itemStyle: { color: ['#3B82F6', '#0EA5E9', '#8B5CF6', '#F59E0B', '#84CC16'][i] } })).filter(d => d.value > 0),
      }],
    }
  }, [latestAnalysis])

  // ======================== 渲染 ========================
  return (
    <>
      {/* ========== 图表全屏弹窗 ========== */}
      <AnimatePresence>
        {isChartModalOpen && (
          <>
            {/* 虚化遮罩 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md"
              onClick={() => setIsChartModalOpen(false)}
            />
            {/* 弹窗主体 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.88, y: 30 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-4 z-[101] flex flex-col bg-white/95 backdrop-blur-xl rounded-3xl border border-slate-200/60 shadow-2xl overflow-hidden"
            >
              {/* 弹窗标题栏 */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-sky-50/80 to-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-700 flex items-center justify-center shadow-lg">
                    <Radar className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="font-black text-slate-900 text-base">DPU 需求分析</div>
                    <div className="text-xs text-slate-500">实时图表 · {activeTab === 'radar' ? '12维雷达图' : activeTab === 'matrix' ? 'v4.2 注意力矩阵' : activeTab === 'network' ? '冲突网络图' : activeTab === 'decision' ? '决策路径' : activeTab === 'timeline' ? '需求走势演化' : 'v4.2 公式原理'}</div>
                  </div>
                </div>
                <button onClick={() => setIsChartModalOpen(false)}
                  className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-500 text-slate-500 flex items-center justify-center transition-all shadow-sm text-lg font-light">
                  ✕
                </button>
              </div>
              {/* Tab 切换行 */}
              <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50">
                <div className="flex gap-2">
                  {TABS.map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === tab.key ? 'bg-gradient-to-r from-sky-500 to-indigo-700 text-white shadow-md shadow-sky-200' : 'bg-white text-slate-600 hover:bg-sky-50 hover:text-sky-700 border border-slate-200/60'}`}>
                      <tab.icon className="w-3.5 h-3.5" />{tab.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* 图表内容区 - 大尺寸全屏版 */}
              <div className="flex-1 overflow-auto p-6 bg-gradient-to-br from-slate-50/50 to-indigo-50/20">
                {activeTab === 'radar' && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full">
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow p-4 flex flex-col">
                      <div className="text-sm font-bold text-slate-800 mb-1">🎯 12维需求雷达图</div>
                      <div className="flex-1 min-h-[500px]">
                        <ReactECharts option={radarOption} style={{ height: '100%', minHeight: 500 }} notMerge />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="bg-white rounded-2xl border border-slate-200 shadow p-4">
                        <div className="text-sm font-bold text-slate-800 mb-3">📊 势能排名 Top 12</div>
                        <div style={{ height: 300 }}>
                          <ReactECharts option={barOption} style={{ height: '100%' }} notMerge />
                        </div>
                      </div>
                      <div className="bg-white rounded-2xl border border-slate-200 shadow p-4">
                        <div className="text-sm font-bold text-slate-800 mb-2">🧠 用户画像</div>
                        {profile ? (
                          <div className="space-y-1.5">
                            {profile.weights.map((w, i) => ({ id: i, w })).sort((a, b) => b.w - a.w).slice(0, 6).map(({ id, w }, rank) => (
                              <div key={id} className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0" style={{ background: NEED_COLORS_RGB[id] }}>{rank + 1}</span>
                                <span className="text-sm font-bold text-slate-700 flex-shrink-0 w-20">{NEED_NAMES[id]}</span>
                                <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, w * 100)}%`, background: NEED_COLORS_RGB[id] }} />
                                </div>
                                <span className="text-xs font-mono text-slate-500 w-12 text-right">{w.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400 py-4 text-center">还没有画像数据</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {activeTab === 'matrix' && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full">
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow p-4 flex flex-col">
                      <div className="text-sm font-bold text-slate-800 mb-1">🔥 v4.2 注意力加权矩阵热力图</div>
                      <div className="flex-1 min-h-[500px]">
                        <ReactECharts option={heatmapOption} style={{ height: '100%', minHeight: 500 }} notMerge />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="bg-white rounded-2xl border border-slate-200 shadow p-4">
                        <div className="text-sm font-bold text-slate-800 mb-3">🔗 协同关系</div>
                        <div className="text-xs text-slate-600 leading-relaxed space-y-2">
                          <div>🟢 <b>绿色</b> = 两个需求经常同时被激活（协同）</div>
                          <div>🔴 <b>红色</b> = 两个需求相互冲突</div>
                          <div>⚪ <b>浅色</b> = 无明显关系</div>
                        </div>
                      </div>
                      <div className="bg-white rounded-2xl border border-slate-200 shadow p-4">
                        <div className="text-sm font-bold text-slate-800 mb-2">📊 势能排名</div>
                        <div style={{ height: 260 }}>
                          <ReactECharts option={barOption} style={{ height: '100%' }} notMerge />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {activeTab === 'network' && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full">
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow p-4 flex flex-col">
                      <div className="text-sm font-bold text-slate-800 mb-1">🌐 需求冲突关系网络</div>
                      <div className="flex-1 min-h-[500px]">
                        <ReactECharts option={networkOption} style={{ height: '100%', minHeight: 500 }} notMerge />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="bg-white rounded-2xl border border-slate-200 shadow p-4">
                        <div className="text-sm font-bold text-slate-800 mb-3">🥧 层级分布</div>
                        <div style={{ height: 280 }}>
                          <ReactECharts option={layerDistributionOption} style={{ height: '100%' }} notMerge />
                        </div>
                      </div>
                      <div className="bg-white rounded-2xl border border-slate-200 shadow p-4">
                        <div className="text-sm font-bold text-slate-800 mb-3">📖 图例说明</div>
                        <div className="text-xs text-slate-600 leading-relaxed space-y-2">
                          <div>━ <b>实线</b> = 被压制关系</div>
                          <div>┄ <b>虚线</b> = 冲突关系</div>
                          <div>─ <b>细线</b> = 协同关系</div>
                          <div className="mt-2 pt-2 border-t border-slate-100">节点大小代表该需求被激活的强度</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {activeTab === 'timeline' && (
                  <div className="grid grid-cols-1 gap-4 h-full">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow p-4 flex flex-col">
                      <div className="text-sm font-bold text-slate-800 mb-1">📈 用户画像权重演化曲线</div>
                      <div className="flex-1 min-h-[500px]">
                        <ReactECharts option={timelineOption} style={{ height: '100%', minHeight: 500 }} notMerge />
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow p-4">
                      <div className="text-sm font-bold text-slate-800 mb-2">📊 当前 12维权重完整排名</div>
                      {profile ? (
                        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                          {profile.weights.map((w, i) => ({ id: i, w })).sort((a, b) => b.w - a.w).map(({ id, w }, rank) => (
                            <div key={id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200/60">
                              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0" style={{ background: NEED_COLORS_RGB[id] }}>{rank + 1}</span>
                              <span className="text-xs font-bold text-slate-700 flex-1 truncate">{NEED_NAMES[id]}</span>
                              <span className="text-xs font-mono text-slate-500">{w.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 py-4 text-center">还没有画像数据</div>
                      )}
                    </div>
                  </div>
                )}
                {(activeTab === 'decision' || activeTab === 'formula') && (
                  <div className="h-full flex items-center justify-center">
                    {renderTabContent(activeTab, latestAnalysis, profile, radarOption, barOption, heatmapOption, networkOption, layerDistributionOption, timelineOption)}
                  </div>
                )}
              </div>
              {/* 底部提示 */}
              <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 text-center">
                <span className="text-xs text-slate-400">按 ESC 或点击遮罩关闭</span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ========== 对话全屏弹窗 ========== */}
      <AnimatePresence>
        {isDialogModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md"
              onClick={() => setIsDialogModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.88, y: 30 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-8 z-[101] flex flex-col bg-white/95 backdrop-blur-xl rounded-3xl border border-slate-200/60 shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-sky-50/80 to-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-700 flex items-center justify-center shadow-lg">
                    <MessageSquare className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="font-black text-slate-900 text-base">{currentConv?.title || '新对话'}</div>
                    <div className="text-xs text-slate-500">在线 · {messages.length} 条</div>
                  </div>
                </div>
                <button onClick={() => setIsDialogModalOpen(false)}
                  className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-500 text-slate-500 flex items-center justify-center transition-all shadow-sm text-lg font-light">
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-4 scrollbar-hide bg-gradient-to-br from-slate-50/80 to-sky-50/30">
                <AnimatePresence initial={false}>
                  {messages.map(msg => (
                    <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${msg.role === 'user' ? 'bg-slate-900 text-white' : 'bg-gradient-to-br from-sky-500 to-indigo-700 text-white'}`}>
                          {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                        </div>
                        <div className={`rounded-2xl p-4 text-sm leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200/60 text-slate-800'}`}>
                          <p className="whitespace-pre-line">{msg.content}</p>
                          {msg.demands && msg.role === 'assistant' && msg.demands.demand_ranking.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-200/70">
                              <div className="text-xs font-bold text-sky-700 mb-2">DPU 检测 Top 需求</div>
                              <div className="flex flex-wrap gap-2">
                                {msg.demands.demand_ranking.slice(0, 4).map((r, i) => (
                                  <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold"
                                    style={{
                                      background: r.suppressed ? '#FEE2E2' : NEED_COLORS_RGB[r.need_id] + '22',
                                      color: r.suppressed ? '#B91C1C' : NEED_COLORS_RGB[r.need_id],
                                      border: `1px solid ${r.suppressed ? '#FCA5A5' : NEED_COLORS_RGB[r.need_id] + '44'}`
                                    }}>
                                    {i + 1}.{r.need}{r.suppressed && ' 🚫'}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {isTyping && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
                    <div className="flex gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-700 flex items-center justify-center shadow-sm">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                      <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm">
                        <div className="flex gap-2">
                          {[0, 1, 2].map(i => (
                            <motion.span key={i} animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }} className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="px-6 py-4 border-t border-slate-200 bg-white">
                <div className="flex gap-1 overflow-x-auto pb-2 mb-2 scrollbar-hide">
                  {SAMPLE_INPUTS.slice(0, 3).map((s, i) => (
                    <button key={i} onClick={() => setInput(s)} className="flex-shrink-0 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-sky-50 text-xs font-semibold text-slate-700 hover:text-sky-700 transition-colors border border-transparent hover:border-sky-200 whitespace-nowrap">
                      {s.length > 20 ? s.slice(0, 20) + '…' : s}
                    </button>
                  ))}
                </div>
                <div className="flex items-end gap-2 bg-slate-50 rounded-2xl border border-slate-300 p-3 shadow-sm focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100 transition-all">
                  <textarea value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                    placeholder="说说你的困扰…（Enter 发送，点击右侧麦克风语音输入）"
                    rows={2}
                    className="flex-1 bg-transparent resize-none px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none font-medium" />
                  <button onClick={toggleVoiceInput}
                    className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${isListening ? 'bg-red-500 text-white shadow-lg shadow-red-200 animate-pulse' : 'bg-white hover:bg-sky-500 hover:text-white text-slate-600 border border-slate-200'}`}>
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                  <button onClick={() => handleSend()} disabled={!input.trim() || isTyping}
                    className="h-10 px-5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-700 text-white font-bold shadow hover:shadow-lg transition-all disabled:opacity-40 disabled:shadow-none flex items-center gap-2">
                    <Send className="w-4 h-4" />发送
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="min-h-screen pt-24 pb-12 bg-gradient-to-br from-slate-50 via-sky-50/30 to-indigo-50/20">
      <div className="max-w-[1700px] mx-auto px-4">

      {/* 会话抽屉覆盖层 */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onClick={toggleDrawer} />
      )}
      {/* 会话抽屉面板 */}
      {isDrawerOpen && (
        <div className="fixed left-0 top-0 bottom-0 z-50 w-72 bg-white/95 backdrop-blur-xl shadow-2xl border-r border-slate-200 flex flex-col overflow-hidden">
          <div className="px-4 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-sky-50 to-white">
            <span className="font-bold text-slate-900 text-sm">会话列表</span>
            <button onClick={toggleDrawer} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
          </div>
          <div className="px-3 py-3">
            <button onClick={() => { handleNewConversation(); toggleDrawer() }} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-700 text-white text-xs font-bold shadow">
              <Plus className="w-3.5 h-3.5" />新建对话
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.map(conv => (
              <div key={conv.id} onClick={() => { setCurrentId(conv.id); toggleDrawer() }}
                className={`group px-4 py-3 border-b border-slate-100 cursor-pointer transition-all ${conv.id === currentId ? 'bg-sky-50 border-l-4 border-l-sky-500' : 'hover:bg-slate-50 border-l-4 border-l-transparent'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <MessageSquare className="w-3.5 h-3.5 text-sky-600 flex-shrink-0" />
                    <span className="text-xs font-bold text-slate-800 truncate">{conv.title}</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id) }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500" title="删除对话">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-[10px] text-slate-500 mt-1 pl-5">
                  {conv.messages.length} 条消息 · {new Date(conv.created_at).toLocaleDateString('zh-CN')}
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-slate-200">
            <button onClick={handleReset} className="w-full text-xs text-slate-500 hover:text-red-500 flex items-center justify-center gap-1.5 font-semibold">
              <RotateCcw className="w-3.5 h-3.5" /> 清空全部记忆与对话
            </button>
          </div>
        </div>
      )}

      {/* 顶部标题 + ☰ 会话按钮 */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={toggleDrawer} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/80 border border-slate-200 text-xs font-bold text-slate-700 hover:bg-sky-50 hover:text-sky-700 hover:border-sky-300 transition-all shadow-sm">
          <Menu className="w-4 h-4" /> 会话列表
        </button>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center flex-1">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 border border-sky-200 text-xs font-bold text-sky-700 tracking-wider mb-2 shadow-sm">
            <Bot className="w-4 h-4" /> DPU AGENT · 需求可视化引擎
          </div>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-900 mb-1 tracking-tight">
            AI 如何<span className="bg-gradient-to-r from-sky-500 to-indigo-700 bg-clip-text text-transparent">理解需求</span>
          </h1>
          <div className="text-xs text-slate-600 flex items-center justify-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              分析方式：<b className="text-indigo-700">{messages.length > 0 ? (messages[messages.length - 1].method_label || 'DPU引擎') : '等待输入…'}</b>
            </span>
            <span className="text-slate-300">|</span>
            <span>本轮对话 <b className="text-slate-800">{messages.length}</b> 条</span>
            {profile && (
              <>
                <span className="text-slate-300">|</span>
                <span>全局画像已交互 <b className="text-slate-800">{profile.interaction_count}</b> 轮</span>
              </>
            )}
          </div>
          <div className="mt-2"><LlmStatusBadge status={llmStatus} onRefresh={refreshLlmStatus} /></div>
        </motion.div>
        <div className="w-[120px]"></div>
      </div>

      {/* 主体三栏：左38%对话 + 右62%图表 */}
      <div className="grid grid-cols-1 lg:grid-cols-[38%_62%] gap-4">

        {/* ========== 左侧38%：对话区 ========== */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-slate-200/80 shadow-xl overflow-hidden flex flex-col" style={{ height: 720 }}>
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-sky-50/50 to-white">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-700 flex items-center justify-center shadow-sm">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="font-bold text-slate-900 text-xs">{currentConv?.title || '新对话'}</div>
                <a
                  href="/memory"
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded-md transition-colors no-underline"
                  title="点击跳转至记忆系统查看完整需求画像"
                >
                  📊 需求画像已同步 → 记忆系统
                </a>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={handleNewConversation}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-slate-500 hover:text-sky-600 hover:bg-sky-50 border border-slate-200 bg-white transition-all" title="新建空白对话">
                <RotateCcw className="w-3 h-3" /> 新对话
              </button>
              <button onClick={handleClearCurrent}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-slate-500 hover:text-rose-500 hover:bg-rose-50 border border-slate-200 bg-white transition-all" title="清空当前对话消息">
                <Trash2 className="w-3 h-3" /> 清空
              </button>
              <button onClick={() => setIsDialogModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-gradient-to-r from-sky-500 to-indigo-700 text-white shadow hover:shadow-lg transition-all">
                <Maximize2 className="w-3 h-3" /> 全屏
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-hide">
            <AnimatePresence initial={false}>
              {messages.map(msg => (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`flex gap-2 max-w-[95%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm ${msg.role === 'user' ? 'bg-slate-900 text-white' : 'bg-gradient-to-br from-sky-500 to-indigo-700 text-white'}`}>
                      {msg.role === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                    </div>
                    <div className={`rounded-2xl p-2.5 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-800 border border-slate-200/60'}`}>
                      <p className="whitespace-pre-line">{msg.content}</p>
                      {msg.demands && msg.role === 'assistant' && msg.demands.demand_ranking.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-200/70">
                          <div className="text-[10px] font-bold text-sky-700 mb-1.5">DPU 检测 Top 需求</div>
                          <div className="flex flex-wrap gap-1">
                            {msg.demands.demand_ranking.slice(0, 4).map((r, i) => (
                              <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                                style={{
                                  background: r.suppressed ? '#FEE2E2' : NEED_COLORS_RGB[r.need_id] + '22',
                                  color: r.suppressed ? '#B91C1C' : NEED_COLORS_RGB[r.need_id],
                                  border: `1px solid ${r.suppressed ? '#FCA5A5' : NEED_COLORS_RGB[r.need_id] + '44'}`,
                                }}>
                                {i + 1}.{r.need}{r.suppressed && ' 🚫'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* 消息操作按钮 */}
                      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-200/60 opacity-60 hover:opacity-100">
                        <button onClick={() => copyMessageText(msg.content)} className="text-[10px] font-bold text-slate-400 hover:text-sky-600 flex items-center gap-0.5" title="复制文字">
                          <Copy className="w-2.5 h-2.5" /> 复制
                        </button>
                        <button onClick={() => deleteMessagePair(msg.id)} className="text-[10px] font-bold text-slate-400 hover:text-red-500 flex items-center gap-0.5" title="删除此消息">
                          <Trash2 className="w-2.5 h-2.5" /> 删除
                        </button>
                        {msg.role === 'assistant' && (
                          <button onClick={() => handleSend(msg.content)} className="text-[10px] font-bold text-slate-400 hover:text-indigo-600 flex items-center gap-0.5" title="以此内容重新分析">
                            <RefreshCw className="w-2.5 h-2.5" /> 重新分析
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isTyping && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-700 flex items-center justify-center">
                    <Bot className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3">
                    <div className="flex gap-1.5">
                      {[0, 1, 2].map(i => (
                        <motion.span key={i} animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }} className="w-2 h-2 rounded-full bg-sky-500" />
                      ))}
                    </div>
                    <div className="text-[10px] text-slate-500 font-semibold mt-1">正在分析…</div>
                  </div>
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 快捷输入 */}
          <div className="px-3 pt-2 border-t border-slate-200">
            <div className="flex gap-1 overflow-x-auto pb-1.5 scrollbar-hide">
              {SAMPLE_INPUTS.slice(0, 3).map((s, i) => (
                <button key={i} onClick={() => setInput(s)} className="flex-shrink-0 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-sky-50 text-[10px] font-semibold text-slate-700 hover:text-sky-700 transition-colors border border-transparent hover:border-sky-200 whitespace-nowrap">
                  {s.length > 16 ? s.slice(0, 16) + '…' : s}
                </button>
              ))}
            </div>
          </div>

          {/* 输入框 + 语音按钮 */}
          <div className="p-2.5 pt-1">
            <div className="flex items-end gap-1.5 bg-white rounded-2xl border border-slate-300 p-2 shadow-sm focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100 transition-all">
              <textarea value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder="说点什么，或点右侧麦克风语音输入…"
                rows={2}
                className="flex-1 bg-transparent resize-none px-2 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none font-medium"
              />
              {voiceTranscript && (
                <div className="px-2 py-1 text-xs text-sky-600 bg-sky-50 rounded-lg border border-sky-200 text-[10px]">
                  🎤 {voiceTranscript}
                </div>
              )}
              <button onClick={toggleVoiceInput}
                className={`h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${isListening ? 'bg-red-500 text-white shadow-lg shadow-red-200 animate-pulse' : 'bg-slate-100 hover:bg-sky-500 hover:text-white text-slate-600'}`}
                title={isListening ? '停止语音输入' : '开始语音输入'}>
                {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => handleSend()} disabled={!input.trim() || isTyping}
                className="h-8 px-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-700 text-white font-bold shadow hover:shadow-lg transition-shadow disabled:opacity-40 disabled:shadow-none flex items-center gap-1 text-xs">
                <Send className="w-3 h-3" /><span className="hidden md:inline">分析</span>
              </button>
            </div>
          </div>
        </div>

        {/* ========== 右侧62%：图表区 ========== */}
        <div className="space-y-3">

          {/* 顶部概览：需求球体 + 用户画像 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow p-3">
              <div className="text-[10px] font-bold text-sky-700 tracking-wider mb-1">实时需求球体</div>
              <div className="flex items-center justify-center">
                <MiniNeedSphere size={130} activeNeeds={activeNeeds} potentials={latestAnalysis?.radar_data || []} />
              </div>
              <h2 className="text-xs font-black text-slate-900 text-center mt-1">
                激活：{activeNeeds.length > 0 ? activeNeeds.slice(0, 3).map(i => NEED_NAMES[i]).join('、') : '暂无'}
              </h2>
            </div>

            <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow p-3">
              <div className="text-[10px] font-bold text-indigo-700 tracking-wider mb-2">用户画像 · Top 5</div>
              {profile ? (
                <div className="space-y-1.5">
                  {profile.weights.map((w, i) => ({ id: i, w })).sort((a, b) => b.w - a.w).slice(0, 5).map(({ id, w }, i) => (
                    <div key={id} className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0" style={{ background: NEED_COLORS_RGB[id] }}>{i + 1}</span>
                      <span className="text-[11px] font-bold text-slate-700 flex-shrink-0 w-16 truncate">{NEED_NAMES[id]}</span>
                      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, w * 100)}%`, background: NEED_COLORS_RGB[id] }} />
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 w-9 text-right">{w.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[10px] text-slate-400">还没有画像数据，多和我聊聊吧～</div>
              )}
            </div>
          </div>

          {/* 主图：Tabs 图表区 */}
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow p-3">
            <div className="flex gap-1.5 flex-wrap mb-3">
              {TABS.map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${activeTab === tab.key ? 'bg-gradient-to-r from-sky-500 to-indigo-700 text-white shadow' : 'bg-white text-slate-600 hover:bg-sky-50 hover:text-sky-700 border border-slate-200/60'}`}>
                  <tab.icon className="w-3 h-3" />{tab.label}
                </button>
              ))}
              <button onClick={() => setIsChartModalOpen(true)}
                className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-sky-500 to-indigo-700 text-white shadow-md shadow-sky-200 hover:shadow-lg hover:-translate-y-0.5 transition-all">
                <Maximize2 className="w-4 h-4" />全屏查看
              </button>
            </div>
            <div style={{ height: 530 }} className="overflow-y-auto pr-1 scrollbar-hide">
              {renderTabContent(activeTab, latestAnalysis, profile, radarOption, barOption, heatmapOption, networkOption, layerDistributionOption, timelineOption)}
            </div>
          </div>
        </div>
      </div>
      </div>
      </div>
    </>
  )
}

// ========== 渲染 Tab 内容（抽离为纯函数，避免在组件里写太长）==========
function renderTabContent(
  active: TabKey,
  latest: ExtendedAnalysis | undefined,
  profile: UserProfile | null,
  radar: any, bar: any, heat: any, network: any, layer: any, timeline: any,
) {
  if (!latest) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        <div className="text-center">
          <Bot className="w-16 h-16 mx-auto mb-4 text-slate-300" />
          <p>发送消息后，这里会展示需求分析图表</p>
        </div>
      </div>
    )
  }

  switch (active) {
    case 'radar':
      return (
        <div className="grid grid-rows-[1fr_auto] gap-3 h-full">
          <div className="bg-white/70 backdrop-blur rounded-2xl p-3 border border-slate-200/80">
            <h3 className="text-xs font-bold text-slate-800 mb-1 flex items-center gap-2"><Radar className="w-3.5 h-3.5 text-sky-600" /> 12 维需求雷达</h3>
            <ReactECharts option={radar} style={{ height: 300 }} notMerge />
          </div>
          <div className="bg-white/70 backdrop-blur rounded-2xl p-3 border border-slate-200/80">
            <h3 className="text-xs font-bold text-slate-800 mb-1 flex items-center gap-2"><BarChart3 className="w-3.5 h-3.5 text-sky-600" /> 势能排名</h3>
            <ReactECharts option={bar} style={{ height: 220 }} notMerge />
          </div>
        </div>
      )
    case 'matrix':
      return (
        <div className="bg-white/70 backdrop-blur rounded-2xl p-3 border border-slate-200/80 h-full">
          <h3 className="text-xs font-bold text-slate-800 mb-1 flex items-center gap-2"><Flame className="w-3.5 h-3.5 text-orange-500" /> v4.2 注意力加权矩阵热力图</h3>
          <p className="text-xs text-slate-500 mb-2">C_attn(i,j)=C_base×(1+α×√(aᵢ×aⱼ)) · 绿色=协同 · 红色=冲突 · 共激活自动增强关联</p>
          <ReactECharts option={heat} style={{ height: 500 }} notMerge />
        </div>
      )
    case 'network':
      return (
        <div className="grid grid-rows-[1fr_auto] gap-3 h-full">
          <div className="bg-white/70 backdrop-blur rounded-2xl p-3 border border-slate-200/80">
            <h3 className="text-xs font-bold text-slate-800 mb-1 flex items-center gap-2"><Network className="w-3.5 h-3.5 text-sky-600" /> 需求关系网络</h3>
            <p className="text-xs text-slate-500 mb-1">🔴 实线=被压制 · 🟠 虚线=冲突 · 🔵 细线=协同。节点可拖拽。</p>
            <ReactECharts option={network} style={{ height: 280 }} notMerge />
          </div>
          <div className="bg-white/70 backdrop-blur rounded-2xl p-3 border border-slate-200/80">
            <h3 className="text-xs font-bold text-slate-800 mb-1 flex items-center gap-2"><Layers className="w-3.5 h-3.5 text-sky-600" /> 马斯洛层级分布</h3>
            <ReactECharts option={layer} style={{ height: 220 }} notMerge />
          </div>
        </div>
      )
    case 'decision':
      return (
        <div className="space-y-3 p-1">
          <div className="bg-white/70 backdrop-blur rounded-2xl p-4 border border-slate-200/80">
            <h3 className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-2"><GitBranch className="w-3.5 h-3.5 text-sky-600" /> DPU 5步决策路径</h3>
            <div className="space-y-2">
              {latest.decision_path.map((s: any, i: number) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow ${s.value === '被衰减' ? 'bg-red-500' : 'bg-gradient-to-br from-sky-500 to-indigo-700'}`}>{i + 1}</div>
                  <div className="flex-1 py-1">
                    <div className="font-bold text-slate-900 text-sm">{s.step}</div>
                    <div className="text-xs text-slate-600">{s.detail}</div>
                  </div>
                  <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-bold">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
          {latest.conflicts.length > 0 && (
            <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200">
              <h3 className="text-xs font-bold text-amber-800 mb-2 flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5" /> 检测到需求冲突</h3>
              {latest.conflicts.map((c: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs text-slate-700 mb-1">
                  <span className="px-2 py-1 bg-white rounded font-bold text-amber-700">{c.need_a}</span>
                  <span className="text-amber-600">⇄</span>
                  <span className="px-2 py-1 bg-white rounded font-bold text-red-700">{c.need_b}</span>
                  <ChevronRight className="w-3 h-3 text-slate-400" />
                  <span>胜出: <b>{c.winner}</b> · {c.action}</span>
                </div>
              ))}
            </div>
          )}
          <div className="bg-white/70 backdrop-blur rounded-2xl p-4 border border-slate-200/80">
            <h3 className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-sky-600" /> 核心参数快照</h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-xl bg-sky-50"><div className="text-xl font-black text-sky-700">{latest.total_active_needs}</div><div className="text-xs text-slate-600">激活需求</div></div>
              <div className="p-2 rounded-xl bg-red-50"><div className="text-xl font-black text-red-700">{latest.suppressed.length}</div><div className="text-xs text-slate-600">被压制</div></div>
              <div className="p-2 rounded-xl bg-amber-50"><div className="text-xl font-black text-amber-700">{latest.conflict_intensity.toFixed(2)}</div><div className="text-xs text-slate-600">冲突强度</div></div>
            </div>
          </div>
        </div>
      )
    case 'timeline':
      return (
        <div className="grid grid-rows-[auto_1fr] gap-3 h-full">
          <div className="bg-white/70 backdrop-blur rounded-2xl p-3 border border-slate-200/80">
            <h3 className="text-xs font-bold text-slate-800 mb-1 flex items-center gap-2"><LineChart className="w-3.5 h-3.5 text-sky-600" /> 对话中的权重演化</h3>
            <ReactECharts option={timeline} style={{ height: 220 }} notMerge />
          </div>
          <div className="bg-white/70 backdrop-blur rounded-2xl p-3 border border-slate-200/80 overflow-y-auto">
            <h3 className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-2"><Brain className="w-3.5 h-3.5 text-sky-600" /> 12 维用户画像权重（长期记忆）</h3>
            {profile ? (
              <div className="grid grid-cols-2 gap-2">
                {profile.weights.map((w, i) => ({ id: i, w })).sort((a, b) => b.w - a.w).map(({ id, w }, i) => (
                  <div key={id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 hover:bg-slate-100">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[10px] font-black shadow-sm" style={{ background: NEED_COLORS_RGB[id] }}>{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-800 truncate">{NEED_NAMES[id]}</div>
                      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, w * 100)}%`, background: NEED_COLORS_RGB[id] }} />
                      </div>
                    </div>
                    <div className="text-xs font-mono font-bold text-slate-600 w-10 text-right">{w.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            ) : <div className="text-xs text-slate-400">暂无画像数据</div>}
          </div>
        </div>
      )
    case 'formula':
      return (
        <div className="space-y-3 overflow-y-auto h-full pr-1">
          <div className="bg-white/70 backdrop-blur rounded-2xl p-4 border border-slate-200/80">
            <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2"><Zap className="w-4 h-4 text-sky-600" /> 基础势能公式</h3>
            <div className="p-3 rounded-xl bg-gradient-to-br from-slate-50 to-sky-50 font-mono text-xs text-slate-700 leading-relaxed border border-slate-200">
              <div><b>P_base</b> = Lf × (w₂×E×I + w₃×(1-R) + w₄×Intent) + w₁×Lw</div>
              <div><b>P_couple</b> = P_base × max(0.1, 1 + ΣC_attn − ΣExcl)</div>
              <div className="mt-2 text-xs text-slate-600">
                <div>· <b>注意力矩阵</b>：C_attn(i,j) = C_base × (1 + 0.5×√(aᵢ×aⱼ))，共激活自动增强</div>
                <div>· <b>LLM 直出</b>：w₁=0.12 让 LLM 判断主导计算，非层级权重固定加成</div>
                <div>· <b>势能优先排序</b>：LLM 模式下势能排第一，层级作 tiebreaker</div>
                <div>· <b>生存层压制</b>：仅 D0/D1 可触发压制，上层需求 ×1.12 主动增益</div>
              </div>
            </div>
          </div>
          <div className="bg-white/70 backdrop-blur rounded-2xl p-4 border border-slate-200/80">
            <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2"><Layers className="w-4 h-4 text-sky-600" /> v4.2 双模式压制策略</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                <div className="font-bold text-indigo-700 mb-1">纯 DPU 模式</div>
                <div className="text-slate-600">五层马斯洛全部参与压制，底层激活&gt;0.7 → 上层按 0.6ⁿ 衰减。传统心理学路径。</div>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="font-bold text-emerald-700 mb-1">LLM+DPU 模式</div>
                <div className="text-slate-600">仅生存层(D0/D1)可触发压制。LLM 判定底层无忧 → 上层 ×1.12 主动增益。动态自适应。</div>
              </div>
            </div>
          </div>
          <div className="bg-white/70 backdrop-blur rounded-2xl p-4 border border-slate-200/80">
            <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> 贝叶斯记忆更新</h3>
            <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-50 to-white text-xs text-slate-700 border border-slate-200">
              <p className="font-mono mb-2">W(t+1) = W(t) × decay + P(current) × learning_rate</p>
              <p><b>decay = 0.9</b> · <b>lr</b> 随对话数递减（前几轮快速定型，后续微调）</p>
              <p className="mt-2">· 每次对话保存一条记忆条目（IndexedDB持久化）</p>
              <p>· 需求权重跨对话长期演化，形成稳定的用户画像</p>
            </div>
          </div>
        </div>
      )
  }
}

// ========== 小尺寸需求球体（右侧卡片里的）==========
function MiniNeedSphere({ size, activeNeeds, potentials }: { size: number; activeNeeds: number[]; potentials: number[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = size + 'px'
    canvas.style.height = size + 'px'
    ctx.scale(dpr, dpr)

    // 生成 12 个球体节点
    const nodes = NEED_NAMES.map((_, i) => {
      const phi = Math.acos(1 - 2 * (i + 0.5) / 12)
      const theta = Math.PI * (1 + Math.sqrt(5)) * i
      return {
        x: size / 2 + size * 0.4 * Math.sin(phi) * Math.cos(theta),
        y: size / 2 + size * 0.4 * Math.sin(phi) * Math.sin(theta),
        z: size / 2 + size * 0.4 * Math.cos(phi),
        radius: 4,
        color: NEED_COLORS_RGB[i],
        need_id: i,
      }
    })

    let angle = 0
    const animate = () => {
      angle += 0.005
      ctx.clearRect(0, 0, size, size)
      // 中心光晕
      const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
      grad.addColorStop(0, 'rgba(139,149,246,0.15)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, size, size)

      // 计算旋转后的位置
      const cx = size / 2, cy = size / 2
      const cosA = Math.cos(angle), sinA = Math.sin(angle)
      nodes.sort((a, b) => a.z - b.z) // 远的先画
      for (const n of nodes) {
        const dx = n.x - cx, dz = n.z - cx
        const rx = dx * cosA - dz * sinA
        const rz = dx * sinA + dz * cosA
        const nx = cx + rx
        const ny = n.y
        const depth = (rz / (size * 0.4) + 1) / 2
        const isActive = activeNeeds.includes(n.need_id)
        const pot = potentials[n.need_id] || 0
        const r = isActive ? 4 + pot * 8 : 3
        ctx.globalAlpha = isActive ? 0.4 + depth * 0.6 : 0.15 + depth * 0.2
        ctx.beginPath()
        ctx.arc(nx, ny, r, 0, Math.PI * 2)
        ctx.fillStyle = n.color
        ctx.fill()
        // 高光
        ctx.globalAlpha = isActive ? 0.6 : 0.2
        ctx.beginPath()
        ctx.arc(nx - r * 0.3, ny - r * 0.3, r * 0.35, 0, Math.PI * 2)
        ctx.fillStyle = '#ffffff'
        ctx.fill()
      }
      ctx.globalAlpha = 1
      animRef.current = requestAnimationFrame(animate)
    }
    animate()
    return () => cancelAnimationFrame(animRef.current)
  }, [size, activeNeeds, potentials])

  return <canvas ref={canvasRef} />
}
