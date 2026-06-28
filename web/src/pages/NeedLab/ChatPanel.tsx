// ============================================================
// 聊天面板 — 亮色调科技风
// ============================================================
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Bot, User, Sparkles, ChevronDown, ChevronUp, Brain } from 'lucide-react'
import type { NeedLabMessage, NeedLabPersona, DpuAnalysisResult, DpuTraceResult } from './types'

interface Props {
  persona: NeedLabPersona
  messages: NeedLabMessage[]
  onSend: (text: string) => void
  loading: boolean
  accentColor: string
}

export function ChatPanel({ persona, messages, onSend, loading, accentColor }: Props) {
  const [input, setInput] = useState('')
  const [expandedMsg, setExpandedMsg] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const handleSend = () => {
    if (!input.trim() || loading) return
    const t = input.trim(); setInput(''); onSend(t)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部人格状态 */}
      <div
        className="px-4 py-3 flex items-center gap-3 border-b border-slate-100"
        style={{ background: `linear-gradient(90deg, ${persona.color}0A, transparent)` }}
      >
        <span className="text-2xl">{persona.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-800">正在和 {persona.name} 对话</div>
          <div className="text-xs text-slate-400 truncate">{persona.speakingStyle.slice(0, 36)}...</div>
        </div>
        <span
          className="px-2.5 py-1 rounded-full text-[10px] font-semibold"
          style={{ background: `${persona.color}14`, color: persona.color }}
        >Lv.{persona.difficulty}</span>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <span className="text-5xl">{persona.emoji}</span>
            <p className="text-slate-500 text-sm mt-3">来和 {persona.name} 说点什么吧</p>
            <p className="text-slate-400 text-xs mt-1">发送第一条消息，看看 DPU 如何分析 TA 的真实需求</p>
          </div>
        )}
        <AnimatePresence>
          {messages.map(msg => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              {/* 气泡 */}
              <div
                className="max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
                style={{
                  background: msg.role === 'user'
                    ? `linear-gradient(135deg, ${persona.color}18, ${persona.color}0C)`
                    : msg.role === 'llm_only'
                      ? '#f1f5f9'
                      : '#ffffff',
                  border: msg.role === 'user'
                    ? `1px solid ${persona.color}22`
                    : msg.role === 'llm_only'
                      ? '1px solid #e2e8f0'
                      : '1px solid #e8ecf1',
                  borderBottomRightRadius: msg.role === 'user' ? 6 : 16,
                  borderBottomLeftRadius: msg.role !== 'user' ? 6 : 16,
                }}
              >
                {/* 标签 */}
                {msg.role === 'llm_only' && (
                  <div className="flex items-center gap-1.5 mb-1 text-[10px] text-slate-400">
                    <Bot size={10} /> 纯 LLM（无 DPU）
                  </div>
                )}
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-1.5 mb-1 text-[10px] font-semibold" style={{ color: persona.color }}>
                    <Brain size={10} /> {persona.name} + DPU
                  </div>
                )}
                <div className="text-slate-700 whitespace-pre-wrap">{msg.content}</div>
              </div>

              {/* DPU 分析卡片 */}
              {msg.dpuAnalysis && msg.dpuAnalysis.top_needs.length > 0 && (
                <div className="mt-2 px-3 py-2 rounded-xl max-w-[80%] text-xs border border-indigo-100 bg-indigo-50/60">
                  <button
                    onClick={() => setExpandedMsg(expandedMsg === msg.id ? null : msg.id)}
                    className="flex items-center gap-1.5 w-full border-none bg-transparent cursor-pointer text-indigo-600 font-semibold text-[11px] p-0"
                  >
                    <Sparkles size={11} />
                    DPU 分析：{msg.dpuAnalysis.top_needs.slice(0, 2).join(' · ')}
                    {expandedMsg === msg.id ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  </button>
                  {expandedMsg === msg.id && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mt-2 overflow-hidden">
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {msg.dpuAnalysis.top_needs.map(n => (
                          <span key={n} className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-600 text-[10px] font-semibold">{n}</span>
                        ))}
                      </div>
                      {(msg.dpuAnalysis.suppressed || []).length > 0 && (
                        <div className="text-slate-500 mb-1">⬇ 被压制：{(msg.dpuAnalysis.suppressed || []).join('、')}</div>
                      )}
                      {(msg.dpuAnalysis.conflicts || []).length > 0 && (
                        <div className="text-amber-600 mb-1">⚡ 冲突：{(msg.dpuAnalysis.conflicts || []).slice(0, 3).join('、')}</div>
                      )}
                      <div className="text-slate-400 mt-1">信号词：{(msg.dpuAnalysis.signals || []).slice(0, 3).join(', ') || '无'}</div>
                    </motion.div>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* 加载 */}
        {loading && (
          <div className="flex items-center gap-2 px-1 py-2">
            <span className="text-xl">{persona.emoji}</span>
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <motion.div key={i} animate={{ y: [0, -5, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.12 }}
                  className="w-1.5 h-1.5 rounded-full" style={{ background: persona.color }} />
              ))}
            </div>
            <span className="text-xs text-slate-400">DPU 分析中...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 输入区 */}
      <div className="px-4 py-3 border-t border-slate-100 flex gap-2 items-end">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`跟 ${persona.name} 说点什么...`}
          rows={2}
          className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-sm resize-none outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 font-sans transition-all"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="w-10 h-10 rounded-xl border-none flex items-center justify-center flex-shrink-0 transition-all"
          style={{
            background: input.trim() && !loading ? `linear-gradient(135deg, ${persona.gradientFrom}, ${persona.gradientTo})` : '#f1f5f9',
            color: input.trim() && !loading ? '#fff' : '#94a3b8',
            cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
          }}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  )
}
