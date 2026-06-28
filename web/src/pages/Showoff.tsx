import { useState, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactECharts from 'echarts-for-react'
import {
  MessageSquare, Brain, BarChart3, Zap, Plus, Trash2, Send,
  ChevronRight, ChevronDown, ChevronLeft, User, Users, BookOpen, Sparkles,
  Camera, Upload, Edit3, Check, X, AlertTriangle, Lightbulb,
  Target, ArrowRight, FileText, Download, RefreshCw, Copy,
  AlertCircle, MessageCircle, TrendingUp, Image, Eye, Wand2,
  Crown, Star, Flame, Heart, ThumbsUp, Share2, Settings,
  Palette, Sparkles as SparklesIcon
} from 'lucide-react'
import { chatWithModel, loadModelConfig, extractDialogueFromImage, type ChatTurn } from '../lib/llm'
import { useLlmStatus, LlmStatusBadge } from '@/components/LlmStatusBadge'

// ========== 轻量 Markdown 渲染（支持表格 + 段落 + 列表）==========
function renderMarkdown(raw: string): JSX.Element[] {
  const cleaned = raw.trim()
  const lines = cleaned.split('\n')
  const result: JSX.Element[] = []
  let i = 0
  let blockKey = 0

  while (i < lines.length) {
    const line = lines[i]

    // Empty line
    if (line.trim() === '') { i++; continue }

    // Horizontal rule
    if (/^-{3,}$/.test(line.trim())) {
      result.push(<hr key={blockKey++} className="my-3 border-slate-200" />)
      i++; continue
    }

    // Heading
    if (line.startsWith('### ')) {
      result.push(<h3 key={blockKey++} className="text-sm font-black text-purple-800 mt-4 mb-2">{line.replace('### ', '')}</h3>)
      i++; continue
    }
    if (line.startsWith('## ')) {
      result.push(<h2 key={blockKey++} className="text-base font-black text-slate-900 mt-4 mb-2 border-l-4 border-purple-500 pl-3">{line.replace('## ', '')}</h2>)
      i++; continue
    }

    // Bold title on its own line
    if (line.startsWith('**') && line.endsWith('**')) {
      result.push(<p key={blockKey++} className="font-bold text-purple-700 text-xs mt-3 mb-1">{line.replace(/\*\*/g, '')}</p>)
      i++; continue
    }

    // Table detection (contains | and next line is separator or also has |)
    if (line.includes('|') && (line.trim().startsWith('|') || (line.match(/\|/g) || []).length >= 2)) {
      const tableRows: string[] = []
      while (i < lines.length && (lines[i].includes('|') || lines[i].trim() === '')) {
        if (lines[i].trim() !== '') tableRows.push(lines[i])
        i++
        if (tableRows.length > 0 && !lines[i]?.includes('|')) break
      }
      const dataRows = tableRows.filter(r => !/^:?-{3,}:?(\|:?-{3,}:?)*$/.test(r.replace(/\s/g, '')))
      if (dataRows.length > 0) {
        const [header, ...body] = dataRows.map(r =>
          r.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
        )
        result.push(
          <div key={blockKey++} className="my-2 overflow-x-auto">
            <table className="text-[10px] border-collapse w-full">
              {header && (
                <thead>
                  <tr>
                    {header.map((h, j) => (
                      <th key={j} className="border border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50 text-slate-800 px-2 py-1.5 text-left font-bold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {body.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? 'bg-white/60' : 'bg-purple-50/40'}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="border border-purple-100 px-2 py-1.5 align-top leading-relaxed text-slate-600">{inlineFormat(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      continue
    }

    // List items
    if (line.trim().startsWith('- ') || /^\d+\.\s/.test(line.trim())) {
      const listItems: string[] = []
      while (i < lines.length) {
        const li = lines[i].trim()
        if (li.startsWith('- ') || /^\d+\./.test(li)) {
          listItems.push(li.replace(/^[\d.-]+\s*/, ''))
          i++
        } else if (li === '') { i++; break }
        else { break }
      }
      result.push(
        <ul key={blockKey++} className="space-y-0.5 mt-1 mb-2">
          {listItems.map((item, j) => (
            <li key={j} className="text-[11px] text-slate-600 ml-4 flex gap-1">
              <span className="text-purple-400 flex-shrink-0">▸</span>
              <span>{inlineFormat(item)}</span>
            </li>
          ))}
        </ul>
      )
      continue
    }

    // Normal paragraph
    const paraLines: string[] = []
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#')) {
      paraLines.push(lines[i])
      i++
    }
    const paraText = paraLines.join('\n')
    result.push(
      <p key={blockKey++} className="text-xs text-slate-700 mb-1.5 leading-relaxed">{inlineFormat(paraText)}</p>
    )
  }

  return result
}

function inlineFormat(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = []
  // Bold
  let remaining = text
  let key = 0
  while (remaining) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
    const quoteMatch = remaining.match(/「(.+?)」/)
    const codeMatch = remaining.match(/`(.+?)`/)
    const matches = [boldMatch, quoteMatch, codeMatch].filter(Boolean) as RegExpMatchArray[]
    if (matches.length === 0) { parts.push(remaining); break }
    const earliest = matches.reduce((a, b) => (a.index! < b.index!) ? a : b)
    if (earliest.index! > 0) parts.push(remaining.slice(0, earliest.index))
    if (earliest === boldMatch) {
      parts.push(<strong key={key++} className="font-black text-purple-800">{boldMatch![1]}</strong>)
    } else if (earliest === quoteMatch) {
      parts.push(<span key={key++} className="text-amber-700 italic bg-amber-50 rounded px-0.5">「{quoteMatch![1]}」</span>)
    } else if (earliest === codeMatch) {
      parts.push(<code key={key++} className="bg-slate-100 text-pink-600 rounded px-1 text-[10px]">{codeMatch![1]}</code>)
    }
    remaining = remaining.slice(earliest.index! + earliest[0].length)
  }
  return parts
}

import {
  analyzeText, analyzeRole,
  DPU_NEEDS, BRAGGING_PERSONALITY_TYPES,
  SIGNAL_PATTERNS, SHOWOFF_EMOJIS,
  NEGATIVE_PATTERNS, NEGATIVE_EMOJIS,
  colorForBragIndex, summarizeSignals,
  type BraggingPersonality, type NegativeHit, type SignalHit, type DpuRoleAnalysis
} from '../lib/dpuEngine'

// ========== DPU 需求 · 与引擎保持一致 ==========
const SHOWOFF_NEEDS = DPU_NEEDS.map(n => ({
  id: n.id, name: n.name, name_en: n.id, color: n.color,
  desc: (n as any).description || n.name
}))

// ========== 单条消息分析（复用 DPU analyzeText，返回 Showoff 原生格式） ==========
interface MessageScore {
  textScore: number; emojiScore: number; imageScore: number
  baseScore: number; compositeMultiplier: number; score: number
  signals: SignalHit[]
  emojiHits: { emoji: string; name: string; score: number; need: string }[]
  hasImageContent: boolean; hasReverseBrag: boolean
  compositeReason: string
  needContinuousNumber: number
  negativeHitCount: number
  negativeHits: NegativeHit[]
  isNegativeDominated: boolean
  // 与 DPU 对齐的扩展字段
  needDistribution: Record<string, number>
  dominantMood: string
}

function scoreMessage(text: string): MessageScore {
  const dpu = analyzeText(text)
  return {
    textScore: dpu.textScore, emojiScore: dpu.emojiScore, imageScore: dpu.imageScore,
    baseScore: dpu.baseScore, compositeMultiplier: dpu.compositeMultiplier, score: dpu.score,
    signals: dpu.signals.map(s => ({
      pattern: s.pattern, patternName: s.patternName, need: s.need, color: s.color,
      reason: s.reason, baseScore: s.baseScore, matchedKeyword: s.matchedKeyword,
      adjustedScore: s.adjustedScore
    })),
    emojiHits: dpu.emojiHits,
    hasImageContent: dpu.hasImageContent, hasReverseBrag: dpu.hasReverseBrag,
    compositeReason: '', needContinuousNumber: 0,
    negativeHitCount: dpu.negativeIntensity, negativeHits: dpu.negativeHits,
    isNegativeDominated: dpu.isNegativeDominated,
    needDistribution: dpu.needDistribution,
    dominantMood: dpu.dominantMood
  }
}

// ========== Showoff 页面用的"角色分析"格式 ==========
interface RoleAnalysis {
  roleId: string
  roleName: string
  messageCount: number
  finalIndex: number               // 装逼指数 0-100
  finalLevel: string               // 人类可读等级
  needDistribution: Record<string, number>
  detectedPatterns: Array<{ name: string; count: number; color: string }>
  bragPatternMap: Record<string, { name: string; count: number; score: number; color: string }>
  topEvidence: Array<{ quote: string; score: number; reason: string; need: string; color: string; composite: string }>
  personality: BraggingPersonality // 推断的人格类型
  isBragDominated: boolean         // 是否装逼主导（false 时走情绪分析）
  isNegativeDominated: boolean     // 旧字段（兼容）
  dominantMood: string
  dominantMoodColor: string
  negativeEvidence: Array<{ quote: string; type: string; name: string; keywords: string[] }>
  totalNegativeIntensity: number
  streakLength: number             // 最长连续装逼长度（DPO 兼容字段）
  dpu: DpuRoleAnalysis             // 完整原始 DPU 结果
}

function analyzeRoles(messages: Array<{ text: string; roleName?: string; roleId?: string }>,
                      rolesList?: Array<Role | { id: string; name: string; messageCount: number }>): RoleAnalysis[] {
  if (messages.length === 0) return []
  // 如果没有传入角色列表，就当作一个整体角色
  const roles = rolesList && rolesList.length > 0
    ? rolesList.map(r => ({ id: r.id, name: r.name }))
    : [{ id: 'default', name: messages[0].roleName || '说话人' }]

  return roles.map(role => {
    const msgs = rolesList
      ? messages.filter(m => m.roleId === role.id).map(m => m.text)
      : messages.map(m => m.text)
    const dpu = analyzeRole(role.name, msgs)

    const signals = summarizeSignals(dpu, 6)
    const bragPatternMap: Record<string, { name: string; count: number; score: number; color: string }> = {}
    const detectedPatterns: Array<{ name: string; count: number; color: string }> = []
    for (const s of signals) {
      bragPatternMap[s.type] = { name: s.name, count: s.count, score: s.totalAdjustedScore, color: s.color }
      detectedPatterns.push({ name: s.name, count: s.count, color: s.color })
    }

    // 构造"证据"列表（取前几条消息的摘要）
    const topEvidence: RoleAnalysis['topEvidence'] = []
    for (const m of msgs.slice(0, 5)) {
      const sm = analyzeText(m)
      if (sm.signals.length > 0) {
        const s = sm.signals[0]
        topEvidence.push({
          quote: m.length > 40 ? m.slice(0, 40) + '…' : m,
          score: Math.round(s.adjustedScore),
          reason: s.reason, need: s.need, color: s.color,
          composite: sm.compositeMultiplier > 1.05 ? `×${sm.compositeMultiplier.toFixed(2)}` : ''
        })
      }
    }

    // 聚合负面情绪证据（按类型聚合，给 UI 展示用）
    const negTypeMap = new Map<string, { name: string; keywords: string[]; quote: string }>()
    let firstQuote = ''
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i]
      const sm = analyzeText(m)
      if (sm.negativeHits.length > 0 && !firstQuote) firstQuote = m.length > 40 ? m.slice(0, 40) + '…' : m
      for (const h of sm.negativeHits) {
        const entry = negTypeMap.get(h.type)
        if (entry) {
          if (entry.keywords.length < 5 && !entry.keywords.includes(h.keyword)) entry.keywords.push(h.keyword)
        } else {
          negTypeMap.set(h.type, { name: h.name, keywords: [h.keyword], quote: m.length > 40 ? m.slice(0, 40) + '…' : m })
        }
      }
    }
    const negativeEvidence: RoleAnalysis['negativeEvidence'] = Array.from(negTypeMap.values()).slice(0, 6).map(entry => ({
      quote: entry.quote, type: entry.name, name: entry.name, keywords: entry.keywords.slice(0, 5)
    }))
    // 如果没有基于消息抓到的负面，但 dpu 有摘要，用摘要作为保底
    if (negativeEvidence.length === 0 && dpu.negativeSummary.hits.length > 0) {
      const backMap = new Map<string, { name: string; keywords: string[] }>()
      for (const h of dpu.negativeSummary.hits) {
        const entry = backMap.get(h.type)
        if (entry) {
          if (entry.keywords.length < 5 && !entry.keywords.includes(h.keyword)) entry.keywords.push(h.keyword)
        } else {
          backMap.set(h.type, { name: h.name, keywords: [h.keyword] })
        }
      }
      for (const entry of Array.from(backMap.values()).slice(0, 6)) {
        negativeEvidence.push({ quote: firstQuote || entry.name, type: entry.name, name: entry.name, keywords: entry.keywords.slice(0, 5) })
      }
    }

    const personality = dpu.personality || BRAGGING_PERSONALITY_TYPES[BRAGGING_PERSONALITY_TYPES.length - 1]
    return {
      roleId: role.id, roleName: dpu.roleName, messageCount: dpu.messageCount,
      finalIndex: dpu.bragIndex,
      finalLevel: dpu.bragLevel,
      needDistribution: dpu.needDistribution,
      detectedPatterns,
      bragPatternMap,
      topEvidence,
      personality,
      isBragDominated: dpu.isBragDominated,
      isNegativeDominated: !dpu.isBragDominated && dpu.negativeSummary.totalIntensity >= 1.5,
      dominantMood: dpu.dominantMood,
      dominantMoodColor: dpu.dominantMoodColor,
      negativeEvidence,
      totalNegativeIntensity: dpu.negativeSummary.totalIntensity,
      streakLength: 0,
      dpu
    }
  })
}
// ===== 组件头部：hooks + handlers =====

const SCENES: Array<{ key: string; label: string; color: string }> = []

// ========== 角色类型 ==========
interface Role {
  id: string
  name: string
  avatar: string
  color: string
  relation: string
}

const AVATARS = ['👤', '👨', '👩', '👨‍💼', '👩‍💼', '👻', '🤖', '🐱', '🐶', '🦄']
const ROLE_COLORS = ['#EF4444', '#F97316', '#F59E0B', '#84CC16', '#22C55E', '#14B8A6', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#EC4899']

// ========== 对话消息类型 ==========
interface DialogueMessage {
  id: number
  roleId: string
  text: string
  timestamp?: string
  showoffScore?: number
  showoffType?: string
}

// ========== 分析结果类型 ==========
interface AnalysisResult {
  roles: RoleAnalysis[]
  selectedRoleId: string
  overallSummary: string
}

// ========== 渲染工具函数 ==========
function renderInline(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = []
  const regex = /\*\*(.+?)\*\*/g
  let lastIndex = 0
  let m: RegExpExecArray | null
  let keyCounter = 0
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index))
    parts.push(<strong key={keyCounter++} className="font-bold text-pink-600">{m[1]}</strong>)
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

function renderChatContent(raw: string): JSX.Element[] {
  const cleaned = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/###\s*/g, '')
    .replace(/^---+\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const lines = cleaned.split('\n')
  const result: JSX.Element[] = []
  let i = 0
  let blockKey = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() !== '') {
      const paragraphLines: string[] = []
      while (i < lines.length && lines[i].trim() !== '') {
        paragraphLines.push(lines[i])
        i++
      }
      const paragraphText = paragraphLines.join('\n')
      result.push(
        <p key={blockKey++} className="mb-1.5 last:mb-0 leading-relaxed whitespace-pre-line">
          {renderInline(paragraphText)}
        </p>
      )
      continue
    }
    i++
  }
  return result
}

// ========== 主页面组件 ==========

// ========== LLM 社交货币分析报告 ==========
async function runBragReport(
  messages: DialogueMessage[],
  roles: Role[],
  conversationBg: string,
  scene: string,
  dpuScores?: Array<{ roleName: string; finalIndex: number; personalityName: string; personalityTagline: string; topNeeds: string[] }>
): Promise<string | null> {
  const cfg = loadModelConfig()
  const hasLLM = cfg.provider !== 'offline' && !!cfg.apiKey
  if (!hasLLM) return null

  const msgsByRole = new Map<string, DialogueMessage[]>()
  for (const msg of messages) {
    const list = msgsByRole.get(msg.roleId) || []
    list.push(msg)
    msgsByRole.set(msg.roleId, list)
  }

  const fullDialogue = messages.map(m => {
    const role = roles.find(r => r.id === m.roleId)
    return `${role?.name || m.roleId}：${m.text}`
  }).join('\n')

  const roleInfo = roles.map(r => {
    const msgs = msgsByRole.get(r.id) || []
    return `【${r.name}】${r.relation ? `关系：${r.relation}` : ''}，共发言${msgs.length}条`
  }).join('\n')

  const bgSection = conversationBg ? `\n背景补充：${conversationBg}` : ''

  const dpuScoreContext = dpuScores && dpuScores.length > 0
    ? `\n## ⚠️ DPU算法已检测到的装逼指数（你的分析必须与此一致）\n${dpuScores.map(s => `- ${s.roleName}：装逼指数 **${s.finalIndex}/100** · 人格类型「${s.personalityName}」(${s.personalityTagline}) · 核心需求：${s.topNeeds.join('、')}`).join('\n')}\n`
    : ''

  const sceneMap: Record<string, string> = {
    emotional: '情感/炫耀场景',
    workplace: '职场/成就场景',
    social: '社交场合',
    academic: '学术/知识场景',
    lifestyle: '生活方式展示',
    parenting: '育儿/家庭场景',
    other: '其他场景',
  }

  const systemPrompt = `你是一位社交行为分析师，专精于识别社交互动中的"装逼需求"——即通过言语、展示、对比等方式获取社会认可、建立优越感的隐性心理需求。

${sceneMap[scene] || '社交场合'}${bgSection}

## 什么是"装逼需求"？
它不是贬义，而是一种普遍存在的社交货币行为。背后往往是尊重认可(D4)、社交归属(D2)、自我实现(D7)、自由掌控(D8)等需求的隐性表达。不同人在同一段对话中可能同时存在多种装逼策略，你的任务是识别出每个人的策略并解释它们如何互相影响。

## 报告结构（不要JSON，用自然中文段落）

### 一、场景社交动态
这段对话中，谁在主导社交表演？谁在配合？社交货币是如何流动的？两人的互动形成了什么样的社交气场？

### 二、逐角色社交画像
为每个发言角色分别输出，自然融入分析中，不要机械分段：

**{角色名}**
- 装逼指数：{0-100}
- 社交策略：TA用了什么方式来获取社交货币？
- 表面在说什么：（引用1-2句原话用「」包起来）
- 实际想要什么：背后是哪个需求？
- 为什么用这种方式：从TA的性格、社交位置、关系动态来推断
- 策略差异：TA的装法与对方有何不同？是互补还是拮抗？

### 三、社交货币流向分析
- 两人之间谁在获取？谁在给予？
- 是否存在"互相标高"或"暗自较劲"？
- 如果继续这样互动，社交关系会如何演化？

### 四、关系需求分析
- 每个人在这段关系中，真正想从对方那里得到什么？
- 他们最需要被满足的是哪个需求维度？（尊重认可？社交归属？情感陪伴？自由掌控？）
- 如果对方不能满足这个需求，TA会有什么反应？

### 五、社交建议
给对话中的"我"2-3条建议，如何在保持真诚的同时应对这种社交动态。

## 要求
- 自然段落，不要JSON
- 引用原话用「」
- 每个角色都要覆盖，自然地融入分析
- 有洞察但不过度批判——装逼是人类社交的常态
- 600-1000字`

  const userPrompt = `## 对话角色\n${roleInfo}\n\n## 完整对话\n${fullDialogue}${bgSection}${dpuScoreContext}\n\n请输出社交货币分析报告。注意：装逼指数必须与DPU检测结果一致。`

  try {
    console.log('[Showoff] Calling LLM for brag report...')
    const response = await chatWithModel(userPrompt, [], cfg, 3000, systemPrompt)
    console.log('[Showoff] Brag report response length:', response.length)

    if (response.startsWith('（大模型调用失败') || response.startsWith('（当前未配置')) {
      console.error('[Showoff] Brag report LLM error:', response)
      return null
    }
    return response
  } catch (err: any) {
    console.error('[Showoff] runBragReport exception:', err)
    return null
  }
}



// ========== 单角色深度社交分析 ==========
async function runPerRoleDeepAnalysis(
  role: { id: string; name: string },
  allMessages: DialogueMessage[],
  allRoles: Role[],
  conversationBg: string,
  scene: string,
  dpuAnalysis?: { finalIndex: number; personalityName: string; personalityTagline: string; needDistribution: Record<string, number>; topSignals: string[] }
): Promise<string | null> {
  const cfg = loadModelConfig()
  if (cfg.provider === 'offline' || !cfg.apiKey) return null

  const roleMsgs = allMessages.filter(m => m.roleId === role.id)
  if (roleMsgs.length === 0) return null

  const roleText = roleMsgs.map((m, i) => `${i + 1}. ${m.text}`).join('\n')

  const otherRoles = allRoles
    .filter(r => r.id !== role.id)
    .map(r => {
      const msgs = allMessages.filter(m => m.roleId === r.id)
      if (msgs.length === 0) return ''
      return `${r.name}(${r.relation || '未知'})，共${msgs.length}条：${msgs.slice(0, 2).map(m => m.text.slice(0, 50)).join('；')}`
    })
    .filter(Boolean).join('\n')

  const bgSection = conversationBg ? `\n背景：${conversationBg}` : ''

  // DPU 算法已检测到的数据，确保 LLM 报告与此一致
  const dpuCtx = dpuAnalysis ? `
## ⚠️ DPU算法已检测结果（请基于此展开分析，不要给出矛盾的结论）
- 装逼指数：${dpuAnalysis.finalIndex}/100
- DPU人格：${dpuAnalysis.personalityName}「${dpuAnalysis.personalityTagline}」
- 需求分布：${Object.entries(dpuAnalysis.needDistribution).sort((a,b)=>(b[1] as number)-(a[1] as number)).slice(0,3).map(([id,pct])=>`${id}(${pct}%)`).join('、')}
- 关键信号：${dpuAnalysis.topSignals.join('、')}
` : ''

  const systemPrompt = `你是一位资深社交人格分析师。请对**「${role.name}」**进行MBTI风格的深度社交人格画像。
${dpuCtx}

## 输出格式（严格按此结构，用Markdown，不要JSON）

## ⚠️ 人格标签已由DPU检测确定，不可更改
DPU已检测此人为「${dpuAnalysis?.personalityName || '...'}」类型（${dpuAnalysis?.personalityTagline || '...'}）。请在你的分析正文中直接使用此标签，**不要发明新类型名**。

## 📊 表达剖析
用表格展示TA的表达策略：

| 维度 | 判断 | 证据（引用原话） |
|------|------|------------------|
| 核心策略 | TA用了什么方式获取社交货币？ | 「原话引用」 |
| 语气底色 | 自信/戏谑/谦逊/强势... | 「原话引用」 |
| 需求层级 | 第一需求是什么？第二是什么？ | 简要说明 |

## 🧠 心理动因
2-3句话：TA为什么用这种方式而不是别的方式？（从TA可能的社会角色、关系中位置、过往经验来推断）

## 🎯 核心悖论
TA的言行中最有意思的矛盾是什么？（如："TA准备了7个球，但嘴上说的是'不知道可够打'——量化付出然后用反向谦虚收尾，是社交精算师的典型操作"）

## 💬 一句话社交人设
像朋友聊天一样，用一句话概括这个人。（如："他请你打球，其实是在让你看他的简历。"）

## 🤝 相处密码
2-3条极简建议，每条≤15字。用"- "列表。

## 要求
- 表格要写完整（维度+判断+原话证据三个列都要填）
- 每条判断必须配一句原话证据（用「」包起来）
- 核心悖论要有尖锐的洞察力
- 总长400-600字`

  const userPrompt = `## 分析对象：${role.name}${bgSection}\n\n## TA的发言\n${roleText}\n\n## 对话中其他人\n${otherRoles}\n\n请对${role.name}进行单人社交画像分析。`

  try {
    const response = await chatWithModel(userPrompt, [], cfg, 2500, systemPrompt)
    if (response.startsWith('（大模型调用失败') || response.startsWith('（当前未配置')) return null
    return response
  } catch { return null }
}


export function ShowoffPage() {
  const { status: llmStatus, refresh: refreshLlmStatus } = useLlmStatus()
  // 状态管理
  const [scene, setScene] = useState('emotional')
  const [inputText, setInputText] = useState('')
  const [messages, setMessages] = useState<DialogueMessage[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [conversationBg, setConversationBg] = useState('')
  const [conversationBgEditing, setConversationBgEditing] = useState(false)
  const [uploadedImages, setUploadedImages] = useState<string[]>([])
  const [extractedText, setExtractedText] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractError, setExtractError] = useState('')
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [showReport, setShowReport] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [editingContentMsgId, setEditingContentMsgId] = useState<number | null>(null)
  const [editingContentInput, setEditingContentInput] = useState('')
  const [selectingRoleForMsgId, setSelectingRoleForMsgId] = useState<number | null>(null)
  const [mergingFromRole, setMergingFromRole] = useState<string | null>(null)
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [aiChatHistory, setAiChatHistory] = useState<ChatTurn[]>([])
  const [aiInput, setAiInput] = useState('')
  const [isAiLoading, setIsAiLoading] = useState(false)

  const [perRoleDeepReport, setPerRoleDeepReport] = useState<Map<string, string>>(new Map())
  const [deepAnalyzingRoleId, setDeepAnalyzingRoleId] = useState<string | null>(null)
  const [perRoleDeepError, setPerRoleDeepError] = useState<string | null>(null)
  const [showFullReport, setShowFullReport] = useState(false)
  const [bragReport, setBragReport] = useState<string | null>(null)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [llmError, setLlmError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  // ========== 截图上传处理 ==========
  const handleFileUpload = useCallback((files: FileList | null) => {
    if (!files) return
    const validFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
    validFiles.forEach(file => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64 = e.target?.result as string
        setUploadedImages(prev => [...prev, base64])
      }
      reader.readAsDataURL(file)
    })
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    handleFileUpload(e.dataTransfer.files)
  }, [handleFileUpload])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const removeImage = useCallback((index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index))
  }, [])

  // ========== 添加角色 ==========
  const addRole = useCallback(() => {
    const newId = Date.now().toString()
    const newRole: Role = {
      id: newId,
      name: `角色${roles.length + 1}`,
      avatar: AVATARS[roles.length % AVATARS.length],
      color: ROLE_COLORS[roles.length % ROLE_COLORS.length],
      relation: ''
    }
    setRoles(prev => [...prev, newRole])
    setSelectedRoleId(newId)
  }, [roles.length])

  // ========== 删除角色 ==========
  const removeRole = useCallback((id: string) => {
    setRoles(prev => prev.filter(r => r.id !== id))
    setMessages(prev => prev.filter(m => m.roleId !== id))
    if (selectedRoleId === id) {
      setSelectedRoleId(null)
    }
  }, [selectedRoleId])

  // ========== 解析对话 ==========
  const handleParse = useCallback(() => {
    const text = inputText.trim()
    if (!text) return

    const newMessages: DialogueMessage[] = []
    let currentRoleId: string | null = null
    const rolesCreated: Role[] = [...roles]

    const getOrCreateRole = (roleName: string): string => {
      const existing = rolesCreated.find(r => r.name === roleName)
      if (existing) return existing.id
      const newRole: Role = {
        id: Date.now().toString() + Math.random() + rolesCreated.length,
        name: roleName,
        avatar: AVATARS[rolesCreated.length % AVATARS.length],
        color: ROLE_COLORS[rolesCreated.length % ROLE_COLORS.length],
        relation: ''
      }
      rolesCreated.push(newRole)
      return newRole.id
    }

    const lines = text.split('\n')
    lines.forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed) return

      let matched = false
      let m: RegExpMatchArray | null = null

      if (!matched) {
        m = trimmed.match(/^\[(.+?)\]\s*(.+)$/)
        if (m) {
          const rid = getOrCreateRole(m[1].trim())
          currentRoleId = rid
          newMessages.push({ id: Date.now() + Math.random() + newMessages.length, roleId: rid, text: m[2].trim() })
          matched = true
        }
      }

      if (!matched) {
        m = trimmed.match(/^\((.+?)\)\s*(.+)$/)
        if (m) {
          const rid = getOrCreateRole(m[1].trim())
          currentRoleId = rid
          newMessages.push({ id: Date.now() + Math.random() + newMessages.length, roleId: rid, text: m[2].trim() })
          matched = true
        }
      }

      if (!matched) {
        m = trimmed.match(/^([\u4e00-\u9fa5A-Za-z0-9_·\s]{1,15})[：]\s*(.+)$/)
        if (m) {
          const roleName = m[1].trim()
          if (roleName.length > 0 && roleName.length <= 15) {
            const rid = getOrCreateRole(roleName)
            currentRoleId = rid
            newMessages.push({ id: Date.now() + Math.random() + newMessages.length, roleId: rid, text: m[2].trim() })
            matched = true
          }
        }
      }

      if (!matched) {
        m = trimmed.match(/^([\u4e00-\u9fa5A-Za-z0-9_·\s]{1,15})[:]\s*(.+)$/)
        if (m) {
          const roleName = m[1].trim()
          if (roleName.length > 0 && roleName.length <= 15) {
            const rid = getOrCreateRole(roleName)
            currentRoleId = rid
            newMessages.push({ id: Date.now() + Math.random() + newMessages.length, roleId: rid, text: m[2].trim() })
            matched = true
          }
        }
      }

      if (!matched && currentRoleId) {
        newMessages.push({
          id: Date.now() + Math.random() + newMessages.length,
          roleId: currentRoleId,
          text: trimmed
        })
      }
    })

    if (rolesCreated.length > roles.length) {
      setRoles(rolesCreated)
    }
    setMessages(newMessages)
  }, [inputText, roles])

  // ===== 消息编辑 =====
  const setMsgRole = (msgId: number, newRoleId: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, roleId: newRoleId } : m))
    setSelectingRoleForMsgId(null)
  }

  const startEditContent = (msg: DialogueMessage) => {
    setEditingContentMsgId(msg.id)
    setEditingContentInput(msg.text)
  }

  const saveEditContent = (msgId: number) => {
    if (editingContentInput.trim()) {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text: editingContentInput.trim() } : m))
    }
    setEditingContentMsgId(null)
    setEditingContentInput('')
  }

  const renameRole = (roleId: string, newName: string) => {
    setRoles(prev => prev.map(r => r.id === roleId ? { ...r, name: newName.trim() } : r))
    setEditingRoleId(null)
  }

  const mergeRoles = (fromRoleId: string, toRoleId: string) => {
    setMessages(prev => prev.map(m => m.roleId === fromRoleId ? { ...m, roleId: toRoleId } : m))
    setRoles(prev => prev.filter(r => r.id !== fromRoleId))
    if (selectedRoleId === fromRoleId) setSelectedRoleId(toRoleId)
    setMergingFromRole(null)
  }

  const unlabeledCount = useMemo(() =>
    messages.filter(m => !roles.find(r => r.id === m.roleId)).length
  , [messages, roles])



  // ========== 从图片提取对话 ==========
  const handleExtractFromImage = useCallback(async () => {
    if (uploadedImages.length === 0) return

    setIsExtracting(true)
    setExtractError('')

    try {
      const allResults: string[] = []
      for (let i = 0; i < uploadedImages.length; i++) {
        const result = await extractDialogueFromImage(uploadedImages[i])
        if (result.startsWith('（')) {
          allResults.push(`[图片 ${i + 1}: ${result}]`)
        } else {
          allResults.push(result)
        }
      }

      const combinedText = allResults.join('\n\n')
      setExtractedText(combinedText)

      const hasValidText = allResults.some(r => !r.startsWith('['))
      if (hasValidText) {
        setInputText(prev => prev ? prev + '\n' + combinedText : combinedText)

        const lines = combinedText.split('\n')
        const tempRoles: Role[] = [...roles]
        const tempMessages: DialogueMessage[] = []
        let curRoleId: string | null = null

        const getOrCreate = (roleName: string): string => {
          const existing = tempRoles.find(r => r.name === roleName)
          if (existing) return existing.id
          const newRole: Role = {
            id: Date.now().toString() + Math.random() + tempRoles.length,
            name: roleName,
            avatar: AVATARS[tempRoles.length % AVATARS.length],
            color: ROLE_COLORS[tempRoles.length % ROLE_COLORS.length],
            relation: ''
          }
          tempRoles.push(newRole)
          return newRole.id
        }

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          let m = trimmed.match(/^\[(.+?)\]\s*(.+)$/) ||
                  trimmed.match(/^\((.+?)\)\s*(.+)$/) ||
                  trimmed.match(/^([\u4e00-\u9fa5A-Za-z0-9_·\s]{1,15})[：:]\s*(.+)$/)
          if (m) {
            const roleName = m[1].trim()
            if (roleName.length > 0 && roleName.length <= 15 && !roleName.startsWith('图片')) {
              const rid = getOrCreate(roleName)
              curRoleId = rid
              tempMessages.push({
                id: Date.now() + Math.random() + tempMessages.length,
                roleId: rid,
                text: m[2].trim()
              })
              continue
            }
          }

          if (curRoleId) {
            tempMessages.push({
              id: Date.now() + Math.random() + tempMessages.length,
              roleId: curRoleId,
              text: trimmed
            })
          }
        }

        if (tempMessages.length > 0) {
          if (tempRoles.length > roles.length) setRoles(tempRoles)
          setMessages(prev => [...prev, ...tempMessages])
        }

        if (tempMessages.length > 0) {
          setExtractError('')
        }
      } else {
        setExtractError('图片识别未返回有效内容，请检查图片清晰度，或手动粘贴对话文本。')
      }
    } catch (e: any) {
      console.error('图片识别失败', e)
      setExtractError(`处理失败：${e?.message || '未知错误'}`)
    } finally {
      setIsExtracting(false)
    }
  }, [uploadedImages, roles])

  // ========== 装逼需求分析 ==========
  const handleAnalyze = useCallback(async () => {
    if (messages.length === 0) return

    setIsAnalyzing(true)

    const roleAnalyses = analyzeRoles(messages, roles)

    const topRole = roleAnalyses[0]
    let summary = ''
    if (roleAnalyses.length === 0) {
      summary = '未检测到对话内容'
    } else if (topRole.totalNegativeIntensity >= 2.0) {
      summary = `${topRole.roleName} 正处于真实情绪表达中（焦虑/不安/求助），未检测到装逼动机`
    } else if (topRole.totalNegativeIntensity >= 1.0) {
      summary = `${topRole.roleName} 表达中带有明显情绪压力，需理解其真实处境`
    } else if (topRole.finalIndex >= 80) {
      summary = `${topRole.roleName} 装逼指数极高，基本是在进行高强度装逼表演`
    } else if (topRole.finalIndex >= 60) {
      summary = `${topRole.roleName} 装逼意图明显，频繁通过数量/表情暗示存在感`
    } else if (topRole.finalIndex >= 40) {
      summary = `${topRole.roleName} 有轻微装逼倾向，总体还在正常社交范围内`
    } else {
      summary = `${topRole.roleName} 表现正常，无明显装逼信号`
    }

    setAnalysisResult({
      roles: roleAnalyses,
      selectedRoleId: roleAnalyses[0]?.roleId || '',
      overallSummary: summary
    })
    setShowReport(true)
    setIsAnalyzing(false)

    // ===== 自动生成 LLM 社交货币分析报告 =====
    const cfg = loadModelConfig()
    if (cfg.provider !== 'offline' && cfg.apiKey) {
      setIsGeneratingReport(true)
      setIsAnalyzing(true) // keep analyzing state for report
runBragReport(messages, roles, conversationBg, scene, roleAnalyses.map(r => ({
                                    roleName: r.roleName,
                                    finalIndex: r.finalIndex,
                                    personalityName: r.personality?.name || '未检测',
                                    personalityTagline: r.personality?.tagline || '',
                                    topNeeds: Object.entries(r.needDistribution)
                                      .sort((a,b) => (b[1] as number) - (a[1] as number))
                                      .slice(0, 2)
                                      .map(([id]) => id)
                                  }))).then(report => {
        if (report) {
          setBragReport(report)
          console.log('[Showoff] Brag report generated:', report.length, 'chars')
        } else {
          console.warn('[Showoff] Brag report generation failed')
          const fbCfg = loadModelConfig()
          const isLLM = fbCfg.provider !== 'offline' && !!fbCfg.apiKey
          setLlmError(isLLM ? 'LLM调用失败，已使用本地算法结果。请打开F12控制台查看错误日志。' : null)
        }
        setIsGeneratingReport(false)
      })
    }
  }, [messages, roles])

  // ========== AI 继续讨论 ==========
  const handleAiChat = useCallback(async (question?: string) => {
    const q = question || aiInput.trim()
    if (!q || isAiLoading) return

    if (!question) setAiInput('')
    setIsAiLoading(true)

    const newHistory: ChatTurn[] = [
      ...aiChatHistory,
      { role: 'user', content: q }
    ]

    try {
      const responseText = await chatWithModel(q, aiChatHistory)
      newHistory.push({ role: 'assistant', content: responseText })
      setAiChatHistory(newHistory)
    } catch (error) {
      console.error('AI 响应失败:', error)
    } finally {
      setIsAiLoading(false)
    }
  }, [aiInput, aiChatHistory, isAiLoading])

  // ========== 当前选中角色分析数据 ==========
  const currentRoleAnalysis = useMemo(() => {
    if (!analysisResult) return null
    return analysisResult.roles.find(r => r.roleId === analysisResult.selectedRoleId) || analysisResult.roles[0] || null
  }, [analysisResult])

  // ========== 根据需求分布推断人格类型 ==========
  const personality = useMemo(() => {
    const ra = currentRoleAnalysis
    if (!ra) return BRAGGING_PERSONALITY_TYPES[BRAGGING_PERSONALITY_TYPES.length - 1]

    if (ra.isNegativeDominated || ra.totalNegativeIntensity >= 1.0) {
      return BRAGGING_PERSONALITY_TYPES.find(t => t.id === 'nr_fx') || BRAGGING_PERSONALITY_TYPES[0]
    }

    const needs = Object.entries(ra.needDistribution)
      .map(([id, pct]) => ({ id, pct: typeof pct === 'number' ? pct : 0 }))
      .sort((a, b) => b.pct - a.pct)
    const topNeed = needs[0]?.id || 'D4'
    const secondNeed = needs[1]?.id || 'D4'
    const topPct = needs[0]?.pct || 0
    const secondPct = needs[1]?.pct || 0

    const hasReverse = (ra.detectedPatterns || []).some(p => p.name.includes('反向'))
    const hasSocialInvite = (ra.detectedPatterns || []).some(p => p.name.includes('社交'))
    const hasStatus = (ra.detectedPatterns || []).some(p => p.name.includes('身份'))
    const hasQuantity = (ra.detectedPatterns || []).some(p => p.name.includes('数量'))
    const hasAbility = (ra.detectedPatterns || []).some(p => p.name.includes('能力'))
    const hasEmotion = (ra.detectedPatterns || []).some(p => p.name.includes('情绪'))
    const hasMorality = (ra.detectedPatterns || []).some(p => p.name.includes('道德') || p.name.includes('公平'))
    const hasGrowth = (ra.detectedPatterns || []).some(p => p.name.includes('成长') || p.name.includes('学习') || p.name.includes('进步'))
    const hasSelfBrand = (ra.detectedPatterns || []).some(p => p.name.includes('个性') || p.name.includes('品味'))

    if (hasReverse && !(ra.totalNegativeIntensity >= 1.0)) return BRAGGING_PERSONALITY_TYPES.find(t => t.id === 'rm_br') || BRAGGING_PERSONALITY_TYPES[0]
    if (ra.finalIndex < 30) return BRAGGING_PERSONALITY_TYPES.find(t => t.id === 'nr_fx') || BRAGGING_PERSONALITY_TYPES[0]

    if (topNeed === 'D2' && topPct > 35) return BRAGGING_PERSONALITY_TYPES.find(t => t.id === 'd2_hub') || BRAGGING_PERSONALITY_TYPES[0]
    if (topNeed === 'D8' && hasSocialInvite) return BRAGGING_PERSONALITY_TYPES.find(t => t.id === 'd8_ctrl') || BRAGGING_PERSONALITY_TYPES[0]
    if (topNeed === 'D8' && hasStatus) return BRAGGING_PERSONALITY_TYPES.find(t => t.id === 'rs_bg') || BRAGGING_PERSONALITY_TYPES[0]
    if (topNeed === 'D8') return BRAGGING_PERSONALITY_TYPES.find(t => t.id === 'd8_ctrl') || BRAGGING_PERSONALITY_TYPES[0]
    if (topNeed === 'D6') return BRAGGING_PERSONALITY_TYPES.find(t => t.id === 'd6_taste') || BRAGGING_PERSONALITY_TYPES[0]
    if (topNeed === 'D5') return BRAGGING_PERSONALITY_TYPES.find(t => t.id === 'd5_teacher') || BRAGGING_PERSONALITY_TYPES[0]
    if (topNeed === 'D4' && secondPct > 20) return BRAGGING_PERSONALITY_TYPES.find(t => t.id === 'd4_social') || BRAGGING_PERSONALITY_TYPES[0]

    if (hasSocialInvite && topPct < 50) return BRAGGING_PERSONALITY_TYPES.find(t => t.id === 'd2_hub') || BRAGGING_PERSONALITY_TYPES[0]

    // NEW v4.2 types
    if (topNeed === 'D3' && hasEmotion) return BRAGGING_PERSONALITY_TYPES.find(t => t.id === 'd3_affect') || BRAGGING_PERSONALITY_TYPES[0]
    if (hasQuantity && topPct > 30) return BRAGGING_PERSONALITY_TYPES.find(t => t.id === 'd4_invest') || BRAGGING_PERSONALITY_TYPES[0]
    if (topNeed === 'D9' && hasMorality) return BRAGGING_PERSONALITY_TYPES.find(t => t.id === 'd9_judge') || BRAGGING_PERSONALITY_TYPES[0]
    if (topNeed === 'D10' && hasGrowth) return BRAGGING_PERSONALITY_TYPES.find(t => t.id === 'd10_climb') || BRAGGING_PERSONALITY_TYPES[0]
    if (topNeed === 'D7') return BRAGGING_PERSONALITY_TYPES.find(t => t.id === 'd7_perform') || BRAGGING_PERSONALITY_TYPES[0]

    return BRAGGING_PERSONALITY_TYPES.find(t => t.id === 'd4_social') || BRAGGING_PERSONALITY_TYPES[0]
  }, [currentRoleAnalysis])

  // ========== 海报导出 ==========
  const posterRef = useRef<HTMLDivElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)
  const [posterImageUrl, setPosterImageUrl] = useState<string | null>(null)
  const [isGeneratingPoster, setIsGeneratingPoster] = useState(false)

  const handleGeneratePosterImage = useCallback(async () => {
    if (!exportRef.current || !currentRoleAnalysis) return
    setIsGeneratingPoster(true)
    try {
      const html2canvasModule = await import('html2canvas')
      const html2canvas = html2canvasModule.default || html2canvasModule
      const canvas = await html2canvas(exportRef.current, {
        backgroundColor: '#ffffff',
        scale: 3,
        useCORS: true,
        logging: false,
        windowWidth: 794,
        windowHeight: exportRef.current.scrollHeight + 100
      })
      const dataUrl = canvas.toDataURL('image/png', 1.0)
      setPosterImageUrl(dataUrl)
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `DPU-${currentRoleAnalysis.roleName}-人格画像.png`
      link.click()
    } catch (e) {
      console.error('生成海报失败', e)
    } finally {
      setIsGeneratingPoster(false)
    }
  }, [currentRoleAnalysis])

  const handleGeneratePosterPdf = useCallback(async () => {
    if (!exportRef.current || !currentRoleAnalysis) return
    setIsGeneratingPoster(true)
    try {
      const html2canvasModule = await import('html2canvas')
      const jspdfModule = await import('jspdf')
      const html2canvas = html2canvasModule.default || html2canvasModule
      const jsPDF = jspdfModule.default || jspdfModule

      const canvas = await html2canvas(exportRef.current, {
        backgroundColor: '#ffffff',
        scale: 3,
        useCORS: true,
        logging: false,
        windowWidth: 794,
        windowHeight: exportRef.current.scrollHeight + 100
      })
      const imgData = canvas.toDataURL('image/jpeg', 0.92)
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

      const pageWidth = 190
      const pageHeight = 277
      const imgHeight = (canvas.height * pageWidth) / canvas.width

      let heightLeft = imgHeight
      let position = 0
      pdf.addImage(imgData, 'JPEG', 10, position, pageWidth, imgHeight)
      heightLeft -= pageHeight

      while (heightLeft > 0) {
        position = -(imgHeight - heightLeft) + 0
        pdf.addPage()
        pdf.addImage(imgData, 'JPEG', 10, position, pageWidth, imgHeight)
        heightLeft -= pageHeight
      }

      pdf.save(`DPU-${currentRoleAnalysis.roleName}-人格检测报告.pdf`)
      setPosterImageUrl(imgData)
    } catch (e) {
      console.error('生成 PDF 失败', e)
    } finally {
      setIsGeneratingPoster(false)
    }
  }, [currentRoleAnalysis])

  const handleSelectRole = (roleId: string) => {
    if (!analysisResult) return
    setAnalysisResult({ ...analysisResult, selectedRoleId: roleId })
  }

  const currentIndex = currentRoleAnalysis?.finalIndex || 0

  // ========== 装逼指数环形图 ==========
  const gaugeOption = useMemo(() => ({
    series: [
      {
        type: 'gauge',
        radius: '95%',
        startAngle: 200,
        endAngle: -20,
        min: 0,
        max: 100,
        axisLine: { lineStyle: { width: 16, color: [[1, '#e2e8f0']] } },
        progress: { show: true, width: 16, itemStyle: { color: currentIndex >= 80 ? '#ef4444' : currentIndex >= 60 ? '#f59e0b' : currentIndex >= 40 ? '#eab308' : '#10b981' } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer: { show: false },
        anchor: { show: false },
        title: { show: false },
        detail: { valueAnimation: true, fontSize: 28, fontWeight: 'bold', color: '#0f172a', offsetCenter: [0, 0], formatter: '{value}分' },
        data: [{ value: currentIndex }]
      }
    ]
  }), [currentIndex])

  // ========== 雷达图 ==========
  const radarOption = useMemo(() => {
    if (!currentRoleAnalysis) return { radar: {}, series: [] }
    return {
      radar: {
        indicator: SHOWOFF_NEEDS.map(need => ({ name: need.name, max: 100 })),
        shape: 'polygon',
        splitNumber: 3,
        axisName: { color: '#475569', fontSize: 12, fontWeight: 600 },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
        splitArea: { areaStyle: { color: ['#fafafa', '#ffffff', '#fafafa'] } },
        axisLine: { lineStyle: { color: '#cbd5e1' } }
      },
      series: [{
        type: 'radar',
        data: [{
          value: SHOWOFF_NEEDS.map(n => currentRoleAnalysis!.needDistribution[n.id] || 0),
          name: currentRoleAnalysis.roleName,
          areaStyle: { color: 'rgba(236, 72, 153, 0.25)' },
          lineStyle: { color: '#ec4899', width: 2 },
          itemStyle: { color: '#ec4899' }
        }]
      }]
    }
  }, [currentRoleAnalysis])

  // ========== 获取角色信息 ==========
  const getRole = useCallback((roleId: string) => {
    return roles.find(r => r.id === roleId)
  }, [roles])

  // ========== 渲染 ==========
  return (
    <div className="min-h-screen pt-20 pb-16 bg-gradient-to-b from-white via-slate-50 to-indigo-50/30">
      <div className="max-w-7xl mx-auto px-4 lg:px-6">
        {/* 顶部标题 */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 border border-pink-200 text-xs font-bold text-pink-600 tracking-wider mb-3 shadow-sm">
            <Crown className="w-4 h-4" /> 装逼需求检测器
          </div>
          <h1 className="text-3xl lg:text-4xl font-black text-slate-900 mb-2">
            识别社交场域中的<span className="bg-gradient-to-r from-pink-500 to-indigo-600 bg-clip-text text-transparent">"装逼需求"</span>
          </h1>
          <p className="text-sm text-slate-600">粘贴对话 · 自动识别 · 量化装逼信号</p>
          <div className="mt-3"><LlmStatusBadge status={llmStatus} onRefresh={refreshLlmStatus} /></div>
        </motion.div>

        {/* 场景选择 */}
        {SCENES.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="flex gap-2 flex-wrap justify-center mb-6">
              {SCENES.map(s => (
                <button key={s.key} onClick={() => setScene(s.key)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shadow-sm ${scene === s.key
                    ? 'text-white shadow-lg scale-105'
                    : 'bg-white text-slate-600 hover:scale-105 border border-slate-200'
                    }`}
                  style={scene === s.key ? { background: `linear-gradient(135deg, ${s.color}, ${s.color}cc)` } : {}}>
                  {s.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {!showReport ? (
          /* ===== 输入阶段 ===== */
          <div className="grid grid-cols-1 lg:grid-cols-[35%_65%] gap-4">
            {/* 左侧：输入区 */}
            <div className="space-y-4">
              {/* 对话输入 */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-pink-600" />
                      <span className="font-bold text-slate-800 text-sm">粘贴对话内容</span>
                    </div>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 text-[10px] font-bold hover:bg-indigo-100 transition-all border border-indigo-200"
                    >
                      <Image className="w-3 h-3" /> 上传截图
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleFileUpload(e.target.files)}
                      className="hidden"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    支持：张三：内容 / [张三] 内容 / (张三) 内容，自动识别说话人
                    <br />
                    <span className="text-amber-600 font-semibold">提示：图片识别需要在「模型配置」中填写 API Key（推荐 qwen-vl-max）</span>
                  </p>
                </div>
                <div className="p-4">
                  <textarea
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    placeholder={'粘贴对话内容，支持多种格式：\n\n张三：最近刚提了辆保时捷\n李四：哇恭喜啊！\n张三：也就那样吧，反正不贵\n李四：保时捷还不贵啊...\n\n也支持：\n[张三] 最近忙几个项目\n[李四] 厉害厉害\n\n或直接上传聊天截图自动识别'}
                    rows={8}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 resize-none font-mono"
                  />
                  <div className="flex gap-2 mt-3">
                    <button onClick={handleParse}
                      className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-indigo-600 text-white text-xs font-bold shadow hover:shadow-lg transition-all disabled:opacity-40"
                      disabled={!inputText.trim()}>
                      <Zap className="w-3.5 h-3.5" />解析对话
                    </button>
                    <button onClick={() => setInputText('')}
                      className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-500 text-xs font-semibold hover:bg-red-50 hover:text-red-500 transition-all">
                      清空
                    </button>
                  </div>
                </div>
              </motion.div>

              {/* 截图上传区域 */}
              {uploadedImages.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
                  className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-white">
                    <div className="flex items-center gap-2">
                      <Image className="w-4 h-4 text-indigo-600" />
                      <span className="font-bold text-slate-800 text-sm">已上传截图</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600">{uploadedImages.length}张</span>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {uploadedImages.map((img, i) => (
                        <div key={i} className="relative group">
                          <img
                            src={img}
                            alt={`截图${i + 1}`}
                            className="w-full h-20 object-cover rounded-lg border border-slate-200"
                          />
                          <button
                            onClick={() => removeImage(i)}
                            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button onClick={handleExtractFromImage}
                      disabled={isExtracting}
                      className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-bold shadow hover:shadow-lg transition-all disabled:opacity-40">
                      {isExtracting ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> AI 识别中...
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-3.5 h-3.5" /> 从截图提取对话
                        </>
                      )}
                    </button>
                    {/* 提取结果预览 */}
                    {extractedText && !isExtracting && (
                      <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Check className="w-3.5 h-3.5 text-green-600" />
                          <span className="text-[11px] font-bold text-slate-800">AI 提取结果（可编辑）</span>
                        </div>
                        <textarea
                          value={extractedText}
                          onChange={e => setExtractedText(e.target.value)}
                          rows={4}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 resize-none font-mono"
                        />
                        <p className="text-[10px] text-slate-500 mt-1.5">识别结果已自动填入上方输入框，可编辑后点击"解析对话"</p>
                      </div>
                    )}
                    {/* 错误提示 */}
                    {extractError && (
                      <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                        <div className="text-[11px] text-red-700 leading-relaxed">
                          {extractError}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* 角色管理 */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-pink-600" />
                    <span className="font-bold text-slate-800 text-sm">角色标注</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{roles.length}人</span>
                  </div>
                  <button onClick={addRole}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-pink-50 text-pink-600 text-[11px] font-bold hover:bg-pink-100 transition-all border border-pink-200">
                    <Plus className="w-3 h-3" />添加
                  </button>
                </div>
                <div className="p-3 space-y-2 max-h-[280px] overflow-y-auto">
                  {roles.map(role => {
                    const count = messages.filter(m => m.roleId === role.id).length
                    return (
                      <div key={role.id}
                        className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border transition-all cursor-pointer ${selectedRoleId === role.id ? 'border-pink-300 bg-pink-50' : 'border-slate-200 hover:border-slate-300'}`}
                        onClick={() => setSelectedRoleId(role.id)}>
                        <span className="text-xl flex-shrink-0 mt-0.5">{role.avatar}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {editingRoleId === role.id ? (
                              <input
                                autoFocus
                                defaultValue={role.name}
                                onKeyDown={e => { if (e.key === 'Enter') renameRole(role.id, (e.target as HTMLInputElement).value) }}
                                onBlur={e => renameRole(role.id, e.target.value)}
                                onClick={e => e.stopPropagation()}
                                className="text-xs font-bold text-slate-800 bg-white border border-pink-300 rounded px-2 py-0.5 outline-none flex-1 min-w-0"
                              />
                            ) : (
                              <input
                                value={role.name}
                                onChange={e => setRoles(roles.map(r => r.id === role.id ? { ...r, name: e.target.value } : r))}
                                onDoubleClick={(e) => { e.stopPropagation(); setEditingRoleId(role.id) }}
                                onClick={e => e.stopPropagation()}
                                className="text-xs font-bold text-slate-800 bg-transparent border-none outline-none flex-1 min-w-0"
                              />
                            )}
                            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: role.color }} />
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-semibold">{count}条</span>
                          </div>
                          <input
                            value={role.relation || ''}
                            onChange={e => setRoles(roles.map(r => r.id === role.id ? { ...r, relation: e.target.value } : r))}
                            onClick={e => e.stopPropagation()}
                            placeholder="关系（如：朋友/同事/同学/相亲对象）"
                            className="text-[10px] text-slate-500 bg-transparent border-none outline-none w-full mt-1"
                          />
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {roles.length > 1 && (
                            <>
                              {mergingFromRole === role.id ? (
                                <div className="flex items-center gap-1 flex-wrap" onClick={e => e.stopPropagation()}>
                                  <span className="text-[9px] text-slate-500">合并到：</span>
                                  {roles.filter(r => r.id !== role.id).map(r => (
                                    <button key={r.id}
                                      onClick={() => mergeRoles(role.id, r.id)}
                                      className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-700 font-semibold">
                                      {r.avatar} {r.name}
                                    </button>
                                  ))}
                                  <button onClick={(e) => { e.stopPropagation(); setMergingFromRole(null) }}
                                    className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 hover:bg-red-200">取消</button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <button onClick={(e) => { e.stopPropagation(); setMergingFromRole(role.id) }}
                                    className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-700 font-semibold">
                                    合并
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); removeRole(role.id) }}
                                    className="text-slate-300 hover:text-red-400 transition-colors" title="删除角色">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </motion.div>

              {/* 背景信息 */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-pink-600" />
                    <span className="font-bold text-slate-800 text-sm">背景补充</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">影响分析准确性</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">补充这段对话的背景、关系动态、特殊情境，AI 会更准确</p>
                </div>
                <div className="p-4">
                  {conversationBgEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={conversationBg}
                        onChange={e => setConversationBg(e.target.value)}
                        placeholder={'例如：\n- 对方是大学同学，最近突然变得特别爱炫耀\n- 几个朋友在群里聊新买的东西\n- 相亲对象一直在说自己的条件'}
                        rows={5}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-pink-400 resize-none"
                      />
                      <button onClick={() => setConversationBgEditing(false)}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-pink-500 text-white text-xs font-bold hover:bg-pink-600 transition-all">
                        <Check className="w-3.5 h-3.5" />保存背景
                      </button>
                    </div>
                  ) : (
                    <div>
                      {conversationBg ? (
                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                          <p className="text-xs text-slate-700 whitespace-pre-line">{conversationBg}</p>
                          <button onClick={() => setConversationBgEditing(true)}
                            className="mt-2 text-[10px] text-pink-600 font-bold flex items-center gap-1 hover:underline">
                            <Edit3 className="w-3 h-3" />编辑背景
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setConversationBgEditing(true)}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 text-xs font-semibold hover:border-pink-300 hover:text-pink-500 transition-all">
                          <Plus className="w-3.5 h-3.5" />添加背景信息
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>

              {/* 开始分析按钮 */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                <button onClick={handleAnalyze}
                  disabled={messages.length === 0 || isAnalyzing}
                  className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-gradient-to-r from-pink-500 via-rose-600 to-indigo-700 text-white font-black text-sm shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all disabled:opacity-40 disabled:hover:scale-100 disabled:shadow-xl">
                  {isAnalyzing ? (
                    <>
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                        <SparklesIcon className="w-5 h-5" />
                      </motion.div>
                      正在分析装逼需求...
                    </>
                  ) : (
                    <>
                      <Crown className="w-5 h-5" />
                      开始装逼分析
                    </>
                  )}
                </button>
              </motion.div>
            </div>

            {/* 右侧：对话预览 */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-pink-600" />
                  <span className="font-bold text-slate-800 text-sm">对话预览</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{messages.length}条</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  粘贴对话后自动显示，支持手动点击头像标注角色
                </p>
              </div>
              <div className="p-4 min-h-[500px] max-h-[600px] overflow-y-auto">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <MessageSquare className="w-12 h-12 mb-4" />
                    <p className="text-sm font-semibold">粘贴对话后自动显示</p>
                    <p className="text-xs mt-1">支持 [角色名] 内容 或 (角色名) 内容</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((msg, i) => {
                      const role = getRole(msg.roleId)
                      if (!role) return null
                      const isSelecting = selectingRoleForMsgId === msg.id
                      return (
                        <motion.div key={msg.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.03 }}
                          className="group flex gap-2.5 relative">
                          <button
                            onClick={() => setSelectingRoleForMsgId(isSelecting ? null : msg.id)}
                            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all hover:scale-110 hover:shadow-md"
                            style={{ background: role.color + '22', color: role.color, cursor: 'pointer' }}
                            title="点击选择/修改说话人">
                            {role.avatar}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[11px] font-bold" style={{ color: role.color }}>{role.name}</span>
                            </div>
                            {editingContentMsgId === msg.id ? (
                              <div className="bg-slate-50 rounded-xl rounded-tl-sm px-3 py-2 border border-amber-300 shadow-inner">
                                <textarea
                                  value={editingContentInput}
                                  onChange={e => setEditingContentInput(e.target.value)}
                                  rows={2}
                                  autoFocus
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 resize-none focus:outline-none focus:border-amber-400"
                                />
                                <div className="flex gap-2 mt-2">
                                  <button onClick={() => saveEditContent(msg.id)}
                                    className="text-[10px] px-3 py-1 rounded-lg bg-amber-500 text-white font-bold hover:bg-amber-600">✓ 保存</button>
                                  <button onClick={() => { setEditingContentMsgId(null); setEditingContentInput('') }}
                                    className="text-[10px] px-3 py-1 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200">取消</button>
                                </div>
                              </div>
                            ) : (
                              <div className="bg-slate-50 rounded-xl rounded-tl-sm px-3 py-2 border border-slate-200/60">
                                <p className="text-xs text-slate-700 leading-relaxed">{msg.text}</p>
                              </div>
                            )}
                            <div className="flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-all">
                              <button onClick={() => startEditContent(msg)}
                                className="text-[9px] text-slate-400 hover:text-amber-500 font-semibold">✏️ 编辑</button>
                              <span className="text-[9px] text-slate-300">|</span>
                              <button onClick={() => setMessages(prev => prev.filter(m => m.id !== msg.id))}
                                className="text-[9px] text-slate-400 hover:text-red-500 font-semibold">🗑 删除</button>
                            </div>
                            {isSelecting && (
                              <motion.div
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="absolute top-0 left-0 z-10 bg-white rounded-xl shadow-2xl border border-slate-200 p-2 min-w-[180px] mt-8"
                                onClick={(e) => e.stopPropagation()}>
                                <p className="text-[10px] text-slate-500 font-semibold px-2 pb-1 border-b border-slate-100 mb-1">选择说话人</p>
                                <div className="max-h-[200px] overflow-y-auto space-y-1">
                                  {roles.map(r => (
                                    <button key={r.id}
                                      onClick={() => setMsgRole(msg.id, r.id)}
                                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-left">
                                      <span className="text-base w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: r.color + '22' }}>{r.avatar}</span>
                                      <span className="text-xs font-semibold text-slate-700">{r.name}</span>
                                      {r.relation && <span className="text-[9px] text-slate-400">{r.relation}</span>}
                                    </button>
                                  ))}
                                  <div className="pt-1 border-t border-slate-100">
                                    <button onClick={addRole}
                                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-amber-50 text-left">
                                      <span className="text-base">➕</span>
                                      <span className="text-xs font-semibold text-amber-600">新建角色</span>
                                    </button>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        ) : (
          /* ===== 分析结果 ===== */
          analysisResult && (
            <div className="space-y-6">

              {/* LLM 社交货币分析报告 */}
              {(bragReport || isGeneratingReport || llmError) && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-br from-amber-50 via-white to-purple-50/30 backdrop-blur-xl rounded-2xl border border-amber-200 shadow-lg overflow-hidden">
                  <div className="px-5 py-4 border-b border-amber-200 bg-gradient-to-r from-amber-50 to-purple-50">
                    <div className="flex items-center gap-2">
                      <Crown className="w-5 h-5 text-amber-600" />
                      <span className="font-black text-slate-900 text-base">社交货币分析报告</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">LLM 深度解析</span>
                      {isGeneratingReport && (
                        <span className="flex items-center gap-1 text-[10px] text-purple-500 font-semibold ml-2">
                          <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                            <SparklesIcon className="w-3.5 h-3.5" />
                          </motion.span>
                          生成中…
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-5 max-h-[700px] overflow-y-auto">
                    {isGeneratingReport ? (
                      <div className="flex flex-col items-center py-8 text-slate-400">
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
                          <Crown className="w-10 h-10 mb-3 text-amber-300" />
                        </motion.div>
                        <p className="text-sm font-semibold">AI 正在分析社交货币流动…</p>
                        <p className="text-xs mt-1">这需要 5-10 秒，请稍候</p>
                      </div>
                    ) : bragReport ? (
                      <div className="prose prose-sm max-w-none text-xs leading-relaxed text-slate-700">
                        {/* Render the report text with basic markdown-like formatting */}
                        {renderMarkdown(bragReport)}
                      </div>
                    ) : llmError ? (
                      <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                        <p className="text-xs text-red-600 font-semibold">⚠️ {llmError}</p>
                      </div>
                    ) : null}
                  </div>
                </motion.div>
              )}
              {/* 顶部：总摘要 + 角色选择器 */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg p-5">
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div>
                    <div className="text-xs text-slate-500 mb-1">核心结论</div>
                    <div className="text-lg font-bold text-slate-900 mb-1">
                      {analysisResult.overallSummary}
                    </div>
                    <div className="text-xs text-slate-500">
                      共识别 {analysisResult.roles.length} 位对话者 · 点击下方切换查看每个人
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setShowReport(false); setAnalysisResult(null); setBragReport(null); setLlmError(null) }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-all">
                      <ChevronLeft className="w-3.5 h-3.5" /> 返回修改
                    </button>
                  </div>
                </div>

                {/* 角色选择器：每个角色一个小卡片 */}
                <div className="mt-5 flex gap-3 flex-wrap">
                  {analysisResult.roles.map((role, i) => {
                    const active = role.roleId === analysisResult.selectedRoleId || (i === 0 && !analysisResult.selectedRoleId)
                    return (
                      <button key={role.roleId} onClick={() => handleSelectRole(role.roleId)}
                        className={`relative flex items-center gap-2.5 px-3.5 py-2 rounded-xl border-2 transition-all ${
                          active
                            ? 'bg-gradient-to-br from-pink-50 to-indigo-50 border-pink-500 shadow-md scale-105'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}>
                        {deepAnalyzingRoleId === role.roleId && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center">
                            <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                              <SparklesIcon className="w-2.5 h-2.5 text-white" />
                            </motion.span>
                          </span>
                        )}
                        {perRoleDeepReport.has(role.roleId) && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-[8px] text-white font-black">✓</span>
                        )}
                        <div className={`text-lg font-bold text-center leading-none px-1.5 py-1 rounded-lg ${
                          active ? 'bg-pink-500 text-white' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {role.finalIndex}
                        </div>
                        <div className="text-left">
                          <div className={`text-sm font-bold ${active ? 'text-pink-700' : 'text-slate-800'}`}>
                            {role.roleName}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {role.finalIndex >= 80 ? '重度装逼' :
                             role.finalIndex >= 60 ? '明显装逼' :
                             role.finalIndex >= 40 ? '轻微装逼' : '基本正常'}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </motion.div>

              {/* 当前选中角色的详细分析 */}
              {currentRoleAnalysis && (
                <div className="grid grid-cols-1 lg:grid-cols-[35%_65%] gap-5">
                  {/* 左侧：装逼指数仪表 / 情绪分析面板 */}
                  <div className="space-y-5">
                    {/* DPU 检测结果：无显著装逼需求（负面情绪主导时显示） */}
                    {currentIndex <= 25 && currentRoleAnalysis.totalNegativeIntensity >= 1.0 && (() => {
                      const negTypes = new Map<string, { name: string; keywords: string[] }>()
                      for (const ne of currentRoleAnalysis.negativeEvidence) {
                        const existing = negTypes.get(ne.type)
                        if (existing) {
                          for (const kw of ne.keywords) {
                            if (!existing.keywords.includes(kw) && existing.keywords.length < 6) existing.keywords.push(kw)
                          }
                        } else {
                          negTypes.set(ne.type, { name: ne.name, keywords: [...ne.keywords] })
                        }
                      }
                      // 解读TA真正在说什么
                      let realMeaning = 'TA在表达一种真实的情绪状态，而不是在进行社交展示。'
                      if (currentRoleAnalysis.isNegativeDominated) {
                        const dominantType = negTypes.keys().next().value
                        if (dominantType === 'anxiety') realMeaning = 'TA 正处于焦虑和压力之中，最需要的是理解和安抚。'
                        else if (dominantType === 'self_doubt') realMeaning = 'TA 对自己缺乏信心，表达了对自身能力和价值的怀疑。'
                        else if (dominantType === 'helpless') realMeaning = 'TA 在发出求助信号，感到孤独和无助，需要被看见和被支持。'
                        else if (dominantType === 'complain_injustice') realMeaning = 'TA 对处境感到不公，在抒发对环境的无力感，而不是在展示什么。'
                        else if (dominantType === 'negative_situation') realMeaning = 'TA 描述的是面对现实困境的压力，属于情境性表达，而非社交策略。'
                        else if (dominantType === 'emotional_negative') realMeaning = 'TA 的情绪状态较低落，需要被理解而非被解读为"在装"。'
                      }
                      return (
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                          className="bg-white/90 backdrop-blur-xl rounded-2xl border border-indigo-200 shadow-lg overflow-hidden">
                          <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50 via-white to-sky-50">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">📊</span>
                              <span className="font-bold text-slate-800 text-sm">{currentRoleAnalysis.roleName} · DPU 检测结果</span>
                            </div>
                          </div>
                          <div className="p-5">
                            <div className="text-center mb-3">
                              <div className="inline-block px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-700 text-xs font-bold">
                                ✅ 无显著装逼需求
                              </div>
                            </div>
                            <div className="text-sm text-slate-600 leading-relaxed text-center mb-4">
                              这段对话以真实情绪表达为主（{currentRoleAnalysis.totalNegativeIntensity >= 2.0 ? '焦虑/自我否定/求助' : '含有不安/无力感'}），未检测到明显的装逼动机。
                            </div>

                            <div className="mt-2 p-3 rounded-xl bg-gradient-to-br from-indigo-50 to-sky-50 border border-indigo-100">
                              <div className="flex items-center gap-1.5 mb-2">
                                <span className="text-sm">💡</span>
                                <span className="font-bold text-slate-800 text-xs">TA 真正在说什么</span>
                              </div>
                              <p className="text-xs text-slate-700 leading-relaxed">{realMeaning}</p>
                            </div>

                            <div className="mt-4 space-y-1.5">
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <span className="text-xs font-bold text-slate-800">检测到的情绪信号</span>
                              </div>
                              {Array.from(negTypes.entries()).map(([type, info]) => (
                                <div key={type} className="flex items-start gap-2 p-2 rounded-lg bg-slate-50">
                                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[11px] font-bold text-slate-800">{info.name}</div>
                                    <div className="text-[10px] text-slate-500 mt-0.5">{info.keywords.slice(0, 4).join(' · ')}</div>
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                              <div className="p-2 rounded-xl bg-slate-50">
                                <div className="text-xs font-bold text-slate-900">{currentRoleAnalysis.messageCount}</div>
                                <div className="text-[10px] text-slate-500 mt-0.5">发言次数</div>
                              </div>
                              <div className="p-2 rounded-xl bg-slate-50">
                                <div className="text-xs font-bold text-slate-900">{currentRoleAnalysis.totalNegativeIntensity}</div>
                                <div className="text-[10px] text-slate-500 mt-0.5">情绪强度</div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )
                    })()}

                    {/* 装逼指数仪表（非负面情绪时显示） */}
                    {!(currentIndex <= 25 && currentRoleAnalysis.totalNegativeIntensity >= 1.0) && (
                      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                        className="bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-pink-50 via-white to-indigo-50">
                          <div className="flex items-center gap-2">
                            <Crown className="w-4 h-4 text-pink-600" />
                            <span className="font-bold text-slate-800 text-sm">{currentRoleAnalysis.roleName} · 装逼指数</span>
                          </div>
                        </div>
                        <div className="p-5">
                          <div className="flex justify-center">
                            <div style={{ width: '200px', height: '200px' }}>
                              <ReactECharts option={gaugeOption} style={{ width: '200px', height: '200px' }} />
                            </div>
                          </div>
                          <div className={`text-center mt-2 px-3 py-1.5 rounded-xl text-xs font-bold inline-block ${
                            currentIndex >= 80 ? 'bg-red-100 text-red-700' :
                            currentIndex >= 60 ? 'bg-orange-100 text-orange-700' :
                            currentIndex >= 40 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-green-100 text-green-700'
                          }`} style={{ display: 'block', margin: '0 auto' }}>
                            {currentIndex >= 80 ? '🔥 重度装逼' :
                             currentIndex >= 60 ? '⚠️ 明显装逼' :
                             currentIndex >= 40 ? '💡 轻微装逼' : '✅ 基本正常'}
                          </div>
                          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                            <div className="p-2 rounded-xl bg-slate-50">
                              <div className="text-xs font-bold text-slate-900">{currentRoleAnalysis.messageCount}</div>
                              <div className="text-[10px] text-slate-500 mt-0.5">发言次数</div>
                            </div>
                            <div className="p-2 rounded-xl bg-slate-50">
                              <div className="text-xs font-bold text-slate-900">{currentRoleAnalysis.topEvidence.length}</div>
                              <div className="text-[10px] text-slate-500 mt-0.5">装逼证据</div>
                            </div>
                            <div className="p-2 rounded-xl bg-slate-50">
                              <div className="text-xs font-bold text-slate-900">{currentRoleAnalysis.detectedPatterns.length}</div>
                              <div className="text-[10px] text-slate-500 mt-0.5">信号类型</div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* 需求分布雷达图 */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                      className="bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50 via-white to-pink-50">
                        <div className="flex items-center gap-2">
                          <BarChart3 className="w-4 h-4 text-indigo-600" />
                          <span className="font-bold text-slate-800 text-sm">{currentRoleAnalysis.roleName} · 需求分布</span>
                        </div>
                      </div>
                      <div className="p-5">
                        <div style={{ height: '240px' }}>
                          <ReactECharts option={radarOption} style={{ height: '240px' }} />
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-2">
                          {SHOWOFF_NEEDS.map(need => (
                            <div key={need.id} className="flex items-center gap-2 text-xs">
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: need.color }} />
                              <span className="text-slate-600">{need.name}</span>
                              <span className="font-bold text-slate-900 ml-auto">
                                {currentRoleAnalysis.needDistribution[need.id] || 0}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>

                    {/* 消息时间轴（装逼程度趋势） */}
                    {messages.length >= 3 && (
                      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                        className="bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-white">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-amber-600" />
                            <span className="font-bold text-slate-800 text-sm">装逼程度趋势</span>
                            <span className="ml-auto text-[10px] text-slate-500">按消息顺序</span>
                          </div>
                        </div>
                        <div className="p-4">
                          <div style={{ height: '160px' }}>
                            <ReactECharts option={{
                              tooltip: { trigger: 'axis', formatter: (params: any[]) => `${params[0].name}<br/>装逼分: ${params[0].value}` },
                              grid: { left: 40, right: 16, top: 10, bottom: 30 },
                              xAxis: { type: 'category', data: messages.map((_, i) => `${i + 1}`), axisLine: { lineStyle: { color: '#E2E8F0' } }, axisLabel: { fontSize: 10, color: '#94A3B8' } },
                              yAxis: { type: 'value', axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#F1F5F9' } }, axisLabel: { fontSize: 10, color: '#94A3B8' } },
                              series: [{
                                type: 'line',
                                data: messages.map(m => scoreMessage(m.text)?.score || 0),
                                smooth: true,
                                lineStyle: { color: '#EC4899', width: 2.5 },
                                areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(236,72,153,0.25)' }, { offset: 1, color: 'rgba(236,72,153,0.02)' }] } },
                                itemStyle: { color: '#EC4899' },
                                symbol: 'circle',
                                symbolSize: 6,
                              }]
                            }} style={{ height: '160px' }} />
                          </div>
                          <div className="mt-2 text-[10px] text-slate-500 text-center">
                            共 {messages.length} 条消息 · {currentRoleAnalysis.streakLength > 1 ? `最长连续装逼 ${currentRoleAnalysis.streakLength} 条` : '无连续装逼'}
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* 信号类型分布饼图 */}
                    {currentRoleAnalysis.detectedPatterns.length > 0 && (() => {
                      const pieData = currentRoleAnalysis.detectedPatterns.map(p => ({
                        name: p.name.split('（')[0],
                        value: p.count,
                        itemStyle: { color: p.color }
                      }))
                      const pieOption = {
                        tooltip: { trigger: 'item', formatter: '{b}: {c}次 ({d}%)' },
                        series: [{ type: 'pie', radius: ['40%', '70%'], center: ['50%', '50%'], avoidLabelOverlap: true, itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 }, label: { show: true, fontSize: 10, fontWeight: 'bold', color: '#64748B' }, data: pieData }]
                      }
                      return (
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                          className="bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
                          <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-pink-50 to-white">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="w-4 h-4 text-pink-600" />
                              <span className="font-bold text-slate-800 text-sm">信号类型分布</span>
                              <span className="ml-auto text-[10px] text-slate-500">{currentRoleAnalysis.detectedPatterns.length} 种信号</span>
                            </div>
                          </div>
                          <div className="p-4">
                            <ReactECharts option={pieOption} style={{ height: '200px' }} />
                            <div className="mt-3 flex flex-wrap gap-2">
                              {currentRoleAnalysis.detectedPatterns.map((p, i) => (
                                <div key={i} className="flex items-center gap-1.5 text-[11px]">
                                  <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                                  <span className="text-slate-600">{p.name.split('（')[0]}</span>
                                  <span className="font-bold text-slate-800">×{p.count}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )
                    })()}
                  </div>

                  {/* 右侧：人格画像海报 + 证据卡片 + 其他 */}
                  <div className="space-y-5">
                    {/* 人格画像海报（小卡片版，点击展开全屏报告） */}
                    {currentRoleAnalysis && (
                      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                        className="bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{personality.icon}</span>
                            <div>
                              <div className="font-bold text-white text-sm">装逼人格画像 · {currentRoleAnalysis.roleName}</div>
                              <div className="text-[10px] text-white/90">DPU · 人格检测报告</div>
                            </div>
                            <span className="ml-auto text-[10px] px-2 py-1 rounded-full bg-white/20 text-white font-semibold">
                              {personality.code}
                            </span>
                          </div>
                        </div>

                        {/* 小卡片预览 */}
                        <div className="p-5 cursor-pointer hover:bg-slate-50/50 transition-colors" onClick={() => setShowFullReport(true)}>
                          <div className="rounded-xl p-4 mb-3 text-white" style={{ background: `linear-gradient(to bottom right, ${personality.gradientFrom}, ${personality.gradientTo})` }}>
                            <div className="flex items-center gap-3">
                              <div className="text-3xl">{personality.icon}</div>
                              <div className="flex-1">
                                <div className="text-[10px] opacity-80">人格类型 · {personality.code}</div>
                                <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                            <div className="text-xl font-black">{personality.name}</div>
                            {!perRoleDeepReport.has(currentRoleAnalysis.roleId) && deepAnalyzingRoleId !== currentRoleAnalysis.roleId && (
                              <button
                                onClick={() => {
                                  const rid = currentRoleAnalysis.roleId
                                  const roleInfo = roles.find(r => r.id === rid)
                                  if (!roleInfo) return
                                  setDeepAnalyzingRoleId(rid)
                                  setPerRoleDeepError(null)
                                  // 先展开加载区
                                  setPerRoleDeepReport(prev => { const m = new Map(prev); m.set(rid, '__loading__'); return m })
                                  runPerRoleDeepAnalysis({ id: rid, name: currentRoleAnalysis.roleName }, messages, roles, conversationBg, scene, {
                                    finalIndex: currentRoleAnalysis.finalIndex,
                                    personalityName: personality.name,
                                    personalityTagline: personality.tagline,
                                    needDistribution: currentRoleAnalysis.needDistribution,
                                    topSignals: (currentRoleAnalysis.topEvidence || []).slice(0, 3).map((e: any) => `${e.reason}(${e.need})`)
                                  }).then(report => {
                                    if (report) {
                                      setPerRoleDeepReport(prev => { const m = new Map(prev); m.set(rid, report); return m })
                                    } else {
                                      setPerRoleDeepReport(prev => { const m = new Map(prev); m.delete(rid); return m })
                                      setPerRoleDeepError('LLM调用失败，请检查API配置或打开F12查看错误')
                                    }
                                    setDeepAnalyzingRoleId(null)
                                  })
                                }}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-600 text-[10px] font-bold hover:bg-purple-100 border border-purple-200 transition-all">
                                <Brain className="w-3 h-3" /> AI深度解析
                              </button>
                            )}
                            {deepAnalyzingRoleId === currentRoleAnalysis.roleId && (
                              <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-500 text-[10px] font-bold border border-purple-200">
                                <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                                  <SparklesIcon className="w-3 h-3" />
                                </motion.span> 解析中…
                              </span>
                            )}
                            {perRoleDeepReport.has(currentRoleAnalysis.roleId) && perRoleDeepReport.get(currentRoleAnalysis.roleId) !== '__loading__' && (
                              <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-600 font-bold">✓ 已解析</span>
                            )}
                          </div>
                          </div>
                                <div className="text-[11px] opacity-90">「{personality.tagline}」</div>
                              </div>
                              <div className="text-right">
                                <div className="text-3xl font-black">{currentRoleAnalysis.finalIndex}</div>
                                <div className="text-[10px] opacity-80">/100</div>
                              </div>
                            </div>
                          </div>
                          <div className="text-xs text-slate-600 leading-relaxed mb-3">{personality.description}</div>
                          <div className="flex gap-2">
                            <span className="text-[10px] px-2 py-1 rounded-full bg-violet-50 text-violet-600 font-semibold">{personality.archetype}</span>
                            <span className="text-[10px] px-2 py-1 rounded-full bg-amber-50 text-amber-600 font-semibold">{currentRoleAnalysis.finalIndex >= 70 ? '🔥 重度' : currentRoleAnalysis.finalIndex >= 50 ? '⚡ 中度' : '🌿 轻度'}</span>
                          </div>

                          {/* 单角色 AI 深度解析报告 — 点击后展开加载动画，生成后显示报告 */}
                          {perRoleDeepError && (
                            <div className="mt-2 bg-red-50 rounded-lg p-2 border border-red-100">
                              <p className="text-[10px] text-red-600">{perRoleDeepError}</p>
                            </div>
                          )}
                          {perRoleDeepReport.has(currentRoleAnalysis.roleId) && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.4, ease: 'easeInOut' }}
                              className="mt-4 bg-gradient-to-br from-purple-50/50 via-white to-pink-50/50 rounded-xl border-2 border-purple-300 shadow-lg overflow-hidden">
                              {perRoleDeepReport.get(currentRoleAnalysis.roleId) === '__loading__' ? (
                                <div className="p-6">
                                  <div className="text-sm font-black text-purple-800 mb-4 flex items-center gap-2 border-b border-purple-200 pb-3">
                                    <Brain className="w-4 h-4" /> {currentRoleAnalysis.roleName} · AI 正在深度解析...
                                  </div>
                                  <div className="space-y-3">
                                    <div className="flex items-center gap-3">
                                      <motion.span
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                                      ><SparklesIcon className="w-5 h-5 text-purple-500" /></motion.span>
                                      <span className="text-xs text-purple-700 font-semibold">大模型正在分析社交信号、人格特质与行为动机...</span>
                                    </div>
                                    <div className="space-y-2 pl-2">
                                      {['🔍 提取表达策略与话术模式...', '🧠 分析心理动因与需求层级...', '💬 生成社交人格画像报告...'].map((step, i) => (
                                        <motion.div
                                          key={i}
                                          initial={{ opacity: 0, x: -10 }}
                                          animate={{ opacity: 1, x: 0 }}
                                          transition={{ delay: i * 0.3 + 0.3 }}
                                          className="flex items-center gap-2"
                                        >
                                          <motion.div
                                            animate={{ opacity: [0.3, 1, 0.3] }}
                                            transition={{ duration: 2, repeat: Infinity, delay: i * 0.5 }}
                                            className="w-1.5 h-1.5 rounded-full bg-purple-400"
                                          />
                                          <span className="text-[11px] text-slate-500">{step}</span>
                                        </motion.div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="p-5 max-h-[800px] overflow-y-auto">
                                  <div className="text-sm font-black text-purple-800 mb-3 flex items-center gap-2 border-b border-purple-200 pb-3">
                                    <Brain className="w-4 h-4" /> {currentRoleAnalysis.roleName} · AI深度社交人格画像
                                  </div>
                                  {/* DPU 人格标签（固定） */}
                                  <div className="mb-3 p-2 rounded-lg bg-violet-50 border border-violet-100 flex items-center gap-2">
                                    <span className="text-lg">{personality.icon}</span>
                                    <div>
                                      <span className="text-xs font-black text-violet-700">{personality.name}</span>
                                      <span className="text-[10px] text-violet-500 ml-1.5">{personality.code} · {personality.tagline}</span>
                                    </div>
                                  </div>
                                  <div className="text-xs leading-relaxed text-slate-700">
                                    {renderMarkdown(perRoleDeepReport.get(currentRoleAnalysis.roleId)!)}
                                  </div>
                                  {/* 查看完整报告按钮 */}
                                  <div className="mt-4 pt-3 border-t border-purple-200 flex justify-center">
                                    <button
                                      onClick={() => setShowFullReport(true)}
                                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-xs font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all"
                                    >
                                      <FileText className="w-4 h-4" /> 查看完整报告（含 PDF 导出）
                                    </button>
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          )}


                        </div>
                      </motion.div>
                    )}

                    {/* 装逼证据卡片列表 */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                      className="bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-pink-50 via-white to-indigo-50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-pink-600" />
                            <span className="font-bold text-slate-800 text-sm">{currentRoleAnalysis.roleName} · 装逼证据</span>
                          </div>
                          <span className="text-[11px] text-slate-500 font-semibold">
                            {currentRoleAnalysis.topEvidence.length} 条可疑信号
                          </span>
                        </div>
                      </div>
                      <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
                        {currentRoleAnalysis.topEvidence.length > 0 ? (
                          currentRoleAnalysis.topEvidence.map((ev, i) => (
                            <motion.div key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.05 }}
                              className="p-4 rounded-xl bg-gradient-to-r from-pink-50/80 via-white to-indigo-50/60 border border-slate-200 hover:border-pink-300 hover:shadow-md transition-all">
                              <div className="flex items-start gap-3 mb-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="px-2.5 py-1 rounded-full bg-pink-100 text-pink-700 text-[11px] font-bold">
                                    {ev.reason}
                                  </span>
                                  <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
                                    得分 {ev.score}
                                  </span>
                                  <span className="text-[11px] text-slate-500 font-semibold">
                                    {ev.need && SHOWOFF_NEEDS.find(n => n.id === ev.need)?.name || ''}
                                  </span>
                                </div>
                              </div>
                              <p className="text-sm text-slate-800 font-bold leading-relaxed">
                                "{ev.quote}"
                              </p>
                            </motion.div>
                          ))
                        ) : (
                          <div className="text-center py-10 text-slate-400">
                            <Heart className="w-10 h-10 mx-auto mb-2 opacity-50" />
                            <p className="text-xs">无明显装逼信号，这个人很真诚</p>
                          </div>
                        )}
                      </div>
                    </motion.div>

                    {/* 对话回顾（当前角色） */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                      className="bg-white/90 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50 via-white to-pink-50">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-indigo-600" />
                          <span className="font-bold text-slate-800 text-sm">对话回顾 · {currentRoleAnalysis.roleName} 的消息</span>
                        </div>
                      </div>
                      <div className="p-4 space-y-2 max-h-[260px] overflow-y-auto">
                        {messages.filter(m => m.roleId === currentRoleAnalysis.roleId).map((msg, i) => (
                          <div key={msg.id} className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200/70 hover:border-slate-300 transition-all">
                            <span className="text-sm flex-shrink-0">💬</span>
                            <div className="text-xs text-slate-800 leading-relaxed flex-1">
                              {msg.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>

                    {/* 全屏详细报告弹窗 */}
                    {showFullReport && (
                      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowFullReport(false)}>
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
                          onClick={e => e.stopPropagation()}>

                          {/* 弹窗头部 */}
                          <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{personality.icon}</span>
                              <div>
                                <div className="font-bold text-slate-800">{currentRoleAnalysis.roleName} · 完整分析报告</div>
                                <div className="text-[10px] text-slate-500">DPU 需求势能引擎 · {new Date().toLocaleDateString('zh-CN')}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={handleGeneratePosterPdf} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold hover:shadow-lg transition-all flex items-center gap-1 shadow-sm">
                                <FileText className="w-3.5 h-3.5" />导出 PDF
                              </button>
                              <button onClick={() => setShowFullReport(false)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center">
                                ✕
                              </button>
                            </div>
                          </div>

                          {/* 报告主体（用于 PDF 导出） */}
                          <div ref={posterRef} className="p-6 space-y-6">

                            {/* 封面 */}
                            <div className="rounded-2xl p-6 text-white" style={{ background: `linear-gradient(to bottom right, ${personality.gradientFrom}, ${personality.gradientTo})` }}>
                              <div className="flex items-start gap-4">
                                <div className="text-5xl">{personality.icon}</div>
                                <div className="flex-1">
                                  <div className="text-sm opacity-90 mb-1">DPU 人格检测报告</div>
                                  <div className="text-3xl font-black">{personality.name}</div>
                                  <div className="text-lg mt-1 opacity-90">「{personality.tagline}」</div>
                                  <div className="mt-2 text-sm opacity-80">{personality.archetype} · {personality.need}</div>
                                </div>
                                <div className="text-right">
                                  <div className="text-6xl font-black">{currentRoleAnalysis.finalIndex}</div>
                                  <div className="text-lg opacity-80">/100</div>
                                  <div className="mt-2 text-xs px-3 py-1 rounded-full bg-white/20 inline-block">
                                    {currentRoleAnalysis.finalIndex >= 70 ? '🔥 重度装逼' : currentRoleAnalysis.finalIndex >= 50 ? '⚡ 中度装逼' : currentRoleAnalysis.finalIndex >= 30 ? '🌿 轻度装逼' : '✨ 正常表达'}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* DPU 价值说明 */}
                            <div className="p-4 rounded-xl bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200">
                              <div className="text-sm font-bold text-violet-800 mb-2">🧠 DPU 需求势能分析引擎</div>
                              <div className="text-xs text-violet-700 leading-relaxed">
                                本报告由 DPU（Demand Processing Unit）需求处理单元生成。DPU 基于马斯洛需求层次理论的社交变体（D2社交归属/D4尊重认可/D5认知求知/D6审美价值/D8自由掌控），通过规则引擎对对话文本进行多维度信号检测、需求势能计算和组合效应分析，最终输出人格画像与社交策略建议。
                              </div>
                            </div>

                            {/* 核心需求分布 */}
                            <div>
                              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                                <span className="w-1 h-4 rounded-full bg-violet-500" />核心需求分布
                              </h3>
                              <div className="space-y-2">
                                {Object.entries(currentRoleAnalysis.needDistribution)
                                  .filter(([_, pct]) => typeof pct === 'number' && pct > 5)
                                  .reduce((acc, [id, pct]) => {
                                    if (!acc.find(item => item[0] === id)) {
                                      acc.push([id, pct])
                                    }
                                    return acc
                                  }, [] as Array<[string, number]>)
                                  .sort((a, b) => b[1] - a[1])
                                  .map(([id, pct]) => {
                                    const need = SHOWOFF_NEEDS.find(n => n.id === id)
                                    const gradientMap: Record<string, string> = {
                                      'D4': 'from-indigo-400 to-indigo-600',
                                      'D6': 'from-pink-400 to-pink-600',
                                      'D8': 'from-violet-400 to-violet-600',
                                      'D2': 'from-emerald-400 to-emerald-600',
                                      'D5': 'from-sky-400 to-sky-600',
                                    }
                                    const gradientClass = gradientMap[id] || 'from-slate-400 to-slate-500'
                                    return (
                                      <div key={id} className="flex items-center gap-3">
                                        <span className="w-20 text-xs font-semibold text-slate-700">{need?.name || id}</span>
                                        <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                                          <div className={`h-full rounded-full bg-gradient-to-r ${gradientClass}`} style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="w-12 text-right text-xs font-bold text-slate-700">{pct}%</span>
                                      </div>
                                    )
                                  })}
                              </div>
                            </div>

                            {/* LLM 深度解析报告（注入到 PDF 捕获区） */}
                            {perRoleDeepReport.has(currentRoleAnalysis.roleId) && (
                              <div className="rounded-2xl p-5 bg-white border-4 border-dashed border-purple-300">
                                <h3 className="text-sm font-black text-purple-700 mb-3 flex items-center gap-2">
                                  <Brain className="w-4 h-4" /> {currentRoleAnalysis.roleName} · AI 深度解析
                                </h3>
                                <div className="text-xs leading-relaxed text-slate-700 prose-sm max-w-none">
                                  {renderMarkdown(perRoleDeepReport.get(currentRoleAnalysis.roleId)!)}
                                </div>
                              </div>
                            )}

                            {/* 人格类型详解 */}
                            <div className="rounded-2xl p-5 text-white" style={{ background: `linear-gradient(to bottom right, ${personality.gradientFrom}, ${personality.gradientTo})` }}>
                              <div className="text-xs opacity-80 mb-1">类型诊断 · {personality.code}</div>
                              <div className="text-2xl font-black mb-1">{personality.name} <span className="text-base opacity-90 font-bold">「{personality.tagline}」</span></div>
                              <div className="text-xs opacity-80 mb-3">{personality.archetype} · {personality.need}</div>
                              <div className="space-y-3 text-xs leading-relaxed">
                                <div>
                                  <span className="font-bold opacity-90">🧍 生活画像：</span>
                                  {personality.lifeProfile}
                                </div>
                                <div>
                                  <span className="font-bold opacity-90">🎯 核心需求：</span>
                                  {personality.coreNeed}
                                </div>
                                <div>
                                  <span className="font-bold opacity-90">✨ 典型特征：</span>
                                  {personality.telltaleSigns.map((s, i) => `${i + 1}. ${s}`).join('；')}
                                </div>
                                <div>
                                  <span className="font-bold opacity-90">💡 社交建议：</span>
                                  {personality.howToDeal}
                                </div>
                                <div className="pt-2 mt-2 border-t border-white/20 italic opacity-90">
                                  💫 {personality.funFact}
                                </div>
                              </div>
                            </div>

                            {/* DPU 深层需求分析（规则引擎生成，非 AI） */}
                            <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200">
                              <h3 className="text-sm font-bold text-amber-800 mb-4 flex items-center gap-2">
                                🔥 DPU 深度解剖
                              </h3>

                              {/* 表层含义 */}
                              <div className="mb-4">
                                <div className="text-xs font-bold text-amber-700 mb-2 flex items-center gap-1">
                                  <span className="w-5 h-5 rounded-full bg-white text-amber-600 flex items-center justify-center text-[10px] font-black">表</span>
                                  表层表达解读
                                </div>
                                <div className="pl-6 text-xs text-amber-900 leading-relaxed bg-white/60 rounded-lg p-3 border-l-2 border-amber-300">
                                  {(() => {
                                    const topPattern = currentRoleAnalysis.detectedPatterns?.[0]
                                    const topNeedId = Object.entries(currentRoleAnalysis.needDistribution)
                                      .sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0]
                                    const topNeed = SHOWOFF_NEEDS.find(n => n.id === topNeedId)
                                    if (topPattern && topNeed) {
                                      return `对话以"${topPattern.name}"为核心表达策略，配合 ${currentRoleAnalysis.detectedPatterns?.slice(1, 3).map(p => p.name).join('、') || '其他信号'} 的辅助表达。整体呈现出 ${currentRoleAnalysis.finalIndex >= 60 ? '较强' : '一定'} 的社交信号密度——` +
                                        (topNeedId === 'D8' ? 'TA似乎习惯用"主动安排"的方式来定义社交互动的节奏和边界。' :
                                         topNeedId === 'D4' ? 'TA似乎习惯通过展示能力、资源或经验来获得对话中的主导权和认可。' :
                                         topNeedId === 'D2' ? 'TA把社交互动当作建立和巩固关系网络的机会，热情邀约就是最好的证明。' :
                                         topNeedId === 'D6' ? 'TA对品味、细节有独特的表达偏好，通过对"好"的定义来建立自身的格调。' :
                                         topNeedId === 'D5' ? 'TA习惯用知识输出和见解分享的方式来参与对话，信息差是TA的社交货币。' :
                                         'TA的表达相对平和，没有明显的强烈需求，就是一次普通的社交互动。')
                                    }
                                    return '暂时没有足够的信号来进行深度解读。'
                                  })()}
                                </div>
                              </div>

                              {/* 深层含义 */}
                              <div className="mb-4">
                                <div className="text-xs font-bold text-amber-700 mb-2 flex items-center gap-1">
                                  <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-black">深</span>
                                  深层动机揭示
                                </div>
                                <div className="pl-6 text-xs text-amber-900 leading-relaxed bg-white/60 rounded-lg p-3 border-l-2 border-amber-500">
                                  {(() => {
                                    const needs = Object.entries(currentRoleAnalysis.needDistribution)
                                      .filter(([_, pct]) => typeof pct === 'number' && pct > 10)
                                      .sort((a, b) => (b[1] as number) - (a[1] as number))
                                    if (needs.length === 0) return '没有检测到显著的需求信号。'

                                    const [topId, topPct] = needs[0]
                                    const [secondId, secondPct] = needs[1] || [null, 0]
                                    const topName = SHOWOFF_NEEDS.find(n => n.id === topId)?.name || topId
                                    const secondName = secondId ? SHOWOFF_NEEDS.find(n => n.id === secondId)?.name : ''

                                    let analysis = `表面上是一次普通的对话，底层其实是在进行"需求势能"的传递——`
                                    analysis += `${topName}(${topPct}%) 是TA最强烈的底层需求。`

                                    if (topId === 'D8') {
                                      analysis += '当TA频繁使用"我来安排""没问题""我带"这类表达时，其实是在说："这场互动由我主导，我有能力掌控节奏和结果。"这本质上是一种对"选择自由"和"掌控感"的心理需求。'
                                    } else if (topId === 'D4') {
                                      analysis += '当TA展示能力、资源或经验时，其实是在说："我有你值得重视的价值。"这不是虚伪——每个人都需要被看见，只是有些人选择了更直接的方式。'
                                    } else if (topId === 'D2') {
                                      analysis += '当TA热情邀约、频繁提及"我们""一起"时，其实是在说："我想和你建立更紧密的关系。"社交归属是人类的基本需求，TA只是表现得更主动。'
                                    } else if (topId === 'D6') {
                                      analysis += '当TA谈论品味、细节、品质时，其实是在说："我有独特的审美和价值观。"格调是一种无声的社交货币——它不需要大声说出来，懂的人自然会懂。'
                                    } else if (topId === 'D5') {
                                      analysis += '当TA输出知识、纠正理解时，其实是在说："我掌握了你可能不知道的信息。"认知优势是一种温和但有效的社交策略——不攻击任何人，但让你意识到TA的价值。'
                                    }

                                    if (secondPct && secondName) {
                                      analysis += `此外，${secondName}(${secondPct}%) 是TA的次要需求——这意味着TA的表达可能同时服务于多个心理目标。`
                                    }

                                    analysis += `综合装逼指数 ${currentRoleAnalysis.finalIndex}/100 说明了一件事：${currentRoleAnalysis.finalIndex >= 70 ? 'TA的社交表达策略非常主动，信号密度高，是典型的"强势表达者"。' : currentRoleAnalysis.finalIndex >= 50 ? 'TA的社交表达有明显的策略性，但控制在适度范围内。' : currentRoleAnalysis.finalIndex >= 30 ? 'TA的社交表达相对自然，偶尔有策略性表达，大部分是无意识的。' : 'TA的表达非常自然，几乎没有明显的策略性。'}`
                                    return analysis
                                  })()}
                                </div>
                              </div>

                              {/* DPU 计算价值说明 */}
                              <div>
                                <div className="text-xs font-bold text-amber-700 mb-2 flex items-center gap-1">
                                  <span className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center text-[10px] font-black">DPU</span>
                                  DPU 算法的计算价值
                                </div>
                                <div className="pl-6 text-xs text-amber-900 leading-relaxed bg-white/60 rounded-lg p-3 border-l-2 border-orange-500 space-y-2">
                                  <p><span className="font-bold">信号检测层：</span>对 {currentRoleAnalysis.detectedPatterns?.reduce((sum: number, p: any) => sum + (p.count || 0), 0) || 0} 个装逼信号进行识别和分类（组合叠加、数量夸张、社交邀约、能力暗示等），每个信号映射到对应的需求维度。</p>
                                  <p><span className="font-bold">需求势能层：</span>将识别出的信号按比例分配到 5 个需求维度（D2/D4/D5/D6/D8），计算每个维度的相对权重，形成需求势能分布图。</p>
                                  <p><span className="font-bold">人格推导层：</span>基于需求分布的模式（主导需求、组合效应、信号特征），从 8 种人格类型中匹配最佳拟合结果——本案例识别为 <span className="font-bold">「{personality.name}」</span>（{personality.code}）。</p>
                                  <p className="pt-2 mt-2 border-t border-amber-200 italic opacity-80">💡 理解这些信号背后的心理需求，不是为了"揭穿"TA，而是为了更懂TA——当你看清表层表达下的真实动机，沟通才真正开始。</p>
                                </div>
                              </div>
                            </div>

                            {/* 需求分布雷达图 */}
                            <div>
                              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                                <span className="w-1 h-4 rounded-full bg-indigo-500" />需求分布雷达图
                              </h3>
                              <div style={{ height: '260px' }}>
                                <ReactECharts option={{
                                  radar: {
                                    indicator: SHOWOFF_NEEDS.map(need => ({ name: need.name, max: 100 })),
                                    shape: 'polygon',
                                    splitNumber: 3,
                                    axisName: { color: '#475569', fontSize: 12, fontWeight: 600 },
                                    splitLine: { lineStyle: { color: '#e2e8f0' } },
                                    splitArea: { areaStyle: { color: ['#fafafa', '#ffffff', '#fafafa'] } },
                                    axisLine: { lineStyle: { color: '#cbd5e1' } }
                                  },
                                  series: [{
                                    type: 'radar',
                                    data: [{
                                      value: SHOWOFF_NEEDS.map(n => currentRoleAnalysis!.needDistribution[n.id] || 0),
                                      name: currentRoleAnalysis.roleName,
                                      areaStyle: { color: 'rgba(236, 72, 153, 0.25)' },
                                      lineStyle: { color: '#ec4899', width: 2 },
                                      itemStyle: { color: '#ec4899' }
                                    }]
                                  }]
                                }} style={{ height: '260px' }} />
                              </div>
                            </div>

                            {/* 装逼趋势图 */}
                            {messages.length >= 3 && (
                              <div>
                                <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                                  <span className="w-1 h-4 rounded-full bg-amber-500" />装逼程度趋势
                                </h3>
                                <div style={{ height: '180px' }}>
                                  <ReactECharts option={{
                                    tooltip: { trigger: 'axis', formatter: (params: any[]) => `${params[0].name}<br/>装逼分: ${params[0].value}` },
                                    grid: { left: 40, right: 16, top: 10, bottom: 30 },
                                    xAxis: { type: 'category', data: messages.map((_, i) => `${i + 1}`), axisLine: { lineStyle: { color: '#E2E8F0' } }, axisLabel: { fontSize: 10, color: '#94A3B8' } },
                                    yAxis: { type: 'value', axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#F1F5F9' } }, axisLabel: { fontSize: 10, color: '#94A3B8' } },
                                    series: [{
                                      type: 'line',
                                      data: messages.map(m => scoreMessage(m.text)?.score || 0),
                                      smooth: true,
                                      lineStyle: { color: '#EC4899', width: 2.5 },
                                      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(236,72,153,0.25)' }, { offset: 1, color: 'rgba(236,72,153,0.02)' }] } },
                                      itemStyle: { color: '#EC4899' },
                                      symbol: 'circle',
                                      symbolSize: 6,
                                    }]
                                  }} style={{ height: '180px' }} />
                                </div>
                              </div>
                            )}

                            {/* 装逼信号证据（增强版：包含引用片段） */}
                            <div>
                              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                                <span className="w-1 h-4 rounded-full bg-pink-500" />检测到的信号证据
                              </h3>
                              <div className="space-y-2">
                                {(currentRoleAnalysis.detectedPatterns || []).slice(0, 6).map((p, i) => {
                                  const relatedQuote = currentRoleAnalysis.topEvidence[i % Math.max(currentRoleAnalysis.topEvidence.length, 1)]
                                  return (
                                    <div key={i} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                                      <div className="flex items-center gap-2 mb-1">
                                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
                                        <span className="text-xs font-bold text-slate-700">{p.name}</span>
                                        <span className="ml-auto text-xs text-slate-500 font-semibold">出现 {p.count} 次</span>
                                      </div>
                                      {relatedQuote && (
                                        <div className="pl-4 mt-1 text-xs text-slate-600 italic border-l-2" style={{ borderColor: p.color }}>
                                          「{relatedQuote.quote}」<span className="text-slate-400 not-italic"> · {relatedQuote.reason}</span>
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>

                            {/* DPU 深层需求诊断 */}
                            <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-violet-200">
                              <h3 className="text-sm font-bold text-violet-800 mb-3 flex items-center gap-2">
                                🧠 DPU 需求势能诊断
                              </h3>
                              <div className="space-y-2 text-xs text-violet-700 leading-relaxed">
                                <p><span className="font-bold">分析框架：</span>DPU（Demand Processing Unit）基于马斯洛需求层次理论的社交变体，通过规则引擎对对话中的{currentRoleAnalysis.detectedPatterns?.length || 0}类信号进行多维度检测，计算出需求势能分布，并推导出人格画像。</p>
                                <p><span className="font-bold">需求优先级：</span>
                                  {Object.entries(currentRoleAnalysis.needDistribution)
                                    .filter(([_, pct]) => typeof pct === 'number' && pct > 10)
                                    .sort((a, b) => (b[1] as number) - (a[1] as number))
                                    .slice(0, 3)
                                    .map(([id, pct]) => {
                                      const need = SHOWOFF_NEEDS.find(n => n.id === id)
                                      return `${need?.name || id}(${pct}%)`
                                    })
                                    .join(' → ') || '无显著需求'}
                                </p>
                                <p><span className="font-bold">装逼强度评估：</span>
                                  {currentRoleAnalysis.finalIndex >= 70 ? '🔥 重度装逼 — 装逼信号密集，组合效应明显，装逼意图强烈且主动。' :
                                   currentRoleAnalysis.finalIndex >= 50 ? '⚡ 中度装逼 — 有明显装逼信号，但还在可控范围内，可能是习惯或者情境触发。' :
                                   currentRoleAnalysis.finalIndex >= 30 ? '🌿 轻度装逼 — 偶有装逼信号，更像是无意识的表达习惯。' :
                                   '✨ 正常表达 — 装逼指数在合理范围内，就是日常聊天。'}
                                </p>
                              </div>
                            </div>

                            {/* AI 深度解析（如果有） */}
{/* 典型话术 */}
                            <div>
                              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                                <span className="w-1 h-4 rounded-full bg-amber-500" />{personality.name}的典型话术
                              </h3>
                              <div className="flex flex-wrap gap-2">
                                {personality.signaturePhrases.map((p, i) => (
                                  <span key={i} className="px-3 py-2 rounded-lg bg-gradient-to-r from-violet-50 to-fuchsia-50 border border-violet-200 text-xs text-violet-700 font-semibold">
                                    {p}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* 页脚 */}
                            <div className="pt-4 border-t border-slate-200 text-center">
                              <div className="text-xs font-bold text-slate-700">DPU · 社交语言理解系统</div>
                              <div className="text-[10px] text-slate-400 mt-1">基于需求层次理论 (D2/D4/D5/D6/D8) · 多维度信号检测 · 组合效应分析</div>
                            </div>
                          </div>
                        </motion.div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        )}
      </div>
      {/* 隐藏的 A4 导出容器 - 专门用于 html2canvas 截取，宽度固定 A4 */}
      {currentRoleAnalysis && (
        <div
          ref={exportRef}
          style={{
            position: 'fixed',
            left: '-9999px',
            top: 0,
            width: '794px',
            background: '#ffffff',
            padding: '30px',
            fontSize: '14px',
            lineHeight: 1.6,
            color: '#1e293b',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
          }}
        >
          {/* 顶部标题 */}
          <div style={{ textAlign: 'center', borderBottom: '2px solid #e2e8f0', paddingBottom: '16px', marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', color: '#64748b', letterSpacing: '2px' }}>DPU 需求势能引擎 · {new Date().toLocaleDateString('zh-CN')}</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', marginTop: '6px' }}>{currentRoleAnalysis.roleName} · 人格检测报告</div>
          </div>

          {/* 封面卡片 */}
          <div style={{
            background: `linear-gradient(135deg, ${personality.gradientFrom}, ${personality.gradientTo})`,
            borderRadius: '12px',
            padding: '24px',
            color: 'white',
            marginBottom: '20px'
          }}>
            <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '6px' }}>{personality.code} · {personality.archetype}</div>
            <div style={{ fontSize: '32px', fontWeight: 900 }}>{personality.icon} {personality.name}</div>
            <div style={{ fontSize: '14px', marginTop: '8px', opacity: 0.95 }}>「{personality.tagline}」</div>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: '16px', gap: '12px' }}>
              <div style={{ fontSize: '48px', fontWeight: 900 }}>{currentRoleAnalysis.finalIndex}</div>
              <div style={{ fontSize: '12px', opacity: 0.9 }}>
                <div>/100</div>
                <div style={{ marginTop: '4px' }}>
                  {currentRoleAnalysis.finalIndex >= 70 ? '🔥 重度装逼' : currentRoleAnalysis.finalIndex >= 50 ? '⚡ 中度装逼' : currentRoleAnalysis.finalIndex >= 30 ? '🌿 轻度装逼' : '✨ 正常表达'}
                </div>
              </div>
            </div>
          </div>

          {/* 核心需求分布 */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>📊 核心需求分布</h3>
            {Object.entries(currentRoleAnalysis.needDistribution)
              .filter(([, pct]) => typeof pct === 'number' && pct > 5)
              .sort((a, b) => (b[1] as number) - (a[1] as number))
              .map(([id, pct]) => {
                const need = SHOWOFF_NEEDS.find(n => n.id === id)
                const gradientMap: Record<string, string> = {
                  'D4': 'linear-gradient(90deg, #6366f1, #818cf8)',
                  'D6': 'linear-gradient(90deg, #ec4899, #f472b6)',
                  'D8': 'linear-gradient(90deg, #8b5cf6, #a78bfa)',
                  'D2': 'linear-gradient(90deg, #10b981, #34d399)',
                  'D5': 'linear-gradient(90deg, #0ea5e9, #38bdf8)'
                }
                return (
                  <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <div style={{ width: '100px', fontSize: '13px', color: '#475569', fontWeight: 600 }}>{need?.name || id}</div>
                    <div style={{ flex: 1, height: '14px', background: '#f1f5f9', borderRadius: '7px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: gradientMap[id] || '#64748b', borderRadius: '7px' }} />
                    </div>
                    <div style={{ width: '50px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#334155' }}>{pct}%</div>
                  </div>
                )
              })}
          </div>

          {/* 人格类型详解 */}
          <div style={{ background: `linear-gradient(135deg, ${personality.gradientFrom}, ${personality.gradientTo})`, borderRadius: '12px', padding: '24px', color: 'white', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>🎭 人格类型详解 · {personality.name}</h3>
            <div style={{ fontSize: '13px', lineHeight: 1.8 }}>
              <p style={{ margin: '0 0 10px' }}><strong>🧍 生活画像：</strong>{personality.lifeProfile}</p>
              <p style={{ margin: '0 0 10px' }}><strong>🎯 核心需求：</strong>{personality.coreNeed}</p>
              <p style={{ margin: '0 0 10px' }}><strong>✨ 典型特征：</strong>{personality.telltaleSigns.join('；')}</p>
              <p style={{ margin: '0 0 10px' }}><strong>💡 社交建议：</strong>{personality.howToDeal}</p>
              <p style={{ margin: '0', fontStyle: 'italic', opacity: 0.9 }}>💫 {personality.funFact}</p>
            </div>
          </div>

          {/* DPU 深层需求分析 */}
          <div style={{ background: 'linear-gradient(135deg, #fffbeb, #fef3c7)', border: '1px solid #fbbf24', borderRadius: '12px', padding: '24px', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#92400e', marginBottom: '16px' }}>🔥 DPU 深度解剖</h3>

            <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: '8px', padding: '14px', borderLeft: '3px solid #fbbf24', marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400e', marginBottom: '6px' }}>表 · 表层表达解读</div>
              <div style={{ fontSize: '12px', color: '#78350f', lineHeight: 1.8 }}>
                {(() => {
                  const topPattern = currentRoleAnalysis.detectedPatterns?.[0]
                  const topNeedId = (Object.entries(currentRoleAnalysis.needDistribution)
                    .sort((a, b) => (b[1] as number) - (a[1] as number))[0] || [])[0] as string
                  const topNeed = SHOWOFF_NEEDS.find(n => n.id === topNeedId)
                  if (topPattern && topNeed) {
                    return `对话以"${topPattern.name}"为核心表达策略，配合 ${currentRoleAnalysis.detectedPatterns?.slice(1, 3).map((p: any) => p.name).join('、') || '其他信号'} 的辅助表达。整体呈现出 ${currentRoleAnalysis.finalIndex >= 60 ? '较强' : '一定'} 的社交信号密度——` +
                      (topNeedId === 'D8' ? 'TA似乎习惯用"主动安排"的方式来定义社交互动的节奏和边界。' :
                       topNeedId === 'D4' ? 'TA似乎习惯通过展示能力、资源或经验来获得对话中的主导权和认可。' :
                       topNeedId === 'D2' ? 'TA把社交互动当作建立和巩固关系网络的机会，热情邀约就是最好的证明。' :
                       topNeedId === 'D6' ? 'TA对品味、细节有独特的表达偏好，通过对"好"的定义来建立自身的格调。' :
                       topNeedId === 'D5' ? 'TA习惯用知识输出和见解分享的方式来参与对话，信息差是TA的社交货币。' :
                       'TA的表达相对平和，没有明显的强烈需求，就是一次普通的社交互动。')
                  }
                  return '暂时没有足够的信号来进行深度解读。'
                })()}
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: '8px', padding: '14px', borderLeft: '3px solid #f97316', marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400e', marginBottom: '6px' }}>深 · 深层动机揭示</div>
              <div style={{ fontSize: '12px', color: '#78350f', lineHeight: 1.8 }}>
                {(() => {
                  const needs = Object.entries(currentRoleAnalysis.needDistribution)
                    .filter(([, pct]) => typeof pct === 'number' && pct > 10)
                    .sort((a, b) => (b[1] as number) - (a[1] as number))
                  if (needs.length === 0) return '没有检测到显著的需求信号。'

                  const [topId, topPct] = needs[0]
                  const [secondId, secondPct] = needs[1] || [null, 0]
                  const topName = SHOWOFF_NEEDS.find(n => n.id === topId)?.name || topId
                  const secondName = secondId ? SHOWOFF_NEEDS.find(n => n.id === secondId)?.name : ''

                  let analysis = `表面上是一次普通的对话，底层其实是在进行"需求势能"的传递——${topName}(${topPct}%) 是TA最强烈的底层需求。`

                  if (topId === 'D8') {
                    analysis += '当TA频繁使用"我来安排""没问题""我带"这类表达时，其实是在说："这场互动由我主导，我有能力掌控节奏和结果。"这本质上是一种对"选择自由"和"掌控感"的心理需求。'
                  } else if (topId === 'D4') {
                    analysis += '当TA展示能力、资源或经验时，其实是在说："我有你值得重视的价值。"这不是虚伪——每个人都需要被看见，只是有些人选择了更直接的方式。'
                  } else if (topId === 'D2') {
                    analysis += '当TA热情邀约、频繁提及"我们""一起"时，其实是在说："我想和你建立更紧密的关系。"社交归属是人类的基本需求，TA只是表现得更主动。'
                  } else if (topId === 'D6') {
                    analysis += '当TA谈论品味、细节、品质时，其实是在说："我有独特的审美和价值观。"格调是一种无声的社交货币——它不需要大声说出来，懂的人自然会懂。'
                  } else if (topId === 'D5') {
                    analysis += '当TA输出知识、纠正理解时，其实是在说："我掌握了你可能不知道的信息。"认知优势是一种温和但有效的社交策略——不攻击任何人，但让你意识到TA的价值。'
                  }

                  if (secondPct && secondName) {
                    analysis += `此外，${secondName}(${secondPct}%) 是TA的次要需求——这意味着TA的表达可能同时服务于多个心理目标。`
                  }

                  analysis += `综合装逼指数 ${currentRoleAnalysis.finalIndex}/100 说明了一件事：${currentRoleAnalysis.finalIndex >= 70 ? 'TA的社交表达策略非常主动，信号密度高，是典型的"强势表达者"。' : currentRoleAnalysis.finalIndex >= 50 ? 'TA的社交表达有明显的策略性，但控制在适度范围内。' : currentRoleAnalysis.finalIndex >= 30 ? 'TA的社交表达相对自然，偶尔有策略性表达，大部分是无意识的。' : 'TA的表达非常自然，几乎没有明显的策略性。'}`
                  return analysis
                })()}
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: '8px', padding: '14px', borderLeft: '3px solid #ea580c' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400e', marginBottom: '6px' }}>DPU · 算法的计算价值</div>
              <div style={{ fontSize: '12px', color: '#78350f', lineHeight: 1.8 }}>
                <p style={{ margin: '0 0 8px' }}><strong>信号检测层：</strong>对 {currentRoleAnalysis.detectedPatterns?.reduce((sum: number, p: any) => sum + (p.count || 0), 0) || 0} 个装逼信号进行识别和分类（组合叠加、数量夸张、社交邀约、能力暗示等），每个信号映射到对应的需求维度。</p>
                <p style={{ margin: '0 0 8px' }}><strong>需求势能层：</strong>将识别出的信号按比例分配到 5 个需求维度（D2社交归属 / D4尊重认可 / D5认知求知 / D6审美价值 / D8自由掌控），计算每个维度的相对权重，形成需求势能分布图。</p>
                <p style={{ margin: '0' }}><strong>人格推导层：</strong>基于需求分布的模式（主导需求、组合效应、信号特征），从 8 种人格类型中匹配最佳拟合结果——本案例识别为「{personality.name}」({personality.code})。</p>
                <p style={{ margin: '10px 0 0', fontStyle: 'italic', opacity: 0.8 }}>💡 理解这些信号背后的心理需求，不是为了"揭穿"TA，而是为了更懂TA——当你看清表层表达下的真实动机，沟通才真正开始。</p>
              </div>
            </div>
          </div>

          {/* AI 深度解析报告（注入 PDF） */}
          {(() => {
            const report = perRoleDeepReport.get(currentRoleAnalysis.roleId)
            if (!report || report === '__loading__') return null
            return (
              <div style={{ background: 'linear-gradient(135deg, #faf5ff, #fdf2f8)', border: '2px dashed #c084fc', borderRadius: '12px', padding: '24px', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#7c3aed', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🤖 {currentRoleAnalysis.roleName} · AI 深度社交人格解析
                </h3>
                <div style={{ fontSize: '12px', color: '#334155', lineHeight: 1.9 }}>
                  {report.split('\n').map((line, i) => {
                    if (line.trim() === '') return <div key={i} style={{ height: '6px' }} />
                    if (line.trim().startsWith('## ')) return <h3 key={i} style={{ fontSize: '16px', fontWeight: 700, color: '#1d4ed8', margin: '16px 0 8px', paddingLeft: '10px', borderLeft: '3px solid #6366f1' }}>{line.replace('## ', '')}</h3>
                    if (line.trim().startsWith('### ')) return <h4 key={i} style={{ fontSize: '14px', fontWeight: 700, color: '#5b21b6', margin: '12px 0 6px' }}>{line.replace('### ', '')}</h4>
                    if (line.trim().startsWith('- ') || line.trim().startsWith('· ') || line.trim().startsWith('• ')) {
                      return <div key={i} style={{ margin: '4px 0', paddingLeft: '14px', display: 'flex', gap: '6px' }}><span style={{ color: '#7c3aed', fontWeight: 700 }}>·</span><span>{line.replace(/^[-·•]\s*/, '')}</span></div>
                    }
                    return <p key={i} style={{ margin: '4px 0' }}>{line}</p>
                  })}
                </div>
              </div>
            )
          })()}

          {/* 装逼信号证据 */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>🔍 检测到的信号证据</h3>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
              {(currentRoleAnalysis.detectedPatterns || []).slice(0, 6).map((p: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: i < Math.min((currentRoleAnalysis.detectedPatterns || []).length, 6) - 1 ? '1px solid #e2e8f0' : 'none' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '4px', background: p.color, flexShrink: 0 }} />
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155', flex: 1 }}>{p.name}</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>出现 {p.count} 次</div>
                </div>
              ))}
            </div>
          </div>

          {/* 典型话术 */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>💬 {personality.name}的典型话术</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {personality.signaturePhrases.map((p: string, i: number) => (
                <div key={i} style={{
                  fontSize: '12px',
                  padding: '8px 14px',
                  borderRadius: '20px',
                  background: `linear-gradient(135deg, ${personality.gradientFrom}15, ${personality.gradientTo}15)`,
                  border: `1px solid ${personality.gradientFrom}40`,
                  color: '#334155',
                  fontWeight: 600
                }}>{p}</div>
              ))}
            </div>
          </div>

          {/* 页脚 */}
          <div style={{ textAlign: 'center', borderTop: '2px solid #e2e8f0', paddingTop: '16px', marginTop: '10px' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>DPU · 社交语言理解系统</div>
            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>基于需求层次理论（D2/D4/D5/D6/D8）· 多维度信号检测 · 组合效应分析</div>
            <div style={{ fontSize: '10px', color: '#cbd5e1', marginTop: '4px' }}>本报告由 DPU 需求势能引擎自动生成 · {new Date().toLocaleDateString('zh-CN')}</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ShowoffPage