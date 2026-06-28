// ============================================================
// DPU 分析面板 — 卡片式，作为右侧 sidebar
// ============================================================
import { useState } from 'react'
import { motion } from 'framer-motion'
import { NeedRadar, NeedBars } from './NeedRadar'
import { NEED_COLORS, type DpuAnalysisResult, type DpuTraceResult, type NeedLabPersona } from './types'
import { BarChart3, GitBranch, Shield, Zap, TrendingUp, Eye, EyeOff } from 'lucide-react'

interface Props {
  persona: NeedLabPersona
  analysis: DpuAnalysisResult | null
  trace: DpuTraceResult | null
  prevActivation: number[]
  showCompare: boolean
  onToggleCompare: () => void
}

type Tab = 'radar' | 'trace' | 'stats'

export function AnalysisPanel({ persona, analysis, trace, prevActivation, showCompare, onToggleCompare }: Props) {
  const [tab, setTab] = useState<Tab>('radar')
  const activation12 = analysis?.activation12 || new Array(12).fill(0)
  const hasData = analysis && analysis.top_needs.length > 0

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'radar', label: '雷达图', icon: <BarChart3 size={13} /> },
    { key: 'trace', label: '路径', icon: <GitBranch size={13} /> },
    { key: 'stats', label: '压制', icon: <Shield size={13} /> },
  ]

  return (
    <div className="rounded-2xl bg-white/70 backdrop-blur-sm border border-slate-200/60 shadow-lg shadow-slate-200/40 overflow-hidden">
      {/* 顶部标题栏 */}
      <div className="px-5 py-4 border-b border-slate-100/80 bg-gradient-to-r from-indigo-50/50 to-blue-50/30">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-md shadow-indigo-200">
              <Zap size={13} className="text-white" />
            </div>
            DPU 实时分析
          </h2>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-md shadow-emerald-200"></div>
          </div>
        </div>

        {/* 对比模式开关 - 放在顶部，不挡事 */}
        <button
          onClick={onToggleCompare}
          className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-all hover:scale-[1.01] active:scale-[0.99]"
          style={{
            background: showCompare
              ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(59, 130, 246, 0.08))'
              : 'rgba(248, 250, 252, 0.8)',
            borderColor: showCompare ? 'rgba(99, 102, 241, 0.3)' : 'rgba(226, 232, 240, 0.8)',
          }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all"
              style={{
                background: showCompare
                  ? 'linear-gradient(135deg, #6366f1, #3b82f6)'
                  : '#f1f5f9',
                boxShadow: showCompare
                  ? '0 2px 6px -2px rgba(99, 102, 241, 0.4)'
                  : 'none',
              }}
            >
              {showCompare
                ? <Eye size={14} className="text-white" />
                : <EyeOff size={14} className="text-slate-400" />
              }
            </div>
            <div className="text-left">
              <div className="text-[11px] font-bold" style={{ color: showCompare ? '#4f46e5' : '#94a3b8' }}>
                {showCompare ? '对比模式' : '对比模式'}
              </div>
              <div className="text-[9px] text-slate-400">
                {showCompare ? 'DPU + LLM vs 纯 LLM' : '点击开启对比'}
              </div>
            </div>
          </div>
          <div
            className="relative w-11 h-6 rounded-full transition-all flex-shrink-0"
            style={{
              background: showCompare
                ? 'linear-gradient(135deg, #6366f1, #3b82f6)'
                : '#e2e8f0',
              boxShadow: showCompare
                ? 'inset 0 1px 3px rgba(0,0,0,0.1), 0 1px 4px rgba(99, 102, 241, 0.3)'
                : 'inset 0 1px 3px rgba(0,0,0,0.06)',
            }}
          >
            <div
              className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all"
              style={{
                left: showCompare ? 'calc(100% - 22px)' : '2px',
              }}
            />
          </div>
        </button>
      </div>

      {/* 标签切换 */}
      <div className="px-4 pt-3 pb-3">
        <div className="flex gap-1 bg-gradient-to-r from-slate-50 to-slate-100/50 rounded-xl p-1 border border-slate-100">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex-1 py-2 rounded-lg border-none cursor-pointer text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all"
              style={{
                background: tab === t.key
                  ? 'linear-gradient(135deg, #6366f1, #3b82f6)'
                  : 'transparent',
                color: tab === t.key ? '#fff' : '#94a3b8',
                boxShadow: tab === t.key
                  ? '0 2px 8px -2px rgba(99, 102, 241, 0.4)'
                  : 'none',
              }}
            >{t.icon} {t.label}</button>
          ))}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="px-4 pb-5">
        {!hasData && (
          <div className="text-center py-12 text-slate-400 text-xs">
            <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center border border-slate-100">
              <Zap size={26} className="text-slate-300" />
            </div>
            <p className="text-slate-500 font-medium text-sm">发送消息后查看</p>
            <p className="text-slate-400 mt-1 text-xs">DPU 实时需求分析</p>
          </div>
        )}

        {hasData && tab === 'radar' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5">
            <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-50/60 to-blue-50/40 border border-indigo-100/60">
              <NeedRadar activation12={activation12} prevActivation={prevActivation} suppressed={analysis?.suppressed || []} height={280} />
            </div>
            <div>
              <div className="text-xs text-slate-600 font-bold mb-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-blue-500"></div>
                Top 5 需求激活
              </div>
              <NeedBars activation12={activation12} topN={5} />
            </div>
          </motion.div>
        )}

        {hasData && tab === 'trace' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3 text-xs">
            {trace?.nodes ? (
              <>
                <div className="text-xs text-slate-600 font-bold flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"></div>
                  根激活（{trace.root_nodes?.length || 0}个）
                </div>
                {trace.nodes.filter(n => n.node_type === 'root').map(n => (
                  <div key={n.need_id} className="p-3.5 rounded-xl bg-white border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-2.5">
                      <span className="w-3.5 h-3.5 rounded-full shadow-sm" style={{ background: NEED_COLORS[n.need_id] || '#6366f1' }} />
                      <span className="font-bold text-slate-700 text-sm">{n.need_name}</span>
                      <span className="ml-auto text-indigo-600 text-xs font-bold bg-indigo-50 px-2.5 py-1 rounded-lg">
                        {(n.value * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-2">{n.source}</div>
                  </div>
                ))}
                {trace.nodes.filter(n => n.node_type !== 'root').length > 0 && (
                  <>
                    <div className="text-xs text-slate-600 font-bold mt-2 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500"></div>
                      传导激活
                    </div>
                    {trace.nodes.filter(n => n.node_type !== 'root').map(n => (
                      <div key={`${n.need_id}-${n.layer}`} className="p-3 rounded-xl bg-slate-50/80 flex items-center gap-2.5 text-xs border border-slate-100">
                        <span className="text-slate-300 font-bold text-base">→</span>
                        <span className="font-semibold text-slate-600">{n.need_name}</span>
                        <span className="ml-auto text-[10px] text-slate-500 font-medium bg-white px-2.5 py-1 rounded-md border border-slate-100">
                          L{n.layer} · {(n.value*100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </>
            ) : <div className="text-slate-400 text-center py-10">暂无路径数据</div>}
            {(trace?.conflict_pairs?.length || 0) > 0 && (
              <div className="mt-2 p-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50/50 border border-amber-200/50">
                <div className="text-xs font-bold text-amber-700 mb-2.5 flex items-center gap-1.5">
                  ⚡ 需求冲突对
                </div>
                {trace?.conflict_pairs?.map((cp, i) => (
                  <div key={i} className="text-xs text-amber-700 py-1.5 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    {cp.need_a_name} ↔ {cp.need_b_name}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {hasData && tab === 'stats' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
            <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50/80 to-orange-50/40 border border-amber-100/60">
              <div className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                  <Shield size={12} className="text-white" />
                </div>
                层级压制
              </div>
              {(analysis?.suppressed || []).length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {(analysis?.suppressed || []).map(n => (
                    <span key={n} className="px-3 py-1.5 rounded-lg bg-white text-amber-700 text-[11px] font-bold border border-amber-200 shadow-sm">
                      ⬇ {n}
                    </span>
                  ))}
                </div>
              ) : <div className="text-xs text-slate-400 py-3 text-center">无层级压制</div>}
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100/50 border border-slate-200/60">
              <div className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-blue-500"></div>
                12 维激活值
              </div>
              <NeedBars activation12={activation12} topN={8} />
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
