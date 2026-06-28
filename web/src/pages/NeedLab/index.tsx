// ============================================================
// NeedLab 人格沙盘 v4.2
// 特性：宽对话区 / 醒目的对比模式 / 跨页面会话保持
// ============================================================
import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { analyzeDemands, askAI, tracePath, type AnalyzeResponse, type TracePathResponse } from '@/lib/dpuApi'
import { useLlmStatus, LlmStatusBadge } from '@/components/LlmStatusBadge'
import { PersonalitySelector } from './PersonalitySelector'
import { AnalysisPanel } from './AnalysisPanel'
import {
  PERSONA_LIBRARY,
  emptyPersona,
  type NeedLabPersona,
  type NeedLabMessage,
  type DpuAnalysisResult,
  type DpuTraceResult,
} from './types'
import { Sparkles, Zap, Bot, Brain, ChevronDown, ChevronUp, ArrowLeftRight, Info, Eye, EyeOff, Settings2, RotateCcw, Save, Plus, Trash2 } from 'lucide-react'

const SESSION_KEY = 'needlab_session'
const CUSTOM_PERSONAS_KEY = 'needlab_custom_personas'
const CUSTOM_CREATED_KEY = 'needlab_custom_created'

// ============================================================
// 完整的自定义人格持久化（用户从零创建的）
// ============================================================
function loadCustomCreated(): NeedLabPersona[] {
  try {
    const raw = localStorage.getItem(CUSTOM_CREATED_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveCustomCreated(personas: NeedLabPersona[]) {
  try {
    localStorage.setItem(CUSTOM_CREATED_KEY, JSON.stringify(personas))
  } catch {}
}

function deleteCustomCreated(personaId: string) {
  const all = loadCustomCreated().filter(p => p.id !== personaId)
  saveCustomCreated(all)
  return all
}

/** 合并预置 + 自定义编辑覆盖 + 完全自定义人格 = 完整人格列表 */
function getAllPersonas(): NeedLabPersona[] {
  const customParts = loadCustomPersonas()
  const created = loadCustomCreated()
  // 预置人格 + 编辑覆盖
  const presets = PERSONA_LIBRARY.map(p =>
    customParts[p.id] ? mergePersona(p, customParts[p.id]) : p,
  )
  return [...created, ...presets]
}

// ============================================================
// 会话持久化（切换页面不丢消息）
// ============================================================
interface SavedSession {
  personaId: string
  messages: NeedLabMessage[]
  latestAnalysis: DpuAnalysisResult | null
  prevActivation: number[]
}

function saveSession(
  personaId: string,
  messages: NeedLabMessage[],
  latestAnalysis: DpuAnalysisResult | null,
  prevActivation: number[],
) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      personaId, messages, latestAnalysis, prevActivation,
    }))
  } catch {}
}

function loadSession(): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function clearSession() { sessionStorage.removeItem(SESSION_KEY) }

// ============================================================
// 自定义人格持久化
// ============================================================
function loadCustomPersonas(): Record<string, Partial<NeedLabPersona>> {
  try {
    const raw = localStorage.getItem(CUSTOM_PERSONAS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveCustomPersona(personaId: string, changes: Partial<NeedLabPersona>) {
  try {
    const all = loadCustomPersonas()
    all[personaId] = { ...all[personaId], ...changes }
    localStorage.setItem(CUSTOM_PERSONAS_KEY, JSON.stringify(all))
  } catch {}
}

function resetCustomPersona(personaId: string) {
  try {
    const all = loadCustomPersonas()
    delete all[personaId]
    localStorage.setItem(CUSTOM_PERSONAS_KEY, JSON.stringify(all))
  } catch {}
}

function mergePersona(base: NeedLabPersona, custom: Partial<NeedLabPersona>): NeedLabPersona {
  return { ...base, ...custom }
}

export default function NeedLabPage() {
  const { status: llmStatus, refresh: refreshLlmStatus } = useLlmStatus()
  const allPersonas = getAllPersonas()
  const saved = loadSession()
  const fallback = allPersonas[0] || PERSONA_LIBRARY[0]
  const initPersona = saved
    ? (allPersonas.find(p => p.id === saved.personaId) || fallback)
    : fallback

  const [persona, setPersona] = useState<NeedLabPersona>(initPersona)
  const [backstoryExpanded, setBackstoryExpanded] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [showCreator, setShowCreator] = useState(false)
  const [editDraft, setEditDraft] = useState<Partial<NeedLabPersona>>({})
  const [createDraft, setCreateDraft] = useState<NeedLabPersona>(emptyPersona())
  const [customPersonas, setCustomPersonas] = useState<NeedLabPersona[]>(loadCustomCreated)
  const [messages, setMessages] = useState<NeedLabMessage[]>(saved?.messages || [])
  const [loading, setLoading] = useState(false)
  const [showCompare, setShowCompare] = useState(true)
  const [latestAnalysis, setLatestAnalysis] = useState<DpuAnalysisResult | null>(
    saved?.latestAnalysis || null,
  )
  const [latestTrace, setLatestTrace] = useState<DpuTraceResult | null>(null)
  const [prevActivation, setPrevActivation] = useState<number[]>(
    saved?.prevActivation || new Array(12).fill(0),
  )
  const [expandedMsg, setExpandedMsg] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const msgCounter = useRef(messages.length)
  const bottomRef = useRef<HTMLDivElement>(null)

  // 每次消息或分析变化 → 全部保存
  useEffect(() => {
    saveSession(persona.id, messages, latestAnalysis, prevActivation)
  }, [messages, persona.id, latestAnalysis, prevActivation])

  const extractAnalysisFromResponse = (resp: AnalyzeResponse): DpuAnalysisResult => ({
    activation12: resp.activation12 || new Array(12).fill(0),
    top_needs: resp.top_needs || [],
    suppressed: resp.suppressed || [],
    conflicts: (resp.conflicts || []).map(c => typeof c === 'string' ? c : `${c.need_a} vs ${c.need_b}`),
    signals: resp.signals || [],
    llm_context: resp.llm_context ? String(resp.llm_context) : '',
    llm_available: resp.llm_available || false,
  })

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const mid = `msg_${msgCounter.current++}`
    setLoading(true)
    setPrevActivation(latestAnalysis?.activation12 || new Array(12).fill(0))

    setMessages(prev => [...prev, { id: mid, role: 'user', content: text, timestamp: Date.now() }])

    try {
      const [analysisResp, traceResp] = await Promise.all([
        analyzeDemands(text),
        tracePath(text).catch(() => null),
      ])
      const analysis = extractAnalysisFromResponse(analysisResp)
      setLatestAnalysis(analysis)

      let trace: DpuTraceResult | null = null
      if (traceResp?.path) {
        const p = traceResp.path
        trace = {
          source_text: p.source_text || '', nodes: p.nodes || [], edges: p.edges || [],
          root_nodes: p.root_nodes || [],
          conflict_pairs: (p.conflict_pairs || []).map((cp: any) => ({
            need_a: cp.need_a, need_b: cp.need_b, correlation: cp.correlation,
            need_a_name: cp.need_a_name, need_b_name: cp.need_b_name,
          })),
        }
        setLatestTrace(trace)
      }

      const memText = persona.sharedMemories
        ? `\n你们之间的共同经历：${persona.sharedMemories}\n如果对方提到这些经历中的事，你要像真的经历过一样自然地回应。`
        : ''
      const askPrompt = `你正在扮演${persona.name}（${persona.tagline}）。
你的设定：${persona.backstory}
你的性格：${persona.traits.join('、')}
你的说话风格：${persona.speakingStyle}${memText}
DPU 需求分析发现对方当前最核心的需求是：${analysis.top_needs.slice(0, 3).join('、')}
请根据以上信息，用${persona.name}的口吻回复这句话："${text}"
注意：回复要符合TA的性格和说话风格，不要扮演AI助手，你就是${persona.name}本人，回复简洁自然，1-3句话`

      const aiResp = await askAI(text, analysis.activation12, askPrompt,
        analysis.top_needs, analysis.suppressed, analysis.conflicts, analysis.signals)
      const aiText = aiResp.answer || '（对方没有说话）'

      setMessages(prev => [...prev, {
        id: `ai_${mid}`, role: 'assistant', content: aiText,
        timestamp: Date.now(), dpuAnalysis: analysis, traceResult: trace || undefined,
      }])

      if (showCompare) {
        try {
          const llmOnlyResp = await askAI(text, new Array(12).fill(0.5),
            `你正在扮演${persona.name}。用TA的口吻简单回复："${text}"${persona.sharedMemories ? `\n你们之间的共同经历：${persona.sharedMemories}` : ''}`,
            [], [], [], [])
          const llmText = llmOnlyResp.answer || ''
          if (llmText && llmText !== aiText) {
            setMessages(prev => [...prev, {
              id: `llm_${mid}`, role: 'llm_only', content: llmText,
              timestamp: Date.now(), llmOnlyResponse: llmText,
            }])
          }
        } catch {}
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: `err_${mid}`, role: 'assistant',
        content: `[错误] ${err instanceof Error ? err.message : '请求失败，请检查后端是否启动'}`,
        timestamp: Date.now(),
      }])
    } finally { setLoading(false) }
  }, [input, loading, persona, latestAnalysis, showCompare])

  const handleSelectPersona = useCallback((p: NeedLabPersona) => {
    const latestAll = getAllPersonas()
    const found = latestAll.find(x => x.id === p.id)
    const merged = found || p
    setPersona(merged); setMessages([]); setLatestAnalysis(null); setLatestTrace(null)
    setPrevActivation(new Array(12).fill(0)); clearSession()
    setBackstoryExpanded(false); setShowEditor(false)
  }, [])

  const color = persona.color

  return (
    <div className="min-h-screen pt-24 pb-12 relative bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
      {/* 科技感背景光晕 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-20 left-1/4 w-[600px] h-[600px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, transparent 70%)' }} />
        <div className="absolute bottom-20 right-1/4 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(59, 130, 246, 0.08) 0%, transparent 70%)' }} />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(139, 92, 246, 0.05) 0%, transparent 70%)' }} />
      </div>

      <div className="max-w-[1600px] mx-auto px-5 relative z-10">
        {/* ========================================================== */}
        {/* 页面标题 */}
        {/* ========================================================== */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/70 backdrop-blur-sm border border-indigo-100 shadow-sm text-[11px] font-bold text-indigo-600 tracking-wide mb-3">
            <Sparkles size={12} className="text-indigo-500" /> NEEDLAB · 人格沙盘 v4.2
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight mb-1">
            <span className="text-slate-800">DPU </span>
            <span className="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 bg-clip-text text-transparent">
              人格对话沙盘
            </span>
          </h1>
          <p className="text-xs text-slate-500">选择 AI 人格开始对话，实时观察 DPU 引擎如何分析 TA 的真实需求</p>
          <div className="mt-3"><LlmStatusBadge status={llmStatus} onRefresh={refreshLlmStatus} /></div>
        </motion.div>

        {/* ========================================================== */}
        {/* 三栏主体 */}
        {/* ========================================================== */}
        <div className="flex gap-5 items-start">
          {/* 左侧：人格选择 */}
          <div className="w-[260px] flex-shrink-0">
            <div className="rounded-2xl bg-white/70 backdrop-blur-sm border border-slate-200/60 shadow-lg shadow-slate-200/40 p-4 sticky top-24">
              {/* 人格简介卡片 */}
              <div
                className="mb-4 rounded-xl border transition-all overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${color}0D, ${color}04)`,
                  borderColor: `${color}25`,
                  borderLeft: `3px solid ${color}`,
                }}
              >
                <div className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${color}20, ${color}0D)` }}>
                      <span className="text-2xl">{persona.emoji}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-800">{persona.name}</span>
                        <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold"
                          style={{ background: `${color}1A`, color }}>Lv.{persona.difficulty}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate">{persona.tagline}</div>
                    </div>
                  </div>

                  {/* 背景故事 - 可展开 */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold text-slate-500">背景设定</span>
                      <button
                        onClick={() => setBackstoryExpanded(!backstoryExpanded)}
                        className="text-[10px] font-semibold flex items-center gap-0.5 border-none bg-transparent cursor-pointer p-0"
                        style={{ color }}
                      >
                        {backstoryExpanded ? '收起' : '展开全部'}
                        {backstoryExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      </button>
                    </div>
                    <p
                      className="text-[11px] text-slate-500 leading-relaxed transition-all"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: backstoryExpanded ? 'unset' : 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >{persona.backstory}</p>
                  </div>

                  {/* 性格标签 */}
                  <div className="flex gap-1.5 flex-wrap">
                    {persona.traits.slice(0, backstoryExpanded ? undefined : 3).map(t => (
                      <span key={t} className="text-[9px] px-2 py-0.5 rounded-md bg-white/60 text-slate-500 border border-slate-100 font-medium">{t}</span>
                    ))}
                  </div>
                </div>

                {/* 共享记忆提示 */}
                {persona.sharedMemories && (
                  <div className="mx-4 mb-2 px-3 py-2 rounded-lg flex items-start gap-2"
                    style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                    <span className="text-xs mt-px">📝</span>
                    <div className="text-[9px] text-amber-700 leading-relaxed">
                      <span className="font-bold">共享记忆已注入</span> — AI 会记住你们共同的经历。编辑人设可以修改。
                    </div>
                  </div>
                )}

                {/* 操作栏 */}
                <div className="px-4 py-2.5 border-t border-slate-100/60 bg-white/30 flex items-center justify-between">
                  <button
                    onClick={() => {
                      setEditDraft({
                        name: persona.name,
                        tagline: persona.tagline,
                        backstory: persona.backstory,
                        traits: [...persona.traits],
                        speakingStyle: persona.speakingStyle,
                        sharedMemories: (persona as any).sharedMemories || '',
                      })
                      setShowEditor(true)
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border-none cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{ background: `${color}12`, color }}
                  >
                    <Settings2 size={11} /> 编辑人设
                  </button>
                  {(persona.isCustom || Object.keys(loadCustomPersonas()).includes(persona.id)) && (
                    <button
                      onClick={() => {
                        if (persona.isCustom) {
                          const updated = deleteCustomCreated(persona.id)
                          setCustomPersonas(updated)
                          setPersona(PERSONA_LIBRARY[0]); clearSession()
                          setBackstoryExpanded(false); setShowEditor(false)
                        } else {
                          const base = PERSONA_LIBRARY.find(p => p.id === persona.id)
                          if (base) { resetCustomPersona(persona.id); setPersona(base) }
                        }
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-medium border-none cursor-pointer text-rose-400 hover:text-rose-600 transition-all"
                    >
                      <Trash2 size={10} /> {persona.isCustom ? '删除' : '重置'}
                    </button>
                  )}
                </div>
              </div>

              <PersonalitySelector
                selected={persona}
                personas={allPersonas}
                onSelect={handleSelectPersona}
                onCreateNew={() => {
                  setCreateDraft(emptyPersona())
                  setShowCreator(true)
                }}
                onDeleteCustom={(id) => {
                  const updated = deleteCustomCreated(id)
                  setCustomPersonas(updated)
                  if (persona.id === id) {
                    setPersona(PERSONA_LIBRARY[0])
                    clearSession()
                  }
                }}
              />
            </div>
          </div>

          {/* 中间：对话区 */}
          <div className="flex-1 min-w-0 rounded-2xl bg-white/70 backdrop-blur-sm border border-slate-200/60 shadow-lg shadow-slate-200/40 overflow-hidden flex flex-col">
            {/* 顶栏 */}
            <div className="px-5 py-3 border-b border-slate-100/80 flex items-center gap-3"
              style={{ background: `linear-gradient(90deg, ${color}08, transparent)` }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${color}1A, ${color}0D)` }}>
                <span className="text-base">{persona.emoji}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-700">与 {persona.name} 对话</div>
                <div className="text-[10px] text-slate-400">DPU 实时分析 · 需求势能引擎</div>
              </div>
              {messages.length > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-[10px] text-slate-500 font-semibold">
                  {messages.length} 条消息
                </span>
              )}
            </div>

            {/* 消息列表 */}
            <div className="h-[560px] overflow-y-auto px-5 py-4 flex flex-col gap-3.5 scrollbar-hide">
              {messages.length === 0 && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center py-12">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${color}15, ${color}08)` }}>
                      <span className="text-4xl">{persona.emoji}</span>
                    </div>
                    <p className="text-slate-600 text-sm font-medium">来和 {persona.name} 说点什么吧</p>
                    <p className="text-slate-400 text-xs mt-1.5">发送消息后 DPU 引擎实时分析需求信号</p>
                    {showCompare && (
                      <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-50 to-blue-50 text-[10px] text-indigo-600 font-semibold border border-indigo-100">
                        <Info size={11} /> 对比模式已开启
                      </div>
                    )}
                  </div>
                </div>
              )}
              <AnimatePresence>
                {messages.map(msg => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    {/* 气泡 */}
                    <div
                      className="max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm"
                      style={{
                        background: msg.role === 'user'
                          ? `linear-gradient(135deg, ${color}1A, ${color}0D)`
                          : msg.role === 'llm_only'
                            ? 'linear-gradient(135deg, #fef2f2, #fef2f2)'
                            : 'linear-gradient(135deg, #f8fafc, #ffffff)',
                        border: msg.role === 'user'
                          ? `1px solid ${color}25`
                          : msg.role === 'llm_only'
                            ? '1px solid #fecaca'
                            : '1px solid #e2e8f0',
                        borderBottomRightRadius: msg.role === 'user' ? 8 : 16,
                        borderBottomLeftRadius: msg.role !== 'user' ? 8 : 16,
                      }}
                    >
                      {msg.role === 'llm_only' && (
                        <div className="flex items-center gap-1.5 mb-1 text-[10px] text-rose-500 font-bold">
                          <Bot size={11} /> 纯 LLM（无 DPU）
                        </div>
                      )}
                      {msg.role === 'assistant' && (
                        <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold" style={{ color }}>
                          <Sparkles size={11} /> {persona.name} + DPU
                        </div>
                      )}
                      <div className="text-slate-700 whitespace-pre-wrap">{msg.content}</div>
                    </div>

                    {/* DPU 分析卡片 */}
                    {msg.dpuAnalysis && msg.dpuAnalysis.top_needs.length > 0 && (
                      <div className="mt-1.5 px-3 py-2 rounded-xl max-w-[85%] bg-gradient-to-r from-indigo-50/80 to-blue-50/60 border border-indigo-100/80 text-xs shadow-sm">
                        <button
                          onClick={() => setExpandedMsg(expandedMsg === msg.id ? null : msg.id)}
                          className="flex items-center gap-1.5 w-full border-none bg-transparent cursor-pointer text-indigo-600 font-bold text-[11px] p-0"
                        >
                          <div className="w-4.5 h-4.5 rounded-md bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center">
                            <Zap size={9} className="text-white" />
                          </div>
                          DPU 诊断: {msg.dpuAnalysis.top_needs.slice(0, 2).join(' · ')}
                          <ChevronDown size={11} style={{
                            transform: expandedMsg === msg.id ? 'rotate(180deg)' : undefined,
                            transition: 'transform 0.2s', marginLeft: 'auto',
                          }} />
                        </button>
                        {expandedMsg === msg.id && (
                          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} className="mt-2 overflow-hidden">
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {msg.dpuAnalysis.top_needs.map(n => (
                                <span key={n} className="px-2 py-0.5 rounded-md bg-gradient-to-r from-indigo-100 to-blue-100 text-indigo-700 text-[10px] font-bold border border-indigo-200/50">{n}</span>
                              ))}
                            </div>
                            {(msg.dpuAnalysis.suppressed || []).length > 0 && <div className="text-slate-600 mb-1">⬇ 被压制：{(msg.dpuAnalysis.suppressed || []).join('、')}</div>}
                            {(msg.dpuAnalysis.conflicts || []).length > 0 && <div className="text-amber-600 mb-1 font-medium">⚡ 冲突：{(msg.dpuAnalysis.conflicts || []).slice(0, 3).join('、')}</div>}
                            <div className="text-slate-400 mt-1">信号词：{(msg.dpuAnalysis.signals || []).slice(0, 5).join(', ') || '无'}</div>
                          </motion.div>
                        )}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {loading && (
                <div className="flex items-center gap-2.5 px-1 py-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: `linear-gradient(135deg, ${color}15, ${color}08)` }}>
                    <span className="text-sm">{persona.emoji}</span>
                  </div>
                  <div className="flex gap-1.5">
                    {[0,1,2].map(i => (
                      <motion.div key={i} animate={{ y: [0,-5,0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i*0.12 }}
                        className="w-1.5 h-1.5 rounded-full" style={{
                          background: `linear-gradient(135deg, ${color}, ${color}aa)`,
                          boxShadow: `0 0 6px ${color}40`,
                        }} />
                    ))}
                  </div>
                  <span className="text-xs text-slate-400 font-medium">DPU 分析中...</span>
                </div>
              )}
              <div ref={bottomRef as any} />
            </div>

            {/* 输入区 */}
            <div className="px-4 py-3 border-t border-slate-100/80 flex gap-2.5 bg-slate-50/50">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder={`跟 ${persona.name} 说点什么...`}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 font-sans transition-all"
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="px-5 py-2.5 rounded-xl border-none text-sm font-bold text-white transition-all flex-shrink-0 hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: input.trim() && !loading
                    ? `linear-gradient(135deg, ${persona.gradientFrom}, ${persona.gradientTo})`
                    : '#e2e8f0',
                  color: input.trim() && !loading ? '#fff' : '#94a3b8',
                  cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                  boxShadow: input.trim() && !loading
                    ? `0 4px 12px -4px ${persona.gradientFrom}80`
                    : 'none',
                }}
              >发送</button>
            </div>
          </div>

          {/* 右侧：DPU 实时分析（更宽） */}
          <div className="w-[360px] flex-shrink-0">
            <AnalysisPanel
              persona={persona}
              analysis={latestAnalysis}
              trace={latestTrace}
              prevActivation={prevActivation}
              showCompare={showCompare}
              onToggleCompare={() => setShowCompare(!showCompare)}
            />
          </div>
        </div>
      </div>

      {/* 编辑人设弹窗 */}
      <AnimatePresence>
        {showEditor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowEditor(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden"
            >
              {/* 弹窗头部 */}
              <div className="px-5 py-4 border-b border-slate-100"
                style={{ background: `linear-gradient(135deg, ${color}0D, ${color}04)` }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `linear-gradient(135deg, ${color}25, ${color}15)` }}>
                    <span className="text-xl">{persona.emoji}</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-slate-800">编辑 {persona.name} 的人设</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">修改后会直接影响TA的回复风格</p>
                  </div>
                  {Object.keys(loadCustomPersonas()).includes(persona.id) && (
                    <button
                      onClick={() => {
                        const base = PERSONA_LIBRARY.find(p => p.id === persona.id)
                        if (base) {
                          resetCustomPersona(persona.id)
                          setPersona(base)
                          setShowEditor(false)
                        }
                      }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center border-none cursor-pointer transition-all hover:scale-110 group relative"
                      style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
                      title="恢复默认人设"
                    >
                      <RotateCcw size={15} />
                      <span className="absolute -bottom-8 right-0 text-[10px] bg-slate-800 text-white px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        恢复默认
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* 表单 */}
              <div className="px-5 py-4 max-h-[60vh] overflow-y-auto space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1.5">名字</label>
                  <input
                    type="text"
                    value={editDraft.name || ''}
                    onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1.5">一句话描述</label>
                  <input
                    type="text"
                    value={editDraft.tagline || ''}
                    onChange={e => setEditDraft(d => ({ ...d, tagline: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 transition-all"
                    placeholder="如：嘴硬心软的傲娇前任"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                    背景故事
                    <span className="text-slate-400 font-normal ml-1">（会注入大模型上下文）</span>
                  </label>
                  <textarea
                    value={editDraft.backstory || ''}
                    onChange={e => setEditDraft(d => ({ ...d, backstory: e.target.value }))}
                    rows={4}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 transition-all resize-none font-sans"
                    placeholder="描述TA的背景、经历、和你的关系..."
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                    性格标签
                    <span className="text-slate-400 font-normal ml-1">（用顿号、或逗号分隔）</span>
                  </label>
                  <input
                    type="text"
                    value={(editDraft.traits || []).join('、')}
                    onChange={e => {
                      const parts = e.target.value.split(/[、,，]/).filter(Boolean)
                      setEditDraft(d => ({ ...d, traits: parts }))
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 transition-all"
                    placeholder="如：大大咧咧、嘴比心快、傲娇"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                    说话风格
                    <span className="text-slate-400 font-normal ml-1">（影响回复语气）</span>
                  </label>
                  <textarea
                    value={editDraft.speakingStyle || ''}
                    onChange={e => setEditDraft(d => ({ ...d, speakingStyle: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 transition-all resize-none font-sans"
                    placeholder="描述TA怎么说话，比如语速、口头禅、语气..."
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                    共享记忆
                    <span className="text-slate-400 font-normal ml-1">（你们之间的共同经历、TA曾经说过的话）</span>
                  </label>
                  <textarea
                    value={editDraft.sharedMemories || ''}
                    onChange={e => setEditDraft(d => ({ ...d, sharedMemories: e.target.value }))}
                    rows={4}
                    className="w-full px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-sm text-slate-700 outline-none focus:border-amber-300 focus:ring-4 focus:ring-amber-100 transition-all resize-none font-sans"
                    placeholder={`例如：
- TA曾经说过"你总是不认真听我说话"
- 你们第一次约会去了海洋馆
- TA最讨厌你说"随便"
- 上次吵架是因为你忘了纪念日`}
                  />
                  <div className="text-[9px] text-amber-600 mt-1.5 flex items-start gap-1">
                    <Info size={10} className="mt-0.5 flex-shrink-0" />
                    输入 TA 说过的原话或你们共同的经历。当你在对话中提到这些事，AI 会像真的经历过一样回应。
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/60">
                  <div className="text-[10px] font-bold text-emerald-700 mb-1 flex items-center gap-1.5">
                    <Info size={11} /> 放心改，原始设定永远不会丢
                  </div>
                  <p className="text-[10px] text-emerald-600 leading-relaxed">
                    你的修改只保存在本地浏览器，原始人设永远在代码里。改乱了点右上角 <RotateCcw size={10} className="inline" /> 就能一键还原。
                  </p>
                </div>
              </div>

              {/* 底部按钮 */}
              <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center gap-2.5">
                <button
                  onClick={() => setShowEditor(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-semibold cursor-pointer transition-all hover:bg-slate-50"
                >取消</button>
                <button
                  onClick={() => {
                    if (editDraft.name || editDraft.backstory) {
                      const changes: Partial<NeedLabPersona> = { ...editDraft }
                      if (!changes.traits?.length) delete changes.traits
                      if (!changes.sharedMemories) changes.sharedMemories = undefined as any
                      if (persona.isCustom) {
                        // 完全自定义人格：直接更新并保存到 created store
                        const merged: NeedLabPersona = { ...persona, ...changes }
                        const all = loadCustomCreated().filter(p => p.id !== persona.id)
                        all.push(merged)
                        saveCustomCreated(all)
                        setCustomPersonas(all.filter(p => p.isCustom))
                        setPersona(merged)
                      } else {
                        saveCustomPersona(persona.id, changes)
                        const base = PERSONA_LIBRARY.find(p => p.id === persona.id) || persona
                        const merged = mergePersona(base, { ...loadCustomPersonas()[persona.id] })
                        setPersona(merged)
                      }
                      setShowEditor(false)
                    }
                  }}
                  className="flex-1 py-2.5 rounded-xl border-none text-white text-sm font-bold cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-1.5"
                  style={{
                    background: `linear-gradient(135deg, ${persona.gradientFrom}, ${persona.gradientTo})`,
                    boxShadow: `0 4px 12px -4px ${persona.gradientFrom}80`,
                  }}
                >
                  <Save size={13} /> 保存人设
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============================================================ */}
      {/* 创建自定义人格弹窗 */}
      {/* ============================================================ */}
      <AnimatePresence>
        {showCreator && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowCreator(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden"
            >
              {/* 头部 */}
              <div className="px-5 py-4 border-b border-slate-100"
                style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.03))' }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl"
                    style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.1))' }}>
                    {createDraft.emoji || '🧑'}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-slate-800">创建自定义人格</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">把你想对话的人"复制"进 AI</p>
                  </div>
                </div>
              </div>

              {/* 表单 */}
              <div className="px-5 py-4 max-h-[60vh] overflow-y-auto space-y-4">
                {/* emoji + 名字 并排 */}
                <div className="flex gap-3">
                  <div className="w-[60px] flex-shrink-0">
                    <label className="block text-[11px] font-bold text-slate-600 mb-1.5">头像</label>
                    <input type="text" value={createDraft.emoji || ''}
                      onChange={e => setCreateDraft(d => ({ ...d, emoji: e.target.value }))}
                      className="w-full px-2 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xl text-center outline-none focus:border-indigo-300 font-sans"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[11px] font-bold text-slate-600 mb-1.5">名字</label>
                    <input type="text" value={createDraft.name || ''}
                      onChange={e => setCreateDraft(d => ({ ...d, name: e.target.value }))}
                      placeholder="如：小美、王总、爸爸"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 outline-none focus:border-indigo-300"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-[11px] font-bold text-slate-600 mb-1.5">一句话描述</label>
                    <input type="text" value={createDraft.tagline || ''}
                      onChange={e => setCreateDraft(d => ({ ...d, tagline: e.target.value }))}
                      placeholder="如：嘴硬心软的前任"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 outline-none focus:border-indigo-300"
                    />
                  </div>
                  <div className="w-[100px]">
                    <label className="block text-[11px] font-bold text-slate-600 mb-1.5">难易度</label>
                    <div className="flex gap-1">
                      {[1,2,3].map(lv => (
                        <button key={lv} onClick={() => setCreateDraft(d => ({ ...d, difficulty: lv as 1|2|3 }))}
                          className="flex-1 py-2.5 rounded-lg border-none cursor-pointer text-xs font-bold transition-all"
                          style={{
                            background: createDraft.difficulty === lv ? '#6366f1' : '#f1f5f9',
                            color: createDraft.difficulty === lv ? '#fff' : '#94a3b8',
                          }}
                        >{lv}</button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1.5">背景设定</label>
                  <textarea value={createDraft.backstory || ''}
                    onChange={e => setCreateDraft(d => ({ ...d, backstory: e.target.value }))}
                    rows={3} placeholder="TA是谁？你们什么关系？TA经历了什么？"
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 outline-none focus:border-indigo-300 resize-none font-sans"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                    性格标签 <span className="text-slate-400 font-normal">（顿号分隔）</span>
                  </label>
                  <input type="text"
                    value={(createDraft.traits || []).join('、')}
                    onChange={e => setCreateDraft(d => ({ ...d, traits: e.target.value.split(/[、,，]/).filter(Boolean) }))}
                    placeholder="傲娇、嘴硬心软、大大咧咧"
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 outline-none focus:border-indigo-300"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1.5">说话风格</label>
                  <input type="text" value={createDraft.speakingStyle || ''}
                    onChange={e => setCreateDraft(d => ({ ...d, speakingStyle: e.target.value }))}
                    placeholder="尖刻直接、爱用反问句、急了会说方言"
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 outline-none focus:border-indigo-300"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                    共享记忆 <span className="text-slate-400 font-normal">（你们的共同经历、TA说过的原话）</span>
                  </label>
                  <textarea value={createDraft.sharedMemories || ''}
                    onChange={e => setCreateDraft(d => ({ ...d, sharedMemories: e.target.value }))}
                    rows={3} placeholder={`- TA说过"你总是不认真听我说话"\n- 第一次约会去了海洋馆\n- TA最讨厌你说"随便"`}
                    className="w-full px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-sm text-slate-700 outline-none focus:border-amber-300 resize-none font-sans"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1.5">主题色</label>
                  <div className="flex gap-2">
                    {['#6366f1','#ec4899','#f97316','#0ea5e9','#84cc16','#f59e0b','#14b8a6','#ef4444'].map(c => (
                      <button key={c} onClick={() => setCreateDraft(d => ({ ...d, color: c, gradientFrom: c, gradientTo: c }))}
                        className="w-8 h-8 rounded-full border-2 transition-all"
                        style={{
                          background: c,
                          borderColor: createDraft.color === c ? '#1e293b' : 'transparent',
                          boxShadow: createDraft.color === c ? '0 0 0 2px white, 0 0 0 4px ' + c : 'none',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* 底栏 */}
              <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center gap-2.5">
                <button onClick={() => setShowCreator(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-semibold cursor-pointer"
                >取消</button>
                <button
                  onClick={() => {
                    if (!createDraft.name?.trim()) return
                    const p: NeedLabPersona = {
                      ...createDraft,
                      id: `custom_${Date.now()}`,
                      name: createDraft.name.trim(),
                      isCustom: true,
                    }
                    const all = loadCustomCreated()
                    all.unshift(p)
                    saveCustomCreated(all)
                    setCustomPersonas(all.filter(x => x.isCustom))
                    setPersona(p); clearSession()
                    setMessages([]); setLatestAnalysis(null); setLatestTrace(null)
                    setShowCreator(false); setBackstoryExpanded(false)
                  }}
                  className="flex-1 py-2.5 rounded-xl border-none text-white text-sm font-bold cursor-pointer flex items-center justify-center gap-1.5"
                  style={{
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    boxShadow: '0 4px 12px -4px rgba(99,102,241,0.5)',
                  }}
                >
                  <Plus size={13} /> 创建人格
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
