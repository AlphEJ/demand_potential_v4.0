import { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactECharts from 'echarts-for-react'
import {
  MessageSquare, Brain, BarChart3, Zap, Plus, Trash2, Send,
  ChevronRight, ChevronDown, User, Users, BookOpen, Sparkles,
  Camera, Upload, Edit3, Check, X, AlertTriangle, Lightbulb,
  Target, ArrowRight, FileText, Download, RefreshCw, Copy,
  AlertCircle, MessageCircle, TrendingUp
} from 'lucide-react'
import { chatWithModel, loadModelConfig, extractDialogueFromImage, type ChatTurn } from '../lib/llm'
import { useLlmStatus, LlmStatusBadge } from '../components/LlmStatusBadge'

// ========== 聊天内容渲染工具：支持段落、粗体、简单表格 ==========
// 把一行粗体标记 **text** 渲染为 <strong>
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

// 判断一行是否为 markdown 表格分隔线（|---|----|---| 这类）
function isTableSepLine(line: string): boolean {
  return /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(line)
}

// 判断一行是否为表格行（| 开头 或 包含 ≥3 个 | 且不是分隔线）
function isTableRow(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed.includes('|')) return false
  const pipeCount = (trimmed.match(/\|/g) || []).length
  return (trimmed.startsWith('|') && pipeCount >= 2) || pipeCount >= 3
}

// 核心渲染器：把原始文本拆为段落、表格、列表
function renderChatContent(raw: string): JSX.Element[] {
  // 清理：<br> → 真正的换行；多余的 control 字符
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

    // —— 表格检测：如果这一行是表格行，向下连续收集直到非表格行
    if (isTableRow(line)) {
      const tableRows: string[] = []
      while (i < lines.length && (isTableRow(lines[i]) || lines[i].trim() === '')) {
        if (lines[i].trim() !== '') tableRows.push(lines[i])
        i++
        if (tableRows.length > 0 && lines[i - 1] === '' && !isTableRow(lines[i])) break
      }
      // 过滤 markdown 表格分隔线
      const dataRows = tableRows.filter(r => !isTableSepLine(r))
      if (dataRows.length > 0) {
        // 第一行是 header，其余是 body
        const [header, ...body] = dataRows.map(r =>
          r.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
        )
        result.push(
          <div key={blockKey++} className="my-2 overflow-x-auto">
            <table className="text-[11px] border-collapse w-full">
              {header && (
                <thead>
                  <tr>
                    {header.map((h, j) => (
                      <th key={j} className="border border-slate-300 bg-gradient-to-r from-sky-100 to-pink-100 text-slate-800 px-2 py-1.5 text-left font-semibold whitespace-nowrap">
                        {renderInline(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {body.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? 'bg-white/60' : 'bg-slate-50/60'}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="border border-slate-300 px-2 py-1.5 align-top leading-relaxed">
                        {renderInline(cell)}
                      </td>
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

    // —— 段落：收集连续的非空行作为一个段落
    if (line.trim() !== '') {
      const paragraphLines: string[] = []
      while (i < lines.length && lines[i].trim() !== '' && !isTableRow(lines[i])) {
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

    i++ // 跳过空行
  }

  return result
}

// ========== 常量（复用项目的 12 维需求系统）==========
const NEED_NAMES = [
  '生理生存', '安全稳定', '社交归属', '情感陪伴', '尊重认可',
  '认知求知', '审美价值', '自我实现', '自由掌控', '公平公正',
  '成长进阶', '秩序规整'
]

const NEED_COLORS_RGB = [
  'rgb(239,68,68)', 'rgb(249,115,22)', 'rgb(245,158,11)',
  'rgb(132,204,22)', 'rgb(34,197,94)', 'rgb(20,184,166)',
  'rgb(6,182,212)', 'rgb(59,130,246)', 'rgb(99,102,241)',
  'rgb(139,92,246)', 'rgb(168,85,247)', 'rgb(236,72,153)'
]

const NEED_COLORS_HEX = [
  '#EF4444', '#F97316', '#F59E0B',
  '#84CC16', '#22C55E', '#14B8A6',
  '#06B6D4', '#3B82F6', '#6366F1',
  '#8B5CF6', '#A855F7', '#EC4899'
]

const SCENES = [
  { key: 'emotion', label: '💕 情感关系', color: '#F472B6', desc: '情侣、分手、暧昧、家庭矛盾' },
  { key: 'work', label: '💼 职场沟通', color: '#60A5FA', desc: '上下级、同事、客户、面试' },
  { key: 'family', label: '🏠 家庭关系', color: '#34D399', desc: '父母、子女、兄弟姐妹' },
  { key: 'sales', label: '🤝 销售谈判', color: '#FBBF24', desc: '客户、供应商、合作谈判' },
  { key: 'social', label: '🌐 社交场合', color: '#A78BFA', desc: '朋友、同学、陌生人' },
]

const UNLABELED_ROLE_ID = '__unlabeled__'
const UNLABELED_ROLE: Role = {
  id: UNLABELED_ROLE_ID,
  name: '未标注（点击选择角色）',
  color: '#F59E0B',
  avatar: '❓',
  relation: '',
  extraInfo: '',
}

// ========== 类型定义 ==========
interface Role {
  id: string
  name: string
  color: string
  avatar: string
  relation?: string
  extraInfo?: string
}

interface Message {
  id: string
  roleId: string
  content: string
  bgNote?: string  // 消息级背景补充
  timestamp?: string
}

interface DemandResult {
  roleId: string
  surfaceNeeds: { id: number; name: string; value: number; evidence: string }[]
  innerNeeds: { id: number; name: string; value: number; evidence: string; hiddenReason: string }[]
  emotion: string
  overallJudgment: string
  suggestion: string
  conflictPoints: { needA: string; needB: string; desc: string }[]
  radarOption: any
  barOption: any
}

interface GlobalScanResult {
  sceneOverview: string
  coreRoles: string[]
  conflictTheme: string
  roles: {
    roleId: string
    emotion: string
    roleInScene: string
    briefJudgment: string
    topNeedHint: string
  }[]
}

interface AnalysisReport {
  id: string
  title: string
  scene: string
  roles: Role[]
  messages: Message[]
  conversationBg: string
  results: DemandResult[]
  overallConflict: { title: string; desc: string; suggestion: string }
  createdAt: string
}

// ========== 工具函数 ==========
function generateId() {
  return Math.random().toString(36).slice(2, 10)
}

function parseChatText(text: string): Message[] {
  const lines = text.split('\n').filter(l => l.trim())
  return lines.map(line => {
    // 尝试识别多种角色标注格式
    const bracketMatch = line.match(/^\[([^\]]+)\]\s*(.+)/)
    const parenMatch = line.match(/^\(([^)]+)\)\s*(.+)/)
    // 支持中文冒号/空格冒号："前女友：内容" 或 "前女友： 内容"
    const colonMatch = line.match(/^([\u4e00-\u9fa5a-zA-Z]+(?:\s*[-·][^\s：:]+)*)[:：]\s*(.+)/)
    if (bracketMatch) {
      return { id: generateId(), roleId: bracketMatch[1].trim(), content: bracketMatch[2].trim() }
    }
    if (parenMatch) {
      return { id: generateId(), roleId: parenMatch[1].trim(), content: parenMatch[2].trim() }
    }
    if (colonMatch) {
      return { id: generateId(), roleId: colonMatch[1].trim(), content: colonMatch[2].trim() }
    }
    // 如果没有识别到角色名，标记为"未标注"，用户手动选择
    return { id: generateId(), roleId: UNLABELED_ROLE_ID, content: line.trim() }
  }).filter(m => m.content.trim())
}

function getDefaultRoles(): Role[] {
  return [
    { id: '我', name: '我', color: '#10B981', avatar: '🟢', relation: '', extraInfo: '' },
  ]
}

function buildRadarOption(role: Role, needs: { id: number; name: string; value: number }[], isSurface: boolean): any {
  const indicator = NEED_NAMES.map((name, i) => ({
    name,
    max: 1,
  }))
  const values = NEED_NAMES.map((_, i) => {
    const found = needs.find(n => n.id === i)
    return found ? found.value : 0
  })
  const label = isSurface ? '表层需求' : '内在需求'
  const color = isSurface ? '#94A3B8' : NEED_COLORS_HEX[0]
  return {
    tooltip: { trigger: 'item' },
    legend: { data: [label], bottom: 0, textStyle: { fontSize: 12 } },
    radar: {
      indicator,
      radius: '65%',
      splitNumber: 4,
      axisName: { color: '#64748B', fontSize: 11 },
      splitLine: { lineStyle: { color: '#E2E8F0' } },
      splitArea: { areaStyle: { color: ['#F8FAFC', '#F1F5F9', '#E2E8F0', '#CBD5E1'] } },
      axisLine: { lineStyle: { color: '#CBD5E1' } },
    },
    series: [{
      type: 'radar',
      data: [{ value: values, name: label, lineStyle: { color, width: 2 }, areaStyle: { color: color + '33' }, itemStyle: { color } }],
    }],
  }
}

function buildBarOption(role: Role, needs: { id: number; name: string; value: number }[]): any {
  const sorted = [...needs].sort((a, b) => b.value - a.value).slice(0, 8)
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '3%', containLabel: true },
    xAxis: { type: 'value', max: 1, axisLabel: { fontSize: 10, color: '#64748B' }, splitLine: { lineStyle: { color: '#F1F5F9' } } },
    yAxis: { type: 'category', data: sorted.map(n => n.name).reverse(), axisLabel: { fontSize: 11, color: '#475569' } },
    series: [{
      type: 'bar',
      data: sorted.map(n => ({
        value: n.value,
        itemStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [
              { offset: 0, color: role.color + '88' },
              { offset: 1, color: role.color },
            ]
          },
          borderRadius: [0, 4, 4, 0]
        }
      })).reverse(),
      barWidth: '60%',
      label: { show: true, position: 'right', fontSize: 10, color: '#64748B', formatter: (p: any) => p.value.toFixed(2) },
    }],
  }
}

// ========== 全局心理分析报告（自由文本，不依赖 JSON 解析）==========
async function runMotivationReport(
  roles: Role[],
  messages: Message[],
  conversationBg: string,
  scene: string
): Promise<string | null> {
  const cfg = loadModelConfig()
  const hasLLM = cfg.provider !== 'offline' && !!cfg.apiKey
  if (!hasLLM) return null

  const msgsByRole = new Map<string, Message[]>()
  for (const msg of messages) {
    const list = msgsByRole.get(msg.roleId) || []
    list.push(msg)
    msgsByRole.set(msg.roleId, list)
  }

  // 构建完整对话文本
  const fullDialogue = messages.map(m => {
    const role = roles.find(r => r.id === m.roleId)
    return `${role?.name || m.roleId}：${m.content}`
  }).join('\n')

  const roleInfo = roles.map(r => {
    const msgs = msgsByRole.get(r.id) || []
    return `【${r.name}】${r.relation ? `关系：${r.relation}` : ''}，共发言${msgs.length}条`
  }).join('\n')

  const bgSection = conversationBg ? `\n背景补充：${conversationBg}` : ''

  const sceneMap: Record<string, string> = {
    emotion: '这是一段情感关系场景的对话。请从亲密关系心理学和依恋理论角度分析。',
    work: '职场场景，请从组织心理学角度分析。',
    family: '家庭关系场景，请从家庭系统理论分析。',
    sales: '销售谈判场景，请从利益心理学分析。',
    social: '社交场合，请从社会心理学分析。',
  }

  const systemPrompt = `你是一位资深对话心理分析师。你将收到一段多角色对话，请输出一份**需求动因分析报告**。

${sceneMap[scene] || sceneMap.emotion}

## ⚠️ 用户背景（必须作为判断的第一前提）
${conversationBg ? conversationBg : '（无额外背景）'}

请务必基于以上背景来理解这段对话。比如：如果用户说"是我找兄弟聊天，前女友抢了兄弟手机"，那就不能把"我"判定为主动骚扰前女友。背景交代的关系历史和人物性格，是你判断"表面vs实际"的关键依据。

## 报告结构（请严格按此顺序输出）

### 一、场景动态总览
基于用户背景+对话文字，还原真实场景。用2-3句话概括：谁主动联系的谁？对话是怎么触发的？表面上在吵什么？实际上在争什么？

### 二、逐角色心理画像
为每一个发言角色，分别输出：

**{角色名}**
- 情绪状态：（TA的主导情绪是什么？有没有复合情绪？）
- 表面诉求：TA嘴上在说什么？（引用1-2句原话）
- 深层需求：TA真正想要的是什么？TA为什么不说出来？
- 心理动因：从TA的性格、关系位置、过往互动来推断TA为什么会有这样的反应
- 需求冲突：TA内心有哪些需求在打架？（如：想靠近又想推开）

### 三、关系动力分析
- 谁和谁之间存在需求错位？
- 这段对话的核心冲突是什么？
- 如果继续这样对话，关系会走向何方？

### 四、行动建议
给出2-3条具体可操作的沟通建议。要像朋友在分析，不要像学术论文。

## 输出要求
- 用自然中文段落，不要用 JSON 格式
- 每个角色都要覆盖到
- 引用原话作为证据时用「」包起来
- 总长度 600-1000 字`

  const userPrompt = `## 对话角色\n${roleInfo}\n\n## 完整对话\n${fullDialogue}${bgSection}\n\n请输出需求动因分析报告。`

  try {
    console.log('[Insight] Calling LLM for motivation report...')
    const response = await chatWithModel(userPrompt, [], cfg, 3000, systemPrompt)
    console.log('[Insight] Motivation report length:', response.length)

    if (response.startsWith('（大模型调用失败') || response.startsWith('（当前未配置')) {
      console.error('[Insight] Motivation report LLM error:', response)
      return null
    }
    return response
  } catch (err: any) {
    console.error('[Insight] runMotivationReport exception:', err)
    return null
  }
}

// ========== 全局快速扫描（无 JSON 依赖，直接自由文本）==========
async function runGlobalScan(
  roles: Role[],
  messages: Message[],
  conversationBg: string,
  scene: string
): Promise<{ scan: GlobalScanResult; error?: string } | null> {
  const cfg = loadModelConfig()
  const hasLLM = cfg.provider !== 'offline' && !!cfg.apiKey
  if (!hasLLM) {
    console.log('[Insight] LLM not configured')
    return null
  }

  const roleIdList = roles.map(r => `"${r.id}"`).join(', ')
  const roleSummaries = roles.map(r => {
    const roleMsgs = messages.filter(m => m.roleId === r.id)
    const text = roleMsgs.map(m => m.content.slice(0, 80)).join('\n')
    return `【${r.name}｜roleId="${r.id}"${r.relation ? `｜关系=${r.relation}` : ''}】共${roleMsgs.length}条\n${text.slice(0, 300) || '（无消息）'}`
  }).join('\n\n')

  const bgSection = conversationBg ? `\n\n【用户提供的背景（关键！必须以此为判断前提）】\n${conversationBg}` : ''

  const sceneMap: Record<string, string> = {
    emotion: '情感关系场景', work: '职场场景', family: '家庭关系场景',
    sales: '销售谈判场景', social: '社交场合',
  }

  // 关键改变：不要求 JSON，改为结构化文本，然后从文本中提取信息
  const systemPrompt = `你是一位对话分析师。快速扫描多角色对话，用结构化文本输出判断。

${sceneMap[scene] || '情感关系'}

## ⚠️ 用户背景说明（必须作为判断的第一前提）
${conversationBg ? conversationBg : '（无额外背景，仅根据对话文字判断）'}

## 输出格式（纯文本，每行一条，不要 JSON）：
SCENE: {2-3句话场景概括}
CONFLICT: {核心冲突一句话}
CORE: {核心角色ID，逗号分隔}
${roles.map(r => `ROLE: id=${r.id} | emotion={情绪} | position={主导者/被攻击者/辅助者/旁观者} | judge={一句话心理判断} | need={最可能的需求}`).join('\n')}

## 规则
- 必须为上面列出的每个 id 都输出一行 ROLE
- 无消息的角色填 emotion=无消息 position=缺席 judge=（无消息） need=无
- emotion 从：愤怒/讽刺/冷淡/试探/委屈/期待/平静/中性/无消息 中选`

  const userPrompt = `## 角色ID列表：${roleIdList}\n\n## 角色和消息\n${roleSummaries}${bgSection}\n\n请按格式输出（必须为每个角色id输出一行ROLE）。注意：用户背景说明必须作为判断角色定位的第一依据。`

  try {
    console.log('[Insight] Calling LLM for global scan (text mode)...')
    const response = await chatWithModel(userPrompt, [], cfg, 2000, systemPrompt)
    console.log('[Insight] Scan response:', response.slice(0, 300))

    if (response.startsWith('（大模型调用失败') || response.startsWith('（当前未配置')) {
      console.error('[Insight] LLM error:', response)
      return { scan: _fallbackGlobalScan(roles, messages, true), error: response }
    }

    // 从文本中解析结构化数据
    const scan: GlobalScanResult = {
      sceneOverview: '',
      coreRoles: [],
      conflictTheme: '',
      roles: [],
    }

    const lines = response.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('SCENE:')) {
        scan.sceneOverview = trimmed.slice(6).trim()
      } else if (trimmed.startsWith('CONFLICT:')) {
        scan.conflictTheme = trimmed.slice(9).trim()
      } else if (trimmed.startsWith('CORE:')) {
        scan.coreRoles = trimmed.slice(5).trim().split(/[,，]/).map(s => s.trim()).filter(Boolean)
      } else if (trimmed.startsWith('ROLE:')) {
        // 格式：ROLE: id=xxx | emotion=xxx | position=xxx | judge=xxx | need=xxx
        const content = trimmed.slice(5).trim()
        const parts: Record<string, string> = {}
        const segs = content.split('|')
        for (const seg of segs) {
          const eqIdx = seg.indexOf('=')
          if (eqIdx > 0) {
            parts[seg.slice(0, eqIdx).trim()] = seg.slice(eqIdx + 1).trim()
          }
        }
        if (parts.id) {
          scan.roles.push({
            roleId: parts.id,
            emotion: parts.emotion || '中性',
            roleInScene: parts.position || '辅助者',
            briefJudgment: parts.judge || '',
            topNeedHint: parts.need || '',
          })
        }
      }
    }

    console.log('[Insight] Parsed:', scan.roles.length, 'roles, scene:', scan.sceneOverview.slice(0, 50))

    if (scan.roles.length === 0) {
      console.warn('[Insight] No roles parsed from text response, using fallback')
      return null
    }

    // 补全缺失的角色
    for (const role of roles) {
      const found = scan.roles.find(r => r.roleId === role.id || r.roleId === role.name)
      if (!found) {
        const roleMsgs = messages.filter(m => m.roleId === role.id)
        scan.roles.push({
          roleId: role.id,
          emotion: roleMsgs.length > 0 ? '中性' : '无消息',
          roleInScene: roleMsgs.length > 0 ? '辅助者' : '缺席',
          briefJudgment: roleMsgs.length > 0 ? `${role.name}共发言${roleMsgs.length}条` : '（无消息）',
          topNeedHint: roleMsgs.length > 0 ? '待深度解析' : '无',
        })
      }
    }

    return { scan }
  } catch (err: any) {
    console.error('[Insight] runGlobalScan exception:', err)
    return null
  }
}

// ========== 阶段二：单角色深度心理分析（自由文本，不依赖 JSON）==========
async function runDeepAnalysis(
  role: Role,
  allMessages: Message[],
  allRoles: Role[],
  conversationBg: string,
  scene: string,
  globalScan: GlobalScanResult | null
): Promise<string | null> {
  const cfg = loadModelConfig()
  const hasLLM = cfg.provider !== 'offline' && !!cfg.apiKey
  if (!hasLLM) return null

  const roleMsgs = allMessages.filter(m => m.roleId === role.id)
  if (roleMsgs.length === 0) return null

  const roleText = roleMsgs.map((m, i) => `${i + 1}. ${m.content}`).join('\n')

  const otherRolesContext = allRoles
    .filter(r => r.id !== role.id)
    .map(r => {
      const msgs = allMessages.filter(m => m.roleId === r.id)
      if (msgs.length === 0) return ''
      const sample = msgs.slice(0, 3).map(m => m.content.slice(0, 60)).join('；')
      return `${r.name}(${r.relation || '未知关系'})，共${msgs.length}条：${sample}`
    })
    .filter(Boolean)
    .join('\n')

  const globalContext = globalScan
    ? `全局场景：${globalScan.sceneOverview}\n核心冲突：${globalScan.conflictTheme}\n${role.name}的角色定位：${globalScan.roles.find(r => r.roleId === role.id)?.roleInScene || '未知'}`
    : ''

  const bgSection = conversationBg ? `\n对话背景补充：${conversationBg}` : ''

  const sceneMap: Record<string, string> = {
    emotion: '情感关系场景——请从亲密关系心理学和依恋理论角度深度分析。',
    work: '职场场景——请从组织心理学和职场权力动态角度分析。',
    family: '家庭关系场景——请从家庭系统理论角度分析。',
    sales: '销售谈判场景——请从利益分析和谈判心理学角度切入。',
    social: '社交场合——请从社会心理学和群体动力学分析。',
  }

  const systemPrompt = `你是一位资深对话心理分析师。请对**单个角色「${role.name}」**进行深度心理分析。

${sceneMap[scene] || sceneMap.emotion}

## ⚠️ 用户提供的背景（必须作为判断的第一前提）
${conversationBg ? conversationBg : '（无额外背景）'}

请务必基于以上背景来理解这个人。背景里交代的性格特点、关系历史、对话触发原因，是你判断"表面vs实际"的关键。不要仅凭对话文字的表面意思下结论。

## 请按以下结构输出（自由文本，不要 JSON）：

### 情绪状态
TA的主导情绪是什么？有没有复合情绪（如愤怒底下藏着委屈）？

### 表面在说什么
TA嘴上在表达什么诉求？引用1-2句原话（用「」包起来）

### 深层真正想要什么
TA真正想得到的回应/确认/态度是什么？为什么TA不直接说出来？（从TA的性格、关系位置、面子心理等角度解释）

### 需求冲突
TA内心有哪些需求在打架？（参考12维需求：生理生存/安全稳定/社交归属/情感陪伴/尊重认可/认知求知/审美价值/自我实现/自由掌控/公平公正/成长进阶/秩序规整）

### 情绪变化轨迹
从对话开始到结束，TA的情绪如何演变？

### 心理防御机制
TA用了哪些防御方式（如投射/否认/反向形成/理智化/被动攻击/幽默化解等）？

### 角色与关系定位
TA在这场对话中扮演什么角色？与其他人的关系动力是怎样的？

### 沟通建议
如果你要与这个人沟通，给出2-3条具体可操作的建议。

## 输出要求
- 自然段落，不要 JSON
- 引用原话用「」
- 像心理咨询师写个案分析，有深度有人味
- 总长度 400-700 字`

  const userPrompt = `## 分析对象：${role.name}${role.relation ? `（${role.relation}）` : ''}

## TA的完整发言
${roleText}

## 对话中其他人
${otherRolesContext}

## 全局上下文
${globalContext}
${bgSection}

请对「${role.name}」进行深度心理分析。`

  try {
    console.log('[Insight] Calling LLM for deep analysis of:', role.name)
    const response = await chatWithModel(userPrompt, [], cfg, 2000, systemPrompt)
    console.log('[Insight] Deep analysis response length:', response.length)

    if (response.startsWith('（大模型调用失败') || response.startsWith('（当前未配置')) {
      console.error('[Insight] Deep analysis LLM error:', response)
      return null
    }
    return response
  } catch (err: any) {
    console.error('[Insight] runDeepAnalysis exception:', err)
    return null
  }
}

// ========== 关键词回退全局扫描（无LLM或LLM失败时使用）==========
function _fallbackGlobalScan(roles: Role[], messages: Message[], llmConfigured: boolean): GlobalScanResult {
  const msgsByRole = new Map<string, Message[]>()
  for (const msg of messages) {
    const list = msgsByRole.get(msg.roleId) || []
    list.push(msg)
    msgsByRole.set(msg.roleId, list)
  }
  const maxCount = Math.max(...roles.map(r => (msgsByRole.get(r.id) || []).length), 1)
  const roleScan = roles.map(r => {
    const msgs = msgsByRole.get(r.id) || []
    const text = msgs.map(m => m.content).join(' ')
    let emotion = '中性'
    if (text.includes('滚') || text.includes('傻逼')) emotion = '愤怒'
    else if (text.includes('烦') || text.includes('累')) emotion = '烦躁'
    else if ((text.includes('？') || text.includes('?')) && text.length < 100) emotion = '试探'
    return {
      roleId: r.id,
      emotion,
      roleInScene: msgs.length >= maxCount ? '主导者' : '辅助者',
      briefJudgment: msgs.length > 0 ? `${r.name}共发言${msgs.length}条，情绪偏${emotion}` : '无消息',
      topNeedHint: llmConfigured ? 'LLM调用失败，点击「深度解析」重试' : '需连接LLM分析',
    }
  })
  return {
    sceneOverview: llmConfigured
      ? `⚠️ LLM调用失败，已使用关键词回退分析（共${roles.length}个角色、${messages.length}条消息）。请查看顶部红色提示框了解原因，或点击「保留内容·重新分析」重试。`
      : `共${roles.length}个角色、${messages.length}条消息。请在 /models 页面配置 LLM API Key 以获得精准心理分析。`,
    coreRoles: roleScan.filter(r => r.roleInScene === '主导者').map(r => r.roleId),
    conflictTheme: llmConfigured ? 'LLM调用异常，已回退' : '需连接LLM分析',
    roles: roleScan,
  }
}

// ========== 关键词回退深度分析（无LLM或LLM失败时使用）==========
function _fallbackDeepAnalysis(role: Role, messages: Message[], llmConfigured: boolean): string {
  const roleMsgs = messages.filter(m => m.roleId === role.id)
  const allText = roleMsgs.map(m => m.content).join('\n')

  const keywordMap: Record<number, string> = {
    2: '朋友 兄弟 闺蜜 一起 我们', 3: '想你 爱 在乎 陪伴 关心 舍不得 回来',
    4: '尊重 认可 面子 尊严 看不起', 8: '自由 随便 滚 别管 别烦 别理',
    9: '公平 凭什么 付出 回报 凭什么我',
  }
  const innerNeeds: any[] = []
  for (const [idStr, kwStr] of Object.entries(keywordMap)) {
    const id = parseInt(idStr)
    const hits = kwStr.split(' ').filter(k => allText.includes(k))
    if (hits.length > 0) {
      innerNeeds.push({
        id, name: NEED_NAMES[id],
        value: Math.min(0.85, 0.15 + hits.length * 0.1),
        evidence: hits.join('、'),
        hiddenReason: llmConfigured ? 'LLM调用失败，关键词回退' : '关键词预估（连接LLM获取精确心理分析）',
      })
    }
  }
  innerNeeds.sort((a: any, b: any) => b.value - a.value)

  let report = `## 关键词回退分析\n\n`
  if (innerNeeds.length > 0) {
    report += `**核心需求**：${role.name}的需求指向 ${innerNeeds.slice(0, 3).map((n: any) => n.name).join('、')}。\n\n`
    report += `**关键词证据**：${innerNeeds.slice(0, 5).map((n: any) => `${n.name}(${n.evidence})`).join('；')}\n\n`
  } else {
    report += `未检测到明确需求信号。\n\n`
  }
  report += llmConfigured
    ? `**注意**：LLM调用失败，以上为关键词回退结果。请点击「保留内容·重新分析」重试，或打开F12控制台查看错误日志。`
    : `**注意**：未配置LLM。在 /models 页面配置API Key后可获得包含情绪轨迹、防御机制、心理画像的完整深度分析。`

  return report
}
// ========== 主组件 ==========
export function InsightPage() {
  const [scene, setScene] = useState('emotion')
  const [roles, setRoles] = useState<Role[]>(getDefaultRoles())
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [conversationBg, setConversationBg] = useState('')
  const [conversationBgEditing, setConversationBgEditing] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [results, setResults] = useState<DemandResult[]>([])
  const [globalScan, setGlobalScan] = useState<GlobalScanResult | null>(null)
  const [deepReports, setDeepReports] = useState<Map<string, string>>(new Map())
  const [deepAnalyzingRoleId, setDeepAnalyzingRoleId] = useState<string | null>(null)
  const [llmError, setLlmError] = useState<string | null>(null)
  const [motivationReport, setMotivationReport] = useState<string | null>(null)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [overallConflict, setOverallConflict] = useState<{ title: string; desc: string; suggestion: string } | null>(null)
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [showReport, setShowReport] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [isProcessingChat, setIsProcessingChat] = useState(false)
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([])
  const [selectingRoleForMsgId, setSelectingRoleForMsgId] = useState<string | null>(null)
  const [mergingFromRole, setMergingFromRole] = useState<string | null>(null)
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [editingContentMsgId, setEditingContentMsgId] = useState<string | null>(null)
  const [editingContentInput, setEditingContentInput] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 截图上传 → 提取对话
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const extracted = await extractDialogueFromImage(base64.split(',')[1])
      if (extracted && !extracted.startsWith('抱歉')) {
        setInputText(prev => (prev ? prev + '\n' : '') + extracted)
      } else {
        alert('截图识别失败，请手动粘贴对话内容')
      }
    } catch {
      alert('截图识别失败，请检查 API Key 配置或手动粘贴对话')
    } finally {
      setUploadingImage(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // 添加新角色
  const addRole = () => {
    const colors = ['#F472B6', '#60A5FA', '#FB923C', '#34D399', '#A78BFA', '#FBBF24', '#F87171', '#38BDF8']
    const avatars = ['💕', '💼', '👤', '👥', '🤝', '🏠', '🌟', '💬']
    const newRole: Role = {
      id: generateId(),
      name: `角色${roles.length + 1}`,
      color: colors[roles.length % colors.length],
      avatar: avatars[roles.length % avatars.length],
      relation: '',
      extraInfo: '',
    }
    setRoles([...roles, newRole])
    setSelectedRoleId(newRole.id)
  }

  // 删除角色
  const removeRole = (id: string) => {
    if (roles.length <= 1) return
    setRoles(roles.filter(r => r.id !== id))
    setMessages(messages.map(m => m.roleId === id ? { ...m, roleId: roles[0].id } : m))
    if (selectedRoleId === id) setSelectedRoleId(roles[0].id)
  }

  // 给单条消息设置角色
  const setMsgRole = (msgId: string, newRoleId: string) => {
    setMessages(messages.map(m => m.id === msgId ? { ...m, roleId: newRoleId } : m))
    setSelectingRoleForMsgId(null)
  }

  // 合并角色：把 fromRoleId 的所有消息移到 toRoleId，删除 fromRoleId
  const mergeRoles = (fromRoleId: string, toRoleId: string) => {
    setMessages(messages.map(m => m.roleId === fromRoleId ? { ...m, roleId: toRoleId } : m))
    setRoles(roles.filter(r => r.id !== fromRoleId))
    if (selectedRoleId === fromRoleId) setSelectedRoleId(toRoleId)
    setMergingFromRole(null)
  }

  // 重命名角色
  const renameRole = (roleId: string, newName: string) => {
    setRoles(roles.map(r => r.id === roleId ? { ...r, name: newName.trim() } : r))
    setEditingRoleId(null)
  }

  // 计算未标注消息数（用于提醒）
  const unlabeledCount = useMemo(() =>
    messages.filter(m => m.roleId === UNLABELED_ROLE_ID).length
  , [messages])

  // 解析粘贴的对话
  const handleParse = () => {
    if (!inputText.trim()) return
    const parsed = parseChatText(inputText)
    
    // 检测新角色并自动添加
    const roleNames = new Set(parsed.map(m => m.roleId))
    const currentRoleIds = new Set(roles.map(r => r.id))
    const newRoles: Role[] = []
    const colors = ['#F472B6', '#60A5FA', '#FB923C', '#34D399', '#A78BFA', '#FBBF24', '#F87171', '#38BDF8']
    const avatars = ['💕', '💼', '👤', '👥', '🤝', '🏠', '🌟', '💬']
    let colorIdx = roles.length
    for (const name of roleNames) {
      if (!currentRoleIds.has(name)) {
        newRoles.push({
          id: name,
          name,
          color: colors[colorIdx % colors.length],
          avatar: avatars[colorIdx % avatars.length],
          relation: '',
          extraInfo: '',
        })
        colorIdx++
      }
    }
    
    setRoles([...roles, ...newRoles])
    setMessages(parsed)
    setInputText('')
  }

  // 给消息加背景注释
  const addMessageBg = (msgId: string, bg: string) => {
    setMessages(messages.map(m => m.id === msgId ? { ...m, bgNote: bg } : m))
  }

  // 编辑消息内容
  const setMsgContent = (msgId: string, newContent: string) => {
    setMessages(messages.map(m => m.id === msgId ? { ...m, content: newContent } : m))
  }

  // 开始编辑消息内容
  const startEditContent = (msg: Message) => {
    setEditingContentMsgId(msg.id)
    setEditingContentInput(msg.content)
  }

  // 保存消息内容
  const saveEditContent = (msgId: string) => {
    if (editingContentInput.trim()) {
      setMsgContent(msgId, editingContentInput.trim())
    }
    setEditingContentMsgId(null)
    setEditingContentInput('')
  }

  // ===== 阶段一：全局扫描 =====
  const handleAnalyze = async () => {
    if (messages.length === 0) return
    if (unlabeledCount > 0) {
      const ans = window.confirm(`有 ${unlabeledCount} 条消息还没有标注说话人角色，\n这些消息会被忽略。\n\n点击"确定"继续分析，\n点击"取消"先去标注这些消息。`)
      if (!ans) return
    }
    setIsAnalyzing(true)
    setDeepReports(new Map())
    setLlmError(null)
    try {
      const labeledMsgs = messages.filter(m => m.roleId !== UNLABELED_ROLE_ID)
      const scanResult = await runGlobalScan(roles, labeledMsgs, conversationBg, scene)

      if (scanResult) {
        const { scan, error } = scanResult
        setGlobalScan(scan)
        if (error) setLlmError(error)

        setOverallConflict({
          title: error ? '⚠️ 使用了回退分析' : (scan.conflictTheme || '对话动态分析'),
          desc: scan.sceneOverview,
          suggestion: error
            ? `LLM调用失败：${error.slice(0, 100)}。已使用关键词回退。\n核心人物：${scan.coreRoles.map((rid: string) => { const r = roles.find(x => x.id === rid); return r?.name || rid }).join('、')}`
            : `核心人物：${scan.coreRoles.map((rid: string) => { const r = roles.find(x => x.id === rid); return r?.name || rid }).join('、')}`,
        })

        // Build light results for ALL roles (fallback scan already covers all)
        const lightResults: DemandResult[] = roles.map(role => {
          // Try exact match first, then name match
          let sr = scan.roles.find(r => r.roleId === role.id)
          if (!sr) sr = scan.roles.find(r => r.roleId === role.name)
          return {
            roleId: role.id,
            surfaceNeeds: [],
            innerNeeds: [],
            emotion: sr?.emotion || '中性',
            overallJudgment: sr?.briefJudgment || '',
            suggestion: '',
            conflictPoints: [],
            radarOption: buildRadarOption(role, [], false),
            barOption: buildBarOption(role, []),
          }
        })
        setResults(lightResults)

        // ===== 自动生成需求动因分析报告 =====
        if (!error) {
          setIsGeneratingReport(true)
          runMotivationReport(roles, labeledMsgs, conversationBg, scene).then(report => {
            if (report) {
              setMotivationReport(report)
              console.log('[Insight] Motivation report generated:', report.length, 'chars')
            } else {
              console.warn('[Insight] Motivation report generation failed')
            }
            setIsGeneratingReport(false)
          })
        }
      } else {
        // Complete fallback — no LLM at all
        const llmCfg = loadModelConfig()
        const isLLMConfigured = llmCfg.provider !== 'offline' && !!llmCfg.apiKey
        const fallbackScan = _fallbackGlobalScan(roles, labeledMsgs, isLLMConfigured)
        setGlobalScan(fallbackScan)
        const fbResults: DemandResult[] = roles.map(role => {
          const sr = fallbackScan.roles.find(r => r.roleId === role.id)
          return {
            roleId: role.id,
            surfaceNeeds: [],
            innerNeeds: [],
            emotion: sr?.emotion || '中性',
            overallJudgment: sr?.briefJudgment || '',
            suggestion: '',
            conflictPoints: [],
            radarOption: buildRadarOption(role, [], false),
            barOption: buildBarOption(role, []),
          }
        })
        setResults(fbResults)
        setOverallConflict({
          title: isLLMConfigured ? '⚠️ LLM 调用失败，已使用回退分析' : '需要配置 LLM',
          desc: fallbackScan.sceneOverview,
          suggestion: isLLMConfigured
            ? `检测到 ${llmCfg.provider} 配置但调用失败。\n可能原因：① 网络不通（baseUrl: ${llmCfg.baseUrl}）② API Key 无效 ③ 模型名不正确（${llmCfg.modelName}）\n\n请打开浏览器控制台（F12）查看 [Insight] 开头的详细错误日志。`
            : '在 /models 页面配置 API Key 以启用完整的全局扫描 + 角色深度心理分析。',
        })
      }
      setShowReport(true)
    } finally {
      setIsAnalyzing(false)
    }
  }

  // ===== 阶段二：单角色深度分析 =====
  const handleDeepAnalyze = async (roleId: string) => {
    const role = roles.find(r => r.id === roleId)
    if (!role) return
    const labeledMsgs = messages.filter(m => m.roleId !== UNLABELED_ROLE_ID)
    setDeepAnalyzingRoleId(roleId)
    try {
      const report = await runDeepAnalysis(role, labeledMsgs, roles, conversationBg, scene, globalScan)
      if (report) {
        setDeepReports(prev => {
          const next = new Map(prev)
          next.set(roleId, report)
          return next
        })
      } else {
        const deepLLMCfg = loadModelConfig()
        const isDeepLLMOK = deepLLMCfg.provider !== 'offline' && !!deepLLMCfg.apiKey
        const fb = _fallbackDeepAnalysis(role, labeledMsgs, isDeepLLMOK)
        setDeepReports(prev => {
          const next = new Map(prev)
          next.set(roleId, fb)
          return next
        })
      }
    } finally {
      setDeepAnalyzingRoleId(null)
    }
  }

  // ===== 导出报告 =====
  const handleExportReport = () => {
    if (!globalScan) return
    const lines: string[] = []
    lines.push('═══════════════════════════════════')
    lines.push('  DPU 需求洞察 · 心理分析报告')
    lines.push('═══════════════════════════════════')
    lines.push('')
    lines.push(`场景：${SCENES.find(s => s.key === scene)?.label || scene}`)
    lines.push(`生成时间：${new Date().toLocaleString()}`)
    lines.push('')
    lines.push('── 全局扫描 ──')
    lines.push(globalScan.sceneOverview)
    lines.push(`核心冲突：${globalScan.conflictTheme}`)
    lines.push(`核心人物：${globalScan.coreRoles.map((rid: string) => roles.find(r => r.id === rid)?.name || rid).join('、')}`)
    lines.push('')
    lines.push('── 角色分析 ──')
    for (const role of roles) {
      const scanRole = globalScan.roles.find(r => r.roleId === role.id)
      const deep = deepReports.get(role.id)
      lines.push('')
      lines.push(`【${role.name}】${role.relation ? `（${role.relation}）` : ''}`)
      lines.push(`  角色定位：${scanRole?.roleInScene || '未知'}`)
      lines.push(`  情绪状态：${scanRole?.emotion || '未知'}`)
      lines.push(`  快速判断：${scanRole?.briefJudgment || ''}`)
      if (deep) {
        lines.push('  ── 深度分析 ──')
        lines.push(deep.replace(/\n/g, '\n  '))
      } else {
        lines.push('  （未进行深度解析，点击角色后可触发AI深度分析）')
      }
    }
    lines.push('')
    lines.push('── 报告由 DPU 需求势能引擎 + LLM 联合生成 ──')

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `DPU_需求洞察_${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }


  // AI 追问 —— 接入项目真实大模型（chatWithModel），分析结果作为上下文注入
  // questionOverride: 可从按钮直接传入问题；variant: "更简短" / "换个角度" 等方向指令
  const handleChatAsk = async (questionOverride?: string, variant?: string) => {
    const rawQuestion = questionOverride || chatInput
    if (!rawQuestion || !rawQuestion.trim()) return
    const question = rawQuestion.trim()
    setChatInput('')
    setChatHistory(h => [...h, { role: 'user', content: question }])
    setIsProcessingChat(true)

    // ========== 构建上下文（精简版）：把需求洞察结果注入大模型，但省出大部分 token 留给回答 ==========
    const ctx: string[] = []

    // 1) 角色 + 关系（极简）
    ctx.push(`参与角色：${roles.map(r => r.name + (r.relation ? `(${r.relation})` : '')).join(' / ')}`)

    // 2) 对话背景（直接用 user 写的备注，精简到 300 字）
    if (conversationBg) ctx.push(`对话背景：${conversationBg.slice(0, 300)}`)

    // 3) 关键代表性消息：只取最近 10 条，每条 ≤100 字（避免原文塞爆上下文）
    if (messages.length > 0) {
      ctx.push(`\n关键对话（共 ${messages.length} 条，仅展示最近 10 条）：`)
      messages.slice(-10).forEach((m, i) => {
        const role = roles.find(r => r.id === m.roleId)
        ctx.push(`${i + 1}. ${role?.name || '未标注'}：${m.content.slice(0, 100)}`)
      })
    }

    // 4) 洞察摘要（每个角色一句话，核心信息浓缩）
    if (results.length > 0) {
      ctx.push(`\n核心洞察：`)
      results.forEach((r, idx) => {
        const role = roles.find(x => x.id === r.roleId)
        const topInner = r.innerNeeds.slice(0, 1).map(n => n.name).join('')
        const topSurface = r.surfaceNeeds.slice(0, 2).map(n => n.name).join('/')
        // 只留"角色名 + 情绪 + 核心需求 + 一句判断"，每角色 ≤120 字
        const judgment = (r.overallJudgment || '').slice(0, 80)
        ctx.push(`- ${role?.name || r.roleId}：情绪「${r.emotion}」，表「${topSurface}」/真「${topInner}」。判断：${judgment}`)
      })
    }

    // 5) 整体冲突（若存在，一句）
    if (overallConflict) {
      ctx.push(`\n关系冲突：${overallConflict.desc.slice(0, 120)}`)
    }

    const contextText = ctx.join('\n')

    // ========== 检查大模型配置 ==========
    const cfg = loadModelConfig()
    let answer = ''

    try {
      if (cfg.provider === 'offline' || !cfg.apiKey) {
        // ===== 未配置大模型：走"分析结果智能拼接"的兜底回答 =====
        const relevantResults = results.length > 0 ? results.slice(0, 3) : []

        if (relevantResults.length === 0) {
          answer = '请先粘贴对话并完成分析后再来提问，或在"模型配置"页面填入你的 API Key 以获得真正的大模型回答。'
        } else {
          const main = relevantResults.sort((a, b) => (b.innerNeeds[0]?.value || 0) - (a.innerNeeds[0]?.value || 0))[0]
          const mainRole = roles.find(r => r.id === main.roleId)
          const parts: string[] = []

          parts.push(`（提示：当前未配置大模型，回答基于 DPU 算法直接拼接。如需更灵活的智能回答，请在"模型配置"页面填入 API Key。）\n`)
          parts.push(`【关于「${question}」的分析】`)
          parts.push(`从${mainRole?.name || '对方'}的对话来看，她此刻主要处于「${main.emotion}」情绪状态。`)

          if (main.innerNeeds.length > 0) {
            parts.push(`她最核心的内在需求是【${main.innerNeeds[0].name}】（强度 ${Math.round((main.innerNeeds[0].value || 0) * 100)}分）——这个需求她通常不会直接说出口，而是用情绪化的方式间接表达。`)
            if (main.innerNeeds[0].hiddenReason) parts.push(`隐藏原因：${main.innerNeeds[0].hiddenReason}`)
            if (main.innerNeeds[0].evidence) parts.push(`关键证据：她提到"${main.innerNeeds[0].evidence.slice(0, 50)}"等表述，都指向这个深层需求。`)
          }

          if (main.overallJudgment) parts.push(`\n【核心判断】${main.overallJudgment}`)

          if (question.includes('在乎') || question.includes('喜欢') || question.includes('爱')) {
            parts.push(`\n【关于是否在乎】情绪浓度本身就是一种"投入度"信号——她会花情绪能量来表达，说明这段关系对她仍有重要意义。真正不在乎的人通常不会产生强烈情绪。`)
          }

          if (main.suggestion) {
            parts.push(`\n【建议方向】${main.suggestion}`)
            parts.push(`操作层面：① 先识别她情绪化表达背后对应的内在需求；② 不要跟她的表层话语辩论，而是回应她的情绪信号；③ 用"我理解你的感受"替代反驳或解释。`)
          }

          if (main.conflictPoints.length > 0) {
            parts.push(`\n【潜在冲突点】${main.conflictPoints.slice(0, 2).map((cp, i) => `${i + 1}. ${cp.desc}`).join('\n')}`)
          }

          if (relevantResults.length > 1) {
            const other = relevantResults.find(r => r.roleId !== main.roleId)
            if (other) {
              const otherRole = roles.find(r => r.id === other.roleId)
              parts.push(`\n【${otherRole?.name || '另一方'}的视角】对比来看，${otherRole?.name}这边核心需求是【${other.innerNeeds[0]?.name || '-'}】，情绪是"${other.emotion}"。两边的需求其实是错位的——冲突的根源不是谁对谁错，而是双方在不同的需求频率上对话，都没收到对方真正想要的信号。`)
            }
          }

          answer = parts.join('\n')
        }
      } else {
        // ===== 已配置大模型：调用 chatWithModel 让大模型基于完整上下文回答 =====
        // 多轮对话历史只保留最近 3 条（避免和上下文重复挤占 token）
        const historyForModel: ChatTurn[] = chatHistory
          .slice(-3)
          .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))

        // 根据 variant 拼接不同的方向指令（用于"重新生成 / 更简短 / 换角度"等）
        let variantInstruction = ''
        if (variant === 'more_concise') {
          variantInstruction = `\n【方向指令】用户要求：请用比刚才更简短、更直接的方式回答。去掉冗长的铺垫和解释，200-350 字，直击核心。`
        } else if (variant === 'different_angle') {
          variantInstruction = `\n【方向指令】用户对刚才的回答不太满意，要求：换一个全新的分析角度。不要重复刚才的观点，从另一个维度展开分析（例如从关系模式、情感策略、对方的自我保护等角度切入），给出新的洞察。`
        } else if (variant === 'more_detail') {
          variantInstruction = `\n【方向指令】用户要求：请给出更详细、更深入的分析，每个要点都补充 1-2 句具体解释。回答长度 600-1000 字。`
        } else if (variant === 'regenerate') {
          variantInstruction = `\n【方向指令】用户对刚才的回答不满意，请**完全换一种说法**、给出不同的结构和判断，不要重复刚才那版回答。`
        }

        const sceneMap: Record<string, string> = {
          emotion: '这是一段情感关系场景的对话，涉及情侣、暧昧或亲密关系中的情感纠葛。请从亲密关系心理学的角度进行分析，重点关注依恋模式、情感需求和表达方式的不匹配。',
          work: '这是一段职场场景的对话。请从组织心理学和职场沟通的角度分析，关注权力动态、角色认知和职业发展需求。',
          family: '这是一段家庭关系场景的对话，涉及亲子、代际或家庭系统内的沟通。请从家庭系统理论角度分析，关注角色期待、边界和归属感。',
          sales: '这是一段销售/谈判场景的对话。请从谈判心理学和利益分析角度出发，识别各方的底层诉求和博弈策略。',
          social: '这是一段社交场合的对话。请从社会心理学角度分析，关注群体认同、社交信号和印象管理。',
        }
        const sceneContext = sceneMap[scene] || sceneMap.emotion

        const systemPrompt = `你是一位心理学取向的对话分析师，擅长从情感陪伴、需求洞察的角度回答用户问题。

【当前分析场景】${sceneContext}
${variantInstruction}

【输出格式（严格遵守）】
✓ 用自然段落回答，段落之间用空行分隔；可以用 1. 2. 3. 数字列表组织要点
✓ 可以用引号 "" 直接引用对话原句作为证据
✗ 严禁使用 | 竖线的 Markdown 表格
✗ 严禁输出 <br> 作为换行符（直接按回车键换行即可）
✗ 严禁使用 ###、--- 这类 Markdown 标题/分隔符
✗ 不要用【情绪状态】【她为什么这么说】这种生硬的中文标签作为段落标题

【强约束】回答必须完整输出，不要在列表中间、句子中间突然停止。不要出现只写了 "1." 就结束的回答。

【回答内容的原则】
1. 先共情 → 再洞察 → 最后给出温和的行动方向，像朋友在分析，不要像报告
2. 紧扣对话中的具体人物和语句；可以引用原话作为证据（用引号包起来）
3. 不要输出空洞的术语堆砌，要给"人话"
4. 对于"她到底还在不在乎我"、"她为什么这么说"这类问题要给出明确判断，不要模棱两可
5. 如果用户问"怎么办"，给出具体可操作的建议（2-3 条）
6. 回答长度 500-800 字，确保把话说完

【你可以引用的信息（下方提供）】

${contextText}`

        answer = await chatWithModel(question, historyForModel, cfg, 3000, systemPrompt)
      }
    } catch (err: any) {
      answer = `（调用大模型时出错：${err?.message || '未知错误'}。请检查 API Key 和网络连接，或在"模型配置"页面切换模型。）`
    }
    setChatHistory(h => [...h, { role: 'ai', content: answer }])
    setIsProcessingChat(false)
  }

  const selectedRole = useMemo(() => roles.find(r => r.id === selectedRoleId), [roles, selectedRoleId])
  const selectedResult = useMemo(() => results.find(r => r.roleId === selectedRoleId), [results, selectedRoleId])
  const selectedDeepResult = useMemo(() => selectedRoleId ? deepReports.get(selectedRoleId) : undefined, [deepReports, selectedRoleId])

  // ===== LLM 配置状态检测 =====
  const { status: llmConfigStatus, refresh: refreshLlmStatus } = useLlmStatus()

  // 重置
  const handleReset = () => {
    setRoles(getDefaultRoles())
    setMessages([])
    setInputText('')
    setConversationBg('')
    setResults([])
    setGlobalScan(null)
    setDeepReports(new Map())
    setLlmError(null)
    setMotivationReport(null)
    setShowReport(false)
    setSelectedRoleId('我')
    setChatHistory([])
  }

  return (
    <div className="min-h-screen pt-24 pb-12 bg-gradient-to-br from-slate-50 via-pink-50/30 to-indigo-50/20">
      <div className="max-w-[1700px] mx-auto px-4">

        {/* 顶部标题 */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 border border-pink-200 text-xs font-bold text-pink-600 tracking-wider mb-3 shadow-sm">
            <Target className="w-4 h-4" /> 需求洞察分析台
          </div>
          <h1 className="text-3xl lg:text-4xl font-black text-slate-900 mb-2">
            让每一次沟通都有<span className="bg-gradient-to-r from-pink-500 to-indigo-600 bg-clip-text text-transparent">"深度"</span>可循
          </h1>
          <p className="text-sm text-slate-600">粘贴对话 · 标注角色 · 补充背景 · 洞察真实需求</p>
          {/* LLM 状态指示器 */}
          <div className="mt-3">
            <LlmStatusBadge status={llmConfigStatus} onRefresh={refreshLlmStatus} />
          </div>
        </motion.div>

        {/* 场景选择 */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="flex gap-2 flex-wrap justify-center mb-2">
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
          {scene && (
            <div className="text-center mb-4">
              <span className="text-[10px] text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
                {SCENES.find(s => s.key === scene)?.desc}
              </span>
            </div>
          )}
        </motion.div>

        {!showReport ? (
          /* ===== 输入阶段 ===== */
          <div className="grid grid-cols-1 lg:grid-cols-[35%_65%] gap-4">
            {/* 左侧：输入区 */}
            <div className="space-y-4">
              {/* 对话输入 */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-sky-600" />
                    <span className="font-bold text-slate-800 text-sm">粘贴对话内容</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    支持格式：[角色名] 内容 或 (角色名) 内容，自动识别发言人
                  </p>
                </div>
                <div className="p-4">
                  <textarea
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    placeholder={'粘贴示例：\n[我] 最近怎么样？\n[她] 还行吧\n[闺蜜] 他最近可烦了\n\n或者：\n(张三) 在吗？\n(李四) 在的，怎么了？'}
                    rows={10}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 resize-none font-mono"
                  />
                  <div className="flex gap-2 mt-3">
                    <button onClick={handleParse}
                      className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 text-white text-xs font-bold shadow hover:shadow-lg transition-all disabled:opacity-40"
                      disabled={!inputText.trim()}>
                      <Zap className="w-3.5 h-3.5" />解析对话
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload}
                      className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="px-4 py-2.5 rounded-xl bg-pink-50 text-pink-600 text-xs font-semibold hover:bg-pink-100 border border-pink-200 transition-all disabled:opacity-40 flex items-center gap-1">
                      {uploadingImage ? <div className="w-3 h-3 border-2 border-pink-400 border-t-transparent rounded-full animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                      {uploadingImage ? '识别中' : '截图提取'}
                    </button>
                    <button onClick={() => setInputText('')}
                      className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-500 text-xs font-semibold hover:bg-red-50 hover:text-red-500 transition-all">
                      清空
                    </button>
                  </div>
                </div>
              </motion.div>

              {/* 角色管理 */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-sky-600" />
                    <span className="font-bold text-slate-800 text-sm">角色标注</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{roles.length}人</span>
                  </div>
                  <button onClick={addRole}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-pink-50 text-pink-600 text-[11px] font-bold hover:bg-pink-100 transition-all border border-pink-200">
                    <Plus className="w-3 h-3" />添加
                  </button>
                </div>
                <div className="p-3 space-y-2 max-h-[320px] overflow-y-auto">
                  {roles.map(role => {
                    const count = messages.filter(m => m.roleId === role.id).length
                    return (
                      <div key={role.id}
                        className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border transition-all cursor-pointer ${selectedRoleId === role.id ? 'border-sky-300 bg-sky-50' : 'border-slate-200 hover:border-slate-300'}`}
                        onClick={() => setSelectedRoleId(role.id)}>
                        <span className="text-xl flex-shrink-0 mt-0.5">{role.avatar}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <input
                              value={role.name}
                              onChange={e => setRoles(roles.map(r => r.id === role.id ? { ...r, name: e.target.value } : r))}
                              onClick={e => e.stopPropagation()}
                              className="text-xs font-bold text-slate-800 bg-transparent border-none outline-none flex-1 min-w-0"
                            />
                            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: role.color }} />
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-semibold">{count}条</span>
                          </div>
                          <input
                            value={role.relation || ''}
                            onChange={e => setRoles(roles.map(r => r.id === role.id ? { ...r, relation: e.target.value } : r))}
                            onClick={e => e.stopPropagation()}
                            placeholder="关系（如：前女友/老板/闺蜜）"
                            className="text-[10px] text-slate-500 bg-transparent border-none outline-none w-full mt-1"
                          />
                          <div className="flex gap-1 mt-1.5 items-center flex-wrap">
                            {mergingFromRole === role.id ? (
                              <div className="flex items-center gap-1 flex-wrap" onClick={e => e.stopPropagation()}>
                                <span className="text-[9px] text-slate-500 font-bold">合并到：</span>
                                {roles.filter(r => r.id !== role.id).map(r => (
                                  <button key={r.id}
                                    onClick={() => mergeRoles(role.id, r.id)}
                                    className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 hover:bg-sky-100 text-slate-700 hover:text-sky-700 font-semibold transition-all">
                                    {r.avatar} {r.name}
                                  </button>
                                ))}
                                <button onClick={(e) => { e.stopPropagation(); setMergingFromRole(null) }}
                                  className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-semibold hover:bg-red-200 transition-all">取消</button>
                              </div>
                            ) : (
                              <>
                                {roles.length > 1 && count > 0 && (
                                  <button onClick={(e) => { e.stopPropagation(); setMergingFromRole(mergingFromRole === role.id ? null : role.id) }}
                                    className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-700 font-semibold transition-all">
                                    合并
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        {roles.length > 1 && (
                          <button onClick={(e) => { e.stopPropagation(); removeRole(role.id) }}
                            className="text-slate-300 hover:text-red-400 transition-colors mt-0.5 flex-shrink-0" title="删除角色">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
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
                    <BookOpen className="w-4 h-4 text-sky-600" />
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
                        placeholder={'例如：\n- 这是我和前女友分手3个月后的对话\n- 我们分手时闹得很僵，她说我不尊重她\n- 她最近交了新男友\n- 我兄弟张三借住在她的房子里'}
                        rows={5}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-sky-400 resize-none"
                      />
                      <button onClick={() => setConversationBgEditing(false)}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-sky-500 text-white text-xs font-bold hover:bg-sky-600 transition-all">
                        <Check className="w-3.5 h-3.5" />保存背景
                      </button>
                    </div>
                  ) : (
                    <div>
                      {conversationBg ? (
                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                          <p className="text-xs text-slate-700 whitespace-pre-line">{conversationBg}</p>
                          <button onClick={() => setConversationBgEditing(true)}
                            className="mt-2 text-[10px] text-sky-600 font-bold flex items-center gap-1 hover:underline">
                            <Edit3 className="w-3 h-3" />编辑背景
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setConversationBgEditing(true)}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 text-xs font-semibold hover:border-sky-300 hover:text-sky-500 transition-all">
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
                        <Sparkles className="w-5 h-5" />
                      </motion.div>
                      <span>深度分析中…</span>
                    </>
                  ) : (
                    <>
                      <Brain className="w-5 h-5" />
                      <span>开始深度分析</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
                <div className="flex items-center justify-between mt-3 text-[11px] text-slate-400">
                  <span>当前：{roles.length} 个角色 · {messages.length} 条消息 {conversationBg && <span>· 已填背景</span>}</span>
                  <button onClick={() => {
                    if (window.confirm('确认清空所有内容吗？包括对话、角色、背景、分析结果。')) handleReset()
                  }}
                    className="flex items-center gap-1 text-slate-400 hover:text-red-500 transition-colors font-semibold">
                    <Trash2 className="w-3 h-3" />一键清空
                  </button>
                </div>
              </motion.div>
            </div>

            {/* 右侧：预览区 */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-sky-600" />
                  <span className="font-bold text-slate-800 text-sm">对话预览</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{messages.length}条</span>
                </div>
              </div>
              <div className="p-4 max-h-[600px] overflow-y-auto space-y-2 relative">
                {/* 未标注消息提醒 */}
                {unlabeledCount > 0 && (
                  <div className="mb-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-3 border border-amber-200 flex items-start gap-2">
                    <span className="text-lg">⚠️</span>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-amber-700 mb-1">有 {unlabeledCount} 条消息未标注说话人</p>
                      <p className="text-[10px] text-amber-600">点击消息左边的头像，为每一条消息选择正确的说话人角色</p>
                    </div>
                  </div>
                )}

                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                    <MessageSquare className="w-12 h-12 mb-3 opacity-30" />
                    <p className="text-sm font-semibold">粘贴对话后自动显示</p>
                    <p className="text-[10px] mt-1">支持 [角色名] / 角色名： / (角色名) 等多种格式</p>
                    <p className="text-[10px] mt-1">没有格式也没关系，可点击头像手动标注</p>
                  </div>
                ) : (
                  messages.map(msg => {
                    const isUnlabeled = msg.roleId === UNLABELED_ROLE_ID
                    const role = isUnlabeled ? UNLABELED_ROLE : roles.find(r => r.id === msg.roleId)
                    const isSelecting = selectingRoleForMsgId === msg.id
                    return (
                      <div key={msg.id} className={`group flex gap-2.5 ${isUnlabeled ? 'bg-amber-50/60 rounded-xl p-1 border border-amber-200' : ''}`}>
                        {/* 点击头像可以选择角色 */}
                        <button
                          onClick={() => setSelectingRoleForMsgId(isSelecting ? null : msg.id)}
                          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all hover:scale-110 hover:shadow-md"
                          style={{
                            background: (role?.color || '#64748B') + '22',
                            color: role?.color || '#64748B',
                            border: isSelecting ? `2px dashed ${role?.color || '#F59E0B'}` : 'none',
                            cursor: 'pointer'
                          }}
                          title="点击选择/修改说话人">
                          {role?.avatar || '👤'}
                        </button>
                        <div className="flex-1 min-w-0 relative">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[11px] font-bold" style={{ color: role?.color }}>
                              {role?.name || msg.roleId}
                            </span>
                            {isUnlabeled && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold animate-pulse">请标注</span>
                            )}
                            {msg.bgNote && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 font-semibold">📝有背景</span>
                            )}
                          </div>
                          {editingContentMsgId === msg.id ? (
                            <div className="bg-slate-50 rounded-xl rounded-tl-sm px-3 py-2 border border-sky-300 shadow-inner">
                              <textarea
                                value={editingContentInput}
                                onChange={e => setEditingContentInput(e.target.value)}
                                rows={3}
                                autoFocus
                                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-sky-400 resize-none"
                              />
                              <div className="flex gap-2 mt-2">
                                <button onClick={() => saveEditContent(msg.id)}
                                  className="text-[10px] px-3 py-1 rounded-lg bg-sky-500 text-white font-bold hover:bg-sky-600 transition-all">
                                  ✓ 保存
                                </button>
                                <button onClick={() => { setEditingContentMsgId(null); setEditingContentInput('') }}
                                  className="text-[10px] px-3 py-1 rounded-lg bg-slate-100 text-slate-500 font-bold hover:bg-slate-200 transition-all">
                                  取消
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-slate-50 rounded-xl rounded-tl-sm px-3 py-2 border border-slate-200/60">
                              <p className="text-xs text-slate-700 leading-relaxed">{msg.content}</p>
                              {msg.bgNote && (
                                <p className="text-[10px] text-amber-600 mt-1 italic border-t border-amber-200 pt-1">
                                  📌 背景：{msg.bgNote}
                                </p>
                              )}
                            </div>
                          )}
                          <div className="flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button onClick={() => startEditContent(msg)}
                              className="text-[9px] text-slate-400 hover:text-sky-500 font-semibold">
                              ✏️ 编辑内容
                            </button>
                            <span className="text-[9px] text-slate-300">|</span>
                            <button onClick={() => {
                              const bg = prompt('为此消息添加背景说明（AI分析时会参考）：', msg.bgNote || '')
                              if (bg !== null) addMessageBg(msg.id, bg)
                            }}
                              className="text-[9px] text-slate-400 hover:text-amber-500 font-semibold">
                              + 背景注释
                            </button>
                            <span className="text-[9px] text-slate-300">|</span>
                            <button onClick={() => setMessages(messages.filter(m => m.id !== msg.id))}
                              className="text-[9px] text-slate-400 hover:text-red-500 font-semibold">
                              🗑 删除
                            </button>
                          </div>

                          {/* 角色选择下拉框 */}
                          {isSelecting && (
                            <motion.div
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="absolute top-0 left-0 z-10 bg-white rounded-xl shadow-2xl border border-slate-200 p-2 min-w-[200px] mt-10"
                              onClick={(e) => e.stopPropagation()}>
                              <p className="text-[10px] text-slate-500 font-semibold px-2 pb-1 border-b border-slate-100 mb-1">选择这条消息的说话人</p>
                              <div className="max-h-[200px] overflow-y-auto space-y-1">
                                {roles.map(r => (
                                  <button key={r.id}
                                    onClick={() => setMsgRole(msg.id, r.id)}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-all text-left">
                                    <span className="text-base w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: r.color + '22' }}>{r.avatar}</span>
                                    <span className="text-xs font-semibold text-slate-700">{r.name}</span>
                                    {r.relation && <span className="text-[9px] text-slate-400">{r.relation}</span>}
                                  </button>
                                ))}
                                <div className="pt-1 border-t border-slate-100 space-y-1">
                                  <button onClick={addRole}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sky-50 transition-all text-left">
                                    <span className="text-base">➕</span>
                                    <span className="text-xs font-semibold text-sky-600">新建角色</span>
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </motion.div>
          </div>
        ) : (
          /* ===== 分析结果阶段 ===== */
          <div className="space-y-4">
            {/* 顶部概览 */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-lg p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500 to-indigo-700 flex items-center justify-center shadow-lg">
                    <Brain className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="font-black text-slate-900 text-base">分析完成</div>
                    <div className="text-xs text-slate-500">{roles.length}个角色 · {messages.length}条消息 · {SCENES.find(s => s.key === scene)?.label}</div>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setShowReport(false)}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-sky-50 hover:text-sky-700 transition-all border border-slate-200">
                    <ArrowRight className="w-3.5 h-3.5 rotate-180" />返回编辑
                  </button>
                  <button onClick={() => { setDeepReports(new Map()); handleAnalyze() }}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-emerald-50 hover:text-emerald-700 transition-all border border-slate-200">
                    <RefreshCw className="w-3.5 h-3.5" />保留内容·重新分析
                  </button>
                  <button onClick={() => {
                    if (window.confirm('确认清空所有内容吗？包括对话、角色、背景、分析结果。')) handleReset()
                  }}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100 transition-all border border-red-200">
                    <Trash2 className="w-3.5 h-3.5" />一键清空
                  </button>
                  <button onClick={() => handleExportReport()}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-indigo-600 text-white text-xs font-bold shadow hover:shadow-lg transition-all">
                    <Download className="w-3.5 h-3.5" />导出报告
                  </button>
                </div>
              </div>
            </motion.div>

            {/* LLM 调用错误提示 */}
            {llmError && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="bg-gradient-to-r from-red-50 to-orange-50 rounded-2xl border border-red-200 shadow-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  </div>
                  <div className="flex-1">
                    <div className="font-black text-red-800 text-sm mb-1">⚠️ LLM 调用异常</div>
                    <p className="text-xs text-red-700 leading-relaxed mb-2">{llmError}</p>
                    <div className="bg-white/70 rounded-xl p-3 border border-red-200/60">
                      <p className="text-[11px] text-slate-600">
                        💡 <span className="font-bold">已自动使用关键词回退分析。</span>
                        请检查：① /models 页面的 API Key 是否正确 ② baseUrl 是否可访问 ③ 打开浏览器控制台（F12）查看 [Insight] 日志
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* 整体冲突诊断 */}
            {overallConflict && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 shadow-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <div className="font-black text-amber-800 text-sm mb-1">{overallConflict.title}</div>
                    <p className="text-xs text-amber-700 leading-relaxed mb-2">{overallConflict.desc}</p>
                    <div className="bg-white/70 rounded-xl p-3 border border-amber-200/60">
                      <span className="text-[10px] font-bold text-amber-600 mb-1 block">💡 建议</span>
                      <p className="text-xs text-slate-700">{overallConflict.suggestion}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ===== 需求动因分析报告（LLM 自由文本） ===== */}
            {(motivationReport || isGeneratingReport) && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-br from-white via-indigo-50/30 to-pink-50/30 backdrop-blur-xl rounded-2xl border border-indigo-200 shadow-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-indigo-200 bg-gradient-to-r from-indigo-50 to-pink-50">
                  <div className="flex items-center gap-2">
                    <Brain className="w-5 h-5 text-indigo-600" />
                    <span className="font-black text-slate-900 text-base">需求动因分析报告</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold">LLM 深度解析</span>
                    {isGeneratingReport && (
                      <span className="flex items-center gap-1 text-[10px] text-pink-500 font-semibold ml-2">
                        <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                          <Sparkles className="w-3.5 h-3.5" />
                        </motion.span>
                        生成中…
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-5 max-h-[800px] overflow-y-auto">
                  {isGeneratingReport ? (
                    <div className="flex flex-col items-center py-8 text-slate-400">
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
                        <Brain className="w-10 h-10 mb-3 text-indigo-300" />
                      </motion.div>
                      <p className="text-sm font-semibold">AI 正在分析对话中的需求动因…</p>
                      <p className="text-xs mt-1">这需要 5-10 秒，请稍候</p>
                    </div>
                  ) : motivationReport ? (
                    <div className="prose prose-sm max-w-none">
                      {renderChatContent(motivationReport)}
                    </div>
                  ) : null}
                </div>
              </motion.div>
            )}

            {/* 角色切换 + 分析详情 */}
            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
              {/* 左侧角色列表 */}
              <div className="space-y-3">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-1">选择角色查看分析</div>
                {roles.map(role => {
                  const result = results.find(r => r.roleId === role.id)
                  const scanRole = globalScan?.roles.find(r => r.roleId === role.id)
                  const isDeepAnalyzed = deepReports.has(role.id)
                  const isDeepAnalyzing = deepAnalyzingRoleId === role.id
                  const topNeed = scanRole?.topNeedHint
                  return (
                    <button key={role.id} onClick={() => setSelectedRoleId(role.id)}
                      className={`w-full text-left p-4 rounded-2xl border transition-all ${selectedRoleId === role.id
                        ? 'border-sky-300 bg-sky-50 shadow-md'
                        : 'border-slate-200 bg-white hover:border-slate-300 shadow-sm'
                        }`}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                          style={{ background: role.color + '22' }}>
                          {role.avatar}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-slate-800 text-sm">{role.name}</div>
                          {role.relation && <div className="text-[10px] text-slate-500">{role.relation}</div>}
                          {scanRole?.roleInScene && (
                            <div className="text-[9px] text-slate-400 mt-0.5">{scanRole.roleInScene}</div>
                          )}
                          {topNeed && topNeed !== '无' && (
                            <div className="mt-1 text-[10px] px-2 py-0.5 rounded-full inline-block font-bold"
                              style={{ background: role.color + '22', color: role.color }}>
                              需求：{topNeed}
                            </div>
                          )}
                          {!isDeepAnalyzed && !isDeepAnalyzing && (
                            <div className="mt-1.5">
                              <span className="text-[9px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 font-semibold">
                                点击查看详情
                              </span>
                            </div>
                          )}
                          {isDeepAnalyzing && (
                            <div className="mt-1.5 flex items-center gap-1 text-[9px] text-pink-500 font-semibold">
                              <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-3 h-3 border border-pink-400 border-t-transparent rounded-full inline-block" />
                              AI解析中…
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          {result && (
                            <div className="text-[10px] px-2 py-1 rounded-lg font-bold"
                              style={{ background: result.emotion?.includes('愤怒') ? '#FEE2E2' : result.emotion?.includes('讽刺') ? '#FEF3C7' : result.emotion?.includes('委屈') ? '#FCE7F3' : '#F0FDF4', color: result.emotion?.includes('愤怒') ? '#B91C1C' : result.emotion?.includes('讽刺') ? '#B45309' : result.emotion?.includes('委屈') ? '#BE185D' : '#166534' }}>
                              {result.emotion}
                            </div>
                          )}
                          {isDeepAnalyzed && (
                            <span className="text-[9px] text-emerald-500 font-bold">✓ 已深度解析</span>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* 右侧分析详情 */}
              <div>
                {selectedResult && selectedRole ? (
                  <motion.div key={selectedRoleId} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                    className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-lg overflow-hidden">
                    {/* 角色头部 */}
                    <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                          style={{ background: selectedRole.color + '22' }}>
                          {selectedRole.avatar}
                        </div>
                        <div className="flex-1">
                          <div className="font-black text-slate-900 text-base">{selectedRole.name}</div>
                          {selectedRole.relation && <div className="text-xs text-slate-500">{selectedRole.relation}</div>}
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                              style={{ background: selectedRole.color + '22', color: selectedRole.color }}>
                              {selectedResult.emotion}情绪
                            </span>
                            {globalScan?.roles.find(r => r.roleId === selectedRoleId)?.roleInScene && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold">
                                {globalScan?.roles.find(r => r.roleId === selectedRoleId)?.roleInScene}
                              </span>
                            )}
                            {selectedDeepResult && selectedResult.conflictPoints.length > 0 && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 font-bold">
                                ⚡ {selectedResult.conflictPoints.length}个冲突点
                              </span>
                            )}
                          </div>
                        </div>
                        {!selectedDeepResult && !deepAnalyzingRoleId && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeepAnalyze(selectedRoleId!) }}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-indigo-600 text-white text-xs font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all">
                            <Brain className="w-3.5 h-3.5" />
                            深度解析
                          </button>
                        )}
                        {deepAnalyzingRoleId === selectedRoleId && (
                          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-pink-50 border border-pink-200 text-pink-600 text-xs font-bold">
                            <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                              <Sparkles className="w-3.5 h-3.5" />
                            </motion.span>
                            AI深度解析中…
                          </div>
                        )}
                      </div>
                      {!selectedDeepResult && globalScan?.roles.find(r => r.roleId === selectedRoleId)?.briefJudgment && (
                        <div className="mt-3 bg-slate-50 rounded-xl p-3 border border-slate-200">
                          <p className="text-xs text-slate-600">
                            <span className="font-bold text-slate-700">📋 快速判断：</span>
                            {globalScan?.roles.find(r => r.roleId === selectedRoleId)?.briefJudgment}
                          </p>
                          <p className="text-[10px] text-indigo-500 mt-1.5 font-semibold">
                            💡 点击右上角「深度解析」按钮，AI将对此角色进行完整心理画像分析
                          </p>
                        </div>
                      )}
                    </div>

                    {selectedDeepResult ? (
                    <div className="p-4 max-h-[600px] overflow-y-auto">
                      <div className="bg-gradient-to-br from-indigo-50/50 via-white to-pink-50/50 rounded-xl border border-indigo-100 p-4">
                        <div className="text-[11px] font-bold text-indigo-700 mb-3 flex items-center gap-1">
                          <Brain className="w-3.5 h-3.5" />{selectedRole.name} · 深度心理分析
                        </div>
                        <div className="prose prose-sm max-w-none text-xs leading-relaxed text-slate-700">
                          {renderChatContent(selectedDeepResult)}
                        </div>
                      </div>
                    </div>
                    ) : (
                      <div className="p-8 flex items-center justify-center">
                        <div className="text-center">
                          <Brain className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                          <p className="text-sm font-semibold text-slate-500">点击右上角「深度解析」按钮</p>
                          <p className="text-xs text-slate-400 mt-1">AI将对此角色进行完整心理分析</p>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <div className="flex items-center justify-center h-64 text-slate-400">
                    <div className="text-center">
                      <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">选择一个角色查看分析</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* AI 追问助手 */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-pink-500" />
                  <span className="font-bold text-slate-800 text-sm">AI 追问助手</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-100 text-pink-600">基于分析结果回答</span>
                </div>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex gap-2 flex-wrap mb-2">
                  {['她到底还在不在乎我？', '她为什么这么激动？', '我应该怎么办？', '她这些话是什么意思？'].map((q, i) => (
                    <button key={i} onClick={() => setChatInput(q)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-sky-50 hover:text-sky-700 text-[10px] font-semibold text-slate-600 border border-slate-200 transition-all">
                      {q}
                    </button>
                  ))}
                </div>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role === 'ai' && (
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-pink-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                          <Sparkles className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                      <div className={`rounded-2xl px-3 py-2 text-xs leading-relaxed max-w-[85%] ${msg.role === 'user'
                        ? 'bg-slate-900 text-white whitespace-pre-line'
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                        {msg.role === 'user' ? msg.content : renderChatContent(msg.content)}
                      </div>
                    </div>
                  ))}
                  {isProcessingChat && (
                    <div className="flex gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-pink-500 to-indigo-600 flex items-center justify-center">
                        <Sparkles className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="bg-slate-100 rounded-2xl px-3 py-2 border border-slate-200">
                        <div className="flex gap-1">
                          {[0, 1, 2].map(i => (
                            <motion.span key={i} animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                              className="w-2 h-2 rounded-full bg-pink-500" />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                {chatHistory.length >= 2 && !isProcessingChat && (
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 pt-2 border-t border-dashed border-slate-200 mt-1">
                  <RefreshCw className="w-3 h-3 text-slate-400" />
                  <span>不满意这版回答？</span>
                  <button
                    onClick={() => {
                      const lastUserMsg = [...chatHistory].reverse().find(m => m.role === 'user')
                      if (!lastUserMsg) return
                      setChatHistory(h => h.slice(0, -1))
                      const q = lastUserMsg.content
                      handleChatAsk(q, 'regenerate')
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-pink-50 hover:text-pink-700 border border-slate-200 font-semibold">
                    重新生成
                  </button>
                  <button
                    onClick={() => {
                      const lastUserMsg = [...chatHistory].reverse().find(m => m.role === 'user')
                      if (!lastUserMsg) return
                      setChatHistory(h => h.slice(0, -1))
                      handleChatAsk(lastUserMsg.content, 'more_concise')
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-sky-50 hover:text-sky-700 border border-slate-200 font-semibold">
                    更简短
                  </button>
                  <button
                    onClick={() => {
                      const lastUserMsg = [...chatHistory].reverse().find(m => m.role === 'user')
                      if (!lastUserMsg) return
                      setChatHistory(h => h.slice(0, -1))
                      handleChatAsk(lastUserMsg.content, 'different_angle')
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-amber-50 hover:text-amber-700 border border-slate-200 font-semibold">
                    换个角度
                  </button>
                  <button
                    onClick={() => {
                      const lastUserMsg = [...chatHistory].reverse().find(m => m.role === 'user')
                      if (!lastUserMsg) return
                      setChatHistory(h => h.slice(0, -1))
                      handleChatAsk(lastUserMsg.content, 'more_detail')
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-violet-50 hover:text-violet-700 border border-slate-200 font-semibold">
                    更详细
                  </button>
                </div>
                )}
                <div className="flex gap-2 mt-3">
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleChatAsk() }}
                    placeholder="问她到底什么意思？我应该怎么办？..."
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-pink-400"
                  />
                  <button onClick={() => handleChatAsk()}
                    disabled={!chatInput.trim() || isProcessingChat}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-indigo-600 text-white text-xs font-bold shadow hover:shadow-lg transition-all disabled:opacity-40">
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  )
}
