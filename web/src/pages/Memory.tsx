import { motion } from 'framer-motion'
import { useState, useEffect, useMemo } from 'react'
import {
  Brain,
  Clock,
  Layers,
  Sparkles,
  Database,
  Target,
  Trash2,
  RefreshCw,
  LineChart,
  Flame,
  GitBranch,
  AlertTriangle,
  CheckCircle2,
  Network,
} from 'lucide-react'
import ReactECharts from 'echarts-for-react'
import {
  NEED_NAMES,
  NEED_LAYERS,
  LEVEL_WEIGHTS,
  getProfile,
  getAllEntries,
  resetAllMemory,
  type UserProfile,
  type MemoryEntry,
} from '../lib/api'

const NEED_COLORS_RGB: string[] = [
  '#3B82F6', '#0EA5E9', '#8B5CF6', '#EC4899', '#F59E0B',
  '#14B8A6', '#F97316', '#84CC16', '#06B6D4', '#6366F1',
  '#22C55E', '#A855F7',
]

const MEMORY_LAYERS = [
  { level: 'L1', name: '原始痕迹', icon: Database, color: 'from-slate-400 to-slate-600', description: '对话原始文本、时间戳的完整存档。每一条对话都是一条原始记忆。' },
  { level: 'L2', name: '原子事实', icon: Target, color: 'from-sky-400 to-sky-600', description: '从对话中抽取的关键事实：每个需求的势能、激活关系、冲突配对。' },
  { level: 'L3', name: '身份画像', icon: Brain, color: 'from-indigo-400 to-indigo-600', description: '12 维需求权重向量：经过贝叶斯更新形成的稳定用户画像。' },
  { level: 'L4', name: '会话摘要', icon: Layers, color: 'from-violet-400 to-violet-600', description: '对话主题、关键决策、情感倾向的结构化摘要（短期记忆 30 轮窗口）。' },
  { level: 'L5', name: '心智模型', icon: Sparkles, color: 'from-amber-400 to-amber-600', description: '用户的长期行为模式、决策风格、反复出现的需求冲突模式。' },
  { level: 'L6', name: '前瞻意图', icon: GitBranch, color: 'from-emerald-400 to-emerald-600', description: '基于历史数据预测用户未来可能关注的需求方向（Top 3 协同需求）。' },
]

// 从 Agent 页面的 localStorage 读取对话标题
function getConversationTitle(sessionId: string): string {
  try {
    const raw = localStorage.getItem('dpu_agent_conversations_v1')
    if (!raw) return sessionId.slice(-6)
    const convs = JSON.parse(raw) as { id: string; title: string }[]
    const found = convs.find(c => c.id === sessionId)
    return found?.title || sessionId.slice(-6)
  } catch { return sessionId.slice(-6) }
}

export function MemoryPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [entries, setEntries] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmReset, setConfirmReset] = useState(false)
  const [sessionFilter, setSessionFilter] = useState<string>('all')
  const [sessions, setSessions] = useState<string[]>([])

  const loadData = async () => {
    setLoading(true)
    try {
      const [p, e] = await Promise.all([getProfile(), getAllEntries()])
      setProfile(p)
      setEntries(e)
      // 收集所有唯一会话 ID
      const ids = new Set<string>()
      e.forEach(entry => { if (entry.session_id) ids.add(entry.session_id) })
      setSessions(Array.from(ids))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // 每次页面重新获得焦点时刷新数据
    const onFocus = () => loadData()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') loadData()
    })
    return () => {
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  // 按会话筛选（无 session_id 的旧数据归入"未分类"）
  const filteredEntries = sessionFilter === 'all'
    ? entries
    : sessionFilter === '__unclassified__'
      ? entries.filter(e => !e.session_id)
      : entries.filter(e => e.session_id === sessionFilter)

  // 有会话数据时，自动选第一个（而非 all）作为默认视图
  useEffect(() => {
    if (sessions.length > 0 && sessionFilter === 'all') {
      const first = sessions[0]
      if (first) setSessionFilter(first)
    }
  }, [sessions])

  const handleReset = async () => {
    await resetAllMemory()
    setConfirmReset(false)
    await loadData()
  }

  // ======== 派生数据：权重演化时间线 ========
  const timelineSeries = useMemo(() => {
    if (filteredEntries.length === 0) return { labels: [], series: [], topIds: [] }
    // 取 Top 4 长期权重需求
    const weights = profile?.weights || LEVEL_WEIGHTS
    const topIds = weights
      .map((w, i) => ({ id: i, w }))
      .sort((a, b) => b.w - a.w)
      .slice(0, 4)
      .map(x => x.id)

    const labels = filteredEntries.map((_, i) => `#${i + 1}`)
    const series = topIds.map(id => ({
      name: NEED_NAMES[id],
      color: NEED_COLORS_RGB[id],
      values: filteredEntries.map(e => {
        const snap = e.needs.find(n => n.need_id === id)
        return snap ? +snap.potential.toFixed(3) : 0
      }),
    }))
    return { labels, series, topIds }
  }, [entries, profile])

  // ======== 图表配置：折线图 ========
  const lineChartOption = useMemo(() => {
    if (timelineSeries.series.length === 0) return {}
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: timelineSeries.series.map(s => s.name), bottom: 0, textStyle: { color: '#475569', fontSize: 12 } },
      grid: { left: '3%', right: '4%', top: '4%', bottom: '15%', containLabel: true },
      xAxis: { type: 'category', boundaryGap: false, data: timelineSeries.labels, axisLabel: { color: '#64748B', fontSize: 10 }, axisLine: { lineStyle: { color: '#CBD5E1' } } },
      yAxis: { type: 'value', min: 0, max: 1, axisLabel: { color: '#64748B' }, axisLine: { lineStyle: { color: '#CBD5E1' } }, splitLine: { lineStyle: { color: 'rgba(203,213,225,0.4)' } } },
      series: timelineSeries.series.map(s => ({
        name: s.name,
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        data: s.values,
        lineStyle: { width: 3, color: s.color },
        itemStyle: { color: s.color, borderColor: '#fff', borderWidth: 2 },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: s.color + '55' }, { offset: 1, color: s.color + '00' }] } },
      })),
    }
  }, [timelineSeries])

  // ======== 图表配置：画像权重雷达 ========
  const profileRadarOption = useMemo(() => {
    if (!profile) return {}
    return {
      tooltip: { trigger: 'item' },
      radar: {
        indicator: NEED_NAMES.map(name => ({ name, max: 1 })),
        shape: 'polygon',
        splitNumber: 4,
        axisName: { color: '#334155', fontSize: 12, fontWeight: 'bold' },
        splitLine: { lineStyle: { color: 'rgba(139,92,246,0.15)' } },
        splitArea: { areaStyle: { color: ['rgba(139,92,246,0.02)', 'rgba(139,92,246,0.05)', 'rgba(139,92,246,0.08)', 'rgba(139,92,246,0.12)'] } },
        axisLine: { lineStyle: { color: 'rgba(139,92,246,0.3)' } },
      },
      series: [{
        name: '用户画像权重',
        type: 'radar',
        data: [
          {
            value: profile.weights,
            name: '长期记忆权重',
            areaStyle: { color: 'rgba(139,92,246,0.35)' },
            lineStyle: { color: '#8B5CF6', width: 2.5 },
            itemStyle: { color: '#8B5CF6' },
            symbol: 'circle',
            symbolSize: 8,
          },
          {
            value: LEVEL_WEIGHTS,
            name: '默认基础权重',
            areaStyle: { color: 'rgba(100,116,139,0.15)' },
            lineStyle: { color: '#64748B', width: 1.5, type: 'dashed' },
            itemStyle: { color: '#64748B' },
            symbol: 'diamond',
            symbolSize: 6,
          },
        ],
      }],
      legend: { data: ['长期记忆权重', '默认基础权重'], bottom: 0, textStyle: { color: '#475569', fontSize: 12 } },
    }
  }, [profile])

  // ======== 图表配置：共现矩阵热力图 ========
  const heatmapOption = useMemo(() => {
    if (!profile) return {}
    const mat = profile.co_occurrence_matrix
    const maxVal = Math.max(1, ...mat.flat())
    const normalized = mat.map(row => row.map(v => +(v / maxVal).toFixed(2)))
    const data: [number, number, number][] = []
    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 12; j++) {
        data.push([j, i, normalized[i][j]])
      }
    }
    return {
      tooltip: {
        position: 'top',
        formatter: (p: any) => `${NEED_NAMES[p.value[1]]} ↔ ${NEED_NAMES[p.value[0]]}<br/>共现强度: <b>${p.value[2].toFixed(2)}</b>`,
      },
      grid: { top: 20, left: 110, right: 20, bottom: 100 },
      xAxis: { type: 'category', data: NEED_NAMES, axisLabel: { rotate: 45, color: '#475569', fontSize: 11 }, splitArea: { show: true } },
      yAxis: { type: 'category', data: NEED_NAMES, axisLabel: { color: '#475569', fontSize: 11 }, splitArea: { show: true } },
      visualMap: {
        min: 0, max: 1, calculable: true, orient: 'horizontal', left: 'center', bottom: 10,
        textStyle: { color: '#475569' },
        inRange: { color: ['#F1F5F9', '#E0E7FF', '#A5B4FC', '#818CF8', '#6366F1', '#4F46E5'] },
      },
      series: [{ name: '共现强度', type: 'heatmap', data, label: { show: false } }],
    }
  }, [profile])

  // ======== 图表配置：激活次数柱状图 ========
  const activationBarOption = useMemo(() => {
    if (!profile) return {}
    const counts = profile.activation_counts
    const maxVal = Math.max(1, ...counts)
    const sorted = counts
      .map((c, i) => ({ id: i, c }))
      .sort((a, b) => b.c - a.c)
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '8%', bottom: '3%', top: '3%', containLabel: true },
      xAxis: { type: 'value', axisLine: { lineStyle: { color: '#CBD5E1' } }, axisLabel: { color: '#64748B' }, splitLine: { lineStyle: { color: 'rgba(203,213,225,0.4)' } } },
      yAxis: { type: 'category', data: sorted.map(s => NEED_NAMES[s.id]).reverse(), axisLine: { lineStyle: { color: '#CBD5E1' } }, axisLabel: { color: '#334155', fontWeight: 'bold', fontSize: 11 } },
      series: [{
        name: '激活次数',
        type: 'bar',
        data: sorted.map(s => ({
          value: s.c,
          itemStyle: {
            color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: NEED_COLORS_RGB[s.id] + 'CC' }, { offset: 1, color: NEED_COLORS_RGB[s.id] }] },
            borderRadius: [0, 6, 6, 0],
          },
        })).reverse(),
        label: { show: true, position: 'right', color: '#334155', fontWeight: 'bold' },
      }],
    }
  }, [profile])

  // ======== 时间线节点 ========
  const timelineNodes = useMemo(() => {
    if (filteredEntries.length === 0) return []
    return filteredEntries.slice(-10).map((entry, idx) => ({
      date: new Date(entry.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
      title: entry.needs[0] ? `「${NEED_NAMES[entry.needs[0].need_id]}」主导` : '弱信号对话',
      description: entry.raw_text.length > 80 ? entry.raw_text.slice(0, 80) + '…' : entry.raw_text,
      topNeed: entry.needs[0]?.need_id,
      conflict: entry.has_conflict,
      tone: entry.emotional_tone,
    }))
  }, [entries])

  // ======== 前瞻意图 ========
  const anticipatedNeeds = useMemo(() => {
    if (!profile || !profile.anticipated_next_needs || profile.anticipated_next_needs.length === 0) {
      // 根据权重推断
      const sorted = profile?.weights
        ? profile.weights.map((w, i) => ({ id: i, w })).sort((a, b) => b.w - a.w).slice(0, 3).map(x => x.id)
        : []
      return sorted
    }
    return profile.anticipated_next_needs
  }, [profile])

  return (
    <div className="min-h-screen pt-32 pb-24">
      <div className="max-w-[1400px] mx-auto px-6">
        {/* 标题 */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-card text-xs font-semibold text-violet-600 tracking-wider mb-6">
            <Brain className="w-3.5 h-3.5" /> MEMORY SYSTEM · 六层记忆架构
          </div>
          <h1 className="text-5xl font-black text-slate-900 mb-4 tracking-tight text-balance">
            <span className="bg-gradient-to-r from-violet-600 via-indigo-600 to-sky-600 bg-clip-text text-transparent">认知记忆</span>的六层堆叠
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto text-balance leading-relaxed">
            从原始对话到心智模型 —— 你的每一次对话都会更新贝叶斯权重，
            形成独属于你的决策画像。
          </p>
          <div className="flex items-center justify-center gap-3 mt-5 flex-wrap">
            <a
              href="/agent"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors no-underline"
            >
              ← 返回需求分析
            </a>
            <span className="text-[11px] text-indigo-400 bg-indigo-50/50 px-3 py-1.5 rounded-lg">
              📡 数据来自「AI 如何理解需求」页面，实时同步
            </span>
          </div>
          <div className="flex items-center justify-center gap-4 mt-6 text-xs font-bold text-slate-500 flex-wrap">
            <span className="flex items-center gap-1.5"><Database className="w-3.5 h-3.5 text-sky-600" /> {filteredEntries.length} 条记忆</span>
            <span className="text-slate-300">·</span>
            <span className="flex items-center gap-1.5"><Target className="w-3.5 h-3.5 text-indigo-600" /> {profile?.interaction_count || 0} 轮交互</span>
            <span className="text-slate-300">·</span>
            <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-violet-600" /> 持久化存储</span>
          </div>
          {/* 会话筛选 — 与 Agent 对话列表同步 */}
          {sessions.length > 0 && (
            <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
              <span className="text-[10px] text-slate-400">📋</span>
              {sessions.map((sid) => {
                const title = getConversationTitle(sid)
                const isActive = sessionFilter === sid
                return (
                  <button
                    key={sid}
                    onClick={() => setSessionFilter(sid)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all truncate max-w-[200px] ${isActive ? 'bg-indigo-500 text-white shadow' : 'bg-white text-slate-600 border border-slate-200 hover:bg-indigo-50'}`}
                    title={sid}
                  >
                    {title}
                  </button>
                )
              })}
              <button
                onClick={() => setSessionFilter('all')}
                className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${sessionFilter === 'all' ? 'bg-slate-700 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100'}`}
              >全部</button>
            </div>
          )}
          <div className="flex items-center justify-center gap-4 mt-3 text-xs font-bold text-slate-500 flex-wrap">
            <button
              onClick={() => setConfirmReset(true)}
              className="ml-4 px-3 py-1.5 rounded-lg bg-white hover:bg-red-50 text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3 h-3" /> 清空记忆
            </button>
            <button
              onClick={loadData}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-sky-50 text-sky-600 border border-sky-200 hover:border-sky-300 transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3 h-3" /> 刷新
            </button>
          </div>
        </motion.div>

        {/* 重置确认弹窗 */}
        {confirmReset && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl p-8 max-w-md mx-4 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-center mb-4">
                <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
              </div>
              <h3 className="text-xl font-black text-slate-900 text-center mb-2">确定清空所有记忆？</h3>
              <p className="text-sm text-slate-600 text-center mb-6 leading-relaxed">
                这会删除 {entries.length} 条记忆条目和当前用户画像，无法恢复。
                <br />你的 Agent 将从空白状态重新开始学习你的需求模式。
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmReset(false)} className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-colors">
                  取消
                </button>
                <button onClick={handleReset} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm transition-colors">
                  确认清空
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* 6 层记忆卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
          {MEMORY_LAYERS.map((layer, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
              className="glass-strong p-7 relative overflow-hidden group hover:shadow-lg transition-shadow"
            >
              <div className={`absolute -right-8 -top-8 w-32 h-32 rounded-full bg-gradient-to-br ${layer.color} opacity-10 group-hover:opacity-20 transition-opacity`} />
              <div className="flex items-start justify-between mb-5 relative">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${layer.color} flex items-center justify-center soft-shadow`}>
                  <layer.icon className="w-7 h-7 text-white" />
                </div>
                <div className="text-right">
                  <div className="text-3xl font-black text-slate-900 font-mono">{layer.level}</div>
                </div>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">{layer.name}</h3>
              <p className="text-slate-600 leading-relaxed text-sm">{layer.description}</p>
            </motion.div>
          ))}
        </div>

        {/* 记忆演化时间线 */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-strong p-6 lg:p-10 mb-12">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-600" /> L2 · 最近记忆流（最近 10 条）
              </h3>
              <p className="text-sm text-slate-500 mt-1">每条对话都被记录为一条可追溯的记忆</p>
            </div>
            <div className="hidden md:flex items-center gap-4 text-xs font-bold text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-sky-500" /> Top 需求</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> 含冲突</span>
            </div>
          </div>

          {timelineNodes.length > 0 ? (
            <div className="relative">
              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-sky-400 via-indigo-400 to-violet-400 opacity-60" />
              <div className="space-y-5">
                {timelineNodes.map((node, i) => (
                  <div key={i} className="relative pl-16">
                    <div
                      className={`absolute left-2 top-2 w-9 h-9 rounded-full bg-white border-4 flex items-center justify-center font-black text-sm shadow-md z-10`}
                      style={{ borderColor: node.topNeed !== undefined ? NEED_COLORS_RGB[node.topNeed] : '#CBD5E1' }}
                    >
                      <span style={{ color: node.topNeed !== undefined ? NEED_COLORS_RGB[node.topNeed] : '#94A3B8' }}>{i + 1}</span>
                    </div>
                    <div className={`glass-card p-5 border ${node.conflict ? 'border-orange-200 bg-orange-50/30' : 'border-slate-200/60'}`}>
                      <div className="flex items-start justify-between mb-2 gap-4 flex-wrap">
                        <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                          {node.title}
                          {node.conflict && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold">
                              <AlertTriangle className="w-3 h-3" /> 检测到需求冲突
                            </span>
                          )}
                          {node.tone && node.tone !== '其他' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold">
                              情绪：{node.tone}
                            </span>
                          )}
                        </h4>
                        <span className="text-xs font-bold text-slate-500 font-mono flex-shrink-0">{node.date}</span>
                      </div>
                      <p className="text-slate-600 leading-relaxed text-sm">{node.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-20 text-center text-slate-400 text-sm">
              暂无记忆数据 — 去 Agent 页面开始对话吧，记忆将在这里自动累积
            </div>
          )}
        </motion.div>



        {/* 画像权重 + 演化折线图 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-12">
          {/* 画像雷达 */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-strong p-6 lg:p-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Brain className="w-5 h-5 text-violet-600" /> L3 · 身份画像（长期记忆）
                </h3>
                <p className="text-xs text-slate-500 mt-1">12 维需求权重经贝叶斯更新后的稳定值</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-violet-600 font-mono">{profile?.interaction_count || 0}</div>
                <div className="text-xs text-slate-400 font-bold">轮交互</div>
              </div>
            </div>
            <ReactECharts option={profileRadarOption} style={{ height: 340 }} notMerge />
          </motion.div>

          {/* 权重演化 */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-strong p-6 lg:p-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <LineChart className="w-5 h-5 text-sky-600" /> L4 · 势能演化轨迹
                </h3>
                <p className="text-xs text-slate-500 mt-1">Top 4 权重需求在对话序列中的激活波动</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-sky-600 font-mono">{filteredEntries.length}</div>
                <div className="text-xs text-slate-400 font-bold">条数据点</div>
              </div>
            </div>
            {filteredEntries.length > 0 ? (
              <ReactECharts option={lineChartOption} style={{ height: 340 }} notMerge />
            ) : (
              <div className="flex items-center justify-center h-80 text-slate-400 text-sm">
                暂无对话数据 — 去 Agent 页开始一段对话吧
              </div>
            )}
          </motion.div>
        </div>

        {/* 共现热力图 + 激活次数 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-12">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-strong p-6 lg:p-8">
            <h3 className="text-lg font-black text-slate-900 mb-1 flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-500" /> L5 · 需求共现矩阵
            </h3>
            <p className="text-xs text-slate-500 mb-4">哪些需求经常一起被激活？颜色越深 = 共现频率越高</p>
            {profile && profile.co_occurrence_matrix.some(r => r.some(v => v > 0)) ? (
              <ReactECharts option={heatmapOption} style={{ height: 380 }} notMerge />
            ) : (
              <div className="flex items-center justify-center h-80 text-slate-400 text-sm">
                共现矩阵尚为空，需要多轮对话积累
              </div>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-strong p-6 lg:p-8">
            <h3 className="text-lg font-black text-slate-900 mb-1 flex items-center gap-2">
              <Target className="w-5 h-5 text-indigo-600" /> 需求被激活次数排行
            </h3>
            <p className="text-xs text-slate-500 mb-4">每个需求维度被判定为 Top 需求的累计次数</p>
            {profile && profile.activation_counts.some(v => v > 0) ? (
              <ReactECharts option={activationBarOption} style={{ height: 380 }} notMerge />
            ) : (
              <div className="flex items-center justify-center h-80 text-slate-400 text-sm">
                累计激活数据尚为空
              </div>
            )}
          </motion.div>
        </div>

        {/* 前瞻意图 + 心智模型 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-12">
          {/* 前瞻意图 */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-strong p-6 lg:p-8">
            <h3 className="text-lg font-black text-slate-900 mb-1 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-600" /> L6 · 前瞻意图预测
            </h3>
            <p className="text-xs text-slate-500 mb-5">基于历史协同关系预测你接下来会关注的需求</p>
            {anticipatedNeeds.length > 0 ? (
              <div className="space-y-3">
                {anticipatedNeeds.map((id, i) => {
                  const weight = profile?.weights[id] || 0
                  return (
                    <div key={id} className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-br from-emerald-50/80 to-white border border-emerald-100 hover:border-emerald-200 transition-colors">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-white text-lg shadow-md" style={{ background: NEED_COLORS_RGB[id] }}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-900 text-sm">{NEED_NAMES[id]}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          第 {NEED_LAYERS[id] + 1} 层级 · 长期权重 {weight.toFixed(2)}
                        </div>
                      </div>
                      <div className="text-right">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-sm text-slate-400 py-16 text-center">尚无足够数据进行预测</div>
            )}
          </motion.div>

          {/* 心智模型 */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="glass-strong p-6 lg:p-8">
            <h3 className="text-lg font-black text-slate-900 mb-1 flex items-center gap-2">
              <Network className="w-5 h-5 text-amber-500" /> L5 · 心智冲突模式
            </h3>
            <p className="text-xs text-slate-500 mb-5">系统检测到的反复出现的需求矛盾/决策模式</p>
            {profile && profile.decision_patterns && profile.decision_patterns.length > 0 ? (
              <div className="space-y-3">
                {profile.decision_patterns.map((pattern: any, i: number) => (
                  <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-br from-amber-50/80 to-white border border-amber-100">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md">
                      <AlertTriangle className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-900 text-sm truncate">{pattern.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{pattern.evidence || '检测到的需求冲突模式'}</div>
                    </div>
                    <div className="flex-shrink-0">
                      <div className="text-xs font-bold text-amber-700 mb-1 text-right">强度</div>
                      <div className="w-20 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${Math.min(100, (pattern.strength || 0.3) * 100)}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-slate-400 leading-relaxed">
                尚未检测到稳定的冲突模式
                <br />
                <span className="text-xs">通常需要 10+ 轮对话才能识别第一组模式</span>
              </div>
            )}
          </motion.div>
        </div>

        {/* 贝叶斯更新说明 */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="max-w-4xl mx-auto">
          <div className="glass-strong p-8 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-100 text-violet-700 text-xs font-bold mb-4">
              <Brain className="w-3.5 h-3.5" /> 算法原理
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-3">贝叶斯权重更新 · 记忆衰减与强化</h3>
            <div className="text-sm text-slate-600 leading-relaxed max-w-2xl mx-auto font-mono bg-slate-50/60 p-5 rounded-2xl border border-slate-200">
              W(t+1) = W(t) × 0.9<span className="text-slate-400"> {`（衰减，长期不激活自然消退）`}</span>
              <br />
              + activation × learning_rate<span className="text-slate-400"> {`（新证据强化）`}</span>
              <br />
              <span className="text-xs text-slate-400 mt-3 block">learning_rate = max(0.08, 0.35 - 0.005 × interaction_count)</span>
            </div>
            <p className="text-xs text-slate-500 mt-4">
              前几轮对话权重快速定型，后续随交互微调。
              <br />记忆既不会被新对话完全覆盖，也不会僵化不变 —— 像真实的人类学习一样。
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
