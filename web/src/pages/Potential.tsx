import { useEffect, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles, Calculator, X, ChevronRight, ChevronLeft, Lightbulb, Target, Users, BookOpen, Shield, Zap } from 'lucide-react'
import { NEEDS, LAYER_COLORS, NEED_COLORS } from '../data/needs'
import type { NeedMeta } from '../types'

export function PotentialPage() {
  const [selectedNeed, setSelectedNeed] = useState<NeedMeta | null>(null)

  const openNeed = useCallback((need: NeedMeta) => {
    setSelectedNeed(need)
    // 聚焦抽屉以支持键盘操作
    setTimeout(() => {
      const el = document.getElementById('need-drawer')
      el?.focus()
    }, 100)
  }, [])

  const closeDrawer = useCallback(() => {
    setSelectedNeed(null)
  }, [])

  // Esc 键关闭 / 左右方向键切换
  useEffect(() => {
    if (!selectedNeed) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDrawer()
        return
      }
      if (e.key === 'ArrowRight') {
        const next = NEEDS[(selectedNeed.id + 1) % NEEDS.length]
        setSelectedNeed(next)
      }
      if (e.key === 'ArrowLeft') {
        const prev = NEEDS[(selectedNeed.id - 1 + NEEDS.length) % NEEDS.length]
        setSelectedNeed(prev)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedNeed, closeDrawer])

  const currentIdx = selectedNeed ? selectedNeed.id : 0
  // 抽屉主题色用每个需求独立的颜色，避免同层卡片都是同一个紫色
  const themeColor = selectedNeed
    ? NEED_COLORS[selectedNeed.id] || LAYER_COLORS[selectedNeed.layer]
    : '#6366F1'

  return (
    <div className="min-h-screen pt-32 pb-24 bg-gradient-to-b from-white via-slate-50 to-blue-50/30">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 text-xs font-bold text-blue-700 tracking-wider mb-6">
            <Calculator className="w-3.5 h-3.5" />
            POTENTIAL CALCULATION · 势能计算
          </div>
          <h1 className="text-5xl font-black text-slate-900 mb-6 tracking-tight">
            从<span className="bg-gradient-to-r from-blue-500 to-indigo-700 bg-clip-text text-transparent">感觉重要</span>
            <br />
            到<span className="bg-gradient-to-r from-blue-500 to-indigo-700 bg-clip-text text-transparent">数学重要</span>
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            12维需求体系 × 4步势能计算公式 —— 将模糊的人类诉求，转化为可量化、可追溯、可解释的优先级排序。
          </p>
        </motion.div>

        {/* 12 维需求卡片网格 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-20"
        >
          <h2 className="text-3xl font-black text-slate-900 mb-3">12 维需求定义</h2>
          <p className="text-slate-600 mb-10">每个需求维度都有独立的层级权重。点击卡片查看完整说明。</p>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {NEEDS.map((need, i) => {
              // 用每个需求独立的颜色，而不是层级的颜色
              const color = NEED_COLORS[i] || LAYER_COLORS[need.layer]
              return (
                <motion.button
                  key={need.id}
                  type="button"
                  onClick={() => openNeed(need)}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.02 * i }}
                  whileHover={{ y: -4, scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                  tabIndex={0}
                  aria-label={`查看${need.name}的详细定义`}
                  className="group relative bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-center hover:shadow-lg transition-all outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={{ ['--card-color' as string]: color }}
                >
                  {/* hover 发光 */}
                  <span
                    className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10 blur-xl"
                    style={{ background: `radial-gradient(circle at 50% 50%, ${color}40, transparent 70%)` }}
                  />

                  {/* focus-visible ring */}
                  <span
                    className="pointer-events-none absolute inset-0 rounded-2xl ring-offset-2 transition-all"
                    style={{
                      boxShadow: 'var(--tw-ring-shadow, 0 0 #0000)',
                    }}
                  />

                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-sm mx-auto mb-3 group-hover:shadow-md transition-shadow"
                    style={{ background: `linear-gradient(135deg, ${color}cc, ${color})` }}
                  >
                    D{need.id + 1}
                  </div>
                  <div className="font-bold text-slate-900 mb-1">{need.name}</div>
                  <div className="text-xs text-slate-500 font-semibold mb-3">{need.name_en}</div>
                  <div className="text-2xl font-black text-slate-800 font-mono">{need.level_weight.toFixed(2)}</div>

                  {/* 点击提示 */}
                  <div className="mt-3 text-[11px] font-semibold text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    点击查看详情 →
                  </div>
                </motion.button>
              )
            })}
          </div>
        </motion.div>

        {/* 4 步计算公式 */}
        <div className="mb-20">
          <h2 className="text-3xl font-black text-slate-900 mb-3">4 步势能计算公式</h2>
          <p className="text-slate-600 mb-10">从原始输入到最终排序的完整计算过程</p>

          <div className="space-y-6">
            {[
              { step: '01', title: '意图门控 · Intent Gate', formula: 'if Intent < 0.3 → 需求被过滤', desc: '当一个需求的意图得分低于阈值时，系统判定该需求未被真正表达，排除在后续计算之外。' },
              { step: '02', title: '基础势能 · Base Potential', formula: 'P_base = LevelWeight × (w₂×E×I + w₃×(1-R) + w₄×Intent) + w₁×Level', desc: '核心公式：结合层级权重、紧急度 E、重要度 I、资源依赖度 R 和意图强度，计算每个需求的基础势能值。' },
              { step: '03', title: '注意力耦合 · Attention Coupling (v4.2)', formula: 'P_couple = P_base × max(0.1, 1 + ΣC_attn - ΣExcl)\nC_attn(i,j) = C_base(i,j) × (1 + α × √(a_i×a_j))', desc: 'v4.2 注意力加权矩阵：两个需求同时高激活时，关联度自动增强（如情感+尊重共激活 → +42%）。替代原有静态 12×12 矩阵。' },
              { step: '04', title: '最终排序 · Final Ranking', formula: 'P_final = max(0, P_couple × Decay × (1 - Load) + Wait × ΔP)', desc: '应用自然衰减因子、系统负载因子和等待时长补偿，确保长期被忽视的需求有机会获得关注——防止「重要但不紧急」的需求永远被压制。' },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ delay: 0.1 * i }}
                className="bg-white rounded-3xl p-8 shadow-lg border border-slate-100"
              >
                <div className="grid md:grid-cols-[auto_1fr] gap-8 items-start">
                  <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-700 flex items-center justify-center shadow-sm flex-shrink-0">
                    <span className="text-3xl font-black text-white">{item.step}</span>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 mb-2">{item.title}</h3>
                    <div className="bg-slate-900 text-blue-100 font-mono text-sm p-5 rounded-2xl mb-4 overflow-x-auto">
                      {item.formula}
                    </div>
                    <p className="text-slate-600 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* 层级压制机制 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          className="bg-white rounded-3xl p-10 shadow-lg border border-slate-100"
        >
          <h2 className="text-3xl font-black text-slate-900 mb-3 flex items-center gap-3">
            <Sparkles className="w-7 h-7 text-blue-500" />
            层级压制机制
          </h2>
          <p className="text-slate-600 mb-8">
            当底层需求（生理/安全）平均激活度超过 0.7 时，高层需求会被适度压制——符合马斯洛需求金字塔的心理学规律。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            {[
              { layer: '生理层', factor: '×1.00', desc: '生存必需品：食物、水、睡眠', color: LAYER_COLORS.PHYSIOLOGICAL },
              { layer: '安全层', factor: '×0.95', desc: '安全、稳定、财务保障', color: LAYER_COLORS.SAFETY },
              { layer: '社交层', factor: '×0.60', desc: '归属、友谊、社群', color: LAYER_COLORS.SOCIAL },
              { layer: '情感层', factor: '×0.58', desc: '爱、亲密关系、陪伴', color: LAYER_COLORS.SOCIAL },
              { layer: '尊重层', factor: '×0.55', desc: '认可、尊重、成就感', color: LAYER_COLORS.ESTEEM },
              { layer: '自我实现', factor: '×0.40', desc: '成长、梦想、意义感', color: LAYER_COLORS.SELF_ACTUALIZATION },
            ].map((item, i) => (
              <div key={i} className="bg-slate-50 rounded-2xl p-5 text-center">
                <div
                  className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold text-white mb-2"
                  style={{ background: item.color }}
                >
                  L{i}
                </div>
                <div className="font-bold text-slate-900 mb-2">{item.layer}</div>
                <div className="text-2xl font-black font-mono mb-2" style={{ color: item.color }}>
                  {item.factor}
                </div>
                <div className="text-xs text-slate-500 leading-relaxed">{item.desc}</div>
              </div>
            ))}
          </div>

          <div className="mt-8 p-6 bg-blue-50 rounded-2xl">
            <p className="text-sm text-slate-700 leading-relaxed">
              <span className="font-bold text-blue-700">设计原则：</span>
              当人处于饥饿、恐惧等底层需求强烈状态时，高层次的追求（梦想、审美、自我实现）
              会被暂时压制——这不是"缺乏理想"，而是大脑的资源优先配置机制。
              DPU 尊重这一心理学规律，确保 AI 的优先级判断与真实人类决策模式一致。
            </p>
          </div>
        </motion.div>
      </div>

      {/* 右侧抽屉 */}
      <AnimatePresence>
        {selectedNeed && (
          <>
            {/* 遮罩 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeDrawer}
              className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm"
              aria-hidden="true"
            />
            {/* 抽屉本体 */}
            <motion.aside
              id="need-drawer"
              role="dialog"
              aria-label={`${selectedNeed.name} 需求详情`}
              tabIndex={-1}
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 z-50 h-screen w-full sm:w-[560px] lg:w-[620px] bg-white shadow-2xl overflow-y-auto focus:outline-none border-l border-slate-100"
            >
              <DrawerContent
                need={selectedNeed}
                currentIdx={currentIdx}
                themeColor={themeColor}
                onClose={closeDrawer}
                onPrev={() => {
                  const prev = NEEDS[(currentIdx - 1 + NEEDS.length) % NEEDS.length]
                  setSelectedNeed(prev)
                }}
                onNext={() => {
                  const next = NEEDS[(currentIdx + 1) % NEEDS.length]
                  setSelectedNeed(next)
                }}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

interface DrawerContentProps {
  need: NeedMeta
  currentIdx: number
  themeColor: string
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}

function DrawerContent({ need, currentIdx, themeColor, onClose, onPrev, onNext }: DrawerContentProps) {
  return (
    <div className="min-h-full flex flex-col">
      {/* 顶部渐变头部 */}
      <div
        className="relative px-8 pt-10 pb-12 text-white overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${themeColor}ee, ${themeColor})` }}
      >
        {/* 装饰光晕 */}
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 -left-10 w-52 h-52 rounded-full bg-white/10 blur-3xl pointer-events-none" />

        {/* 关闭按钮 */}
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭详情"
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 transition-colors flex items-center justify-center text-white"
        >
          <X className="w-5 h-5" />
        </button>

        {/* D 标签 */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/20 text-3xl font-black mb-4 shadow-lg">
          D{need.id + 1}
        </div>

        <div className="text-sm font-semibold text-white/75 mb-2">{need.name_en}</div>
        <h2 className="text-4xl font-black mb-3 leading-tight">{need.name}</h2>
        <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-white/20 text-sm font-semibold">
          <span className="uppercase tracking-wider text-[10px] opacity-80">层级权重</span>
          <span className="font-mono text-lg">{need.level_weight.toFixed(2)}</span>
        </div>

        {/* 导航 */}
        <div className="absolute bottom-4 right-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onPrev}
            aria-label="上一个需求"
            className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 transition-colors flex items-center justify-center"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-semibold opacity-80 font-mono">
            {String(currentIdx + 1).padStart(2, '0')} / {String(NEEDS.length).padStart(2, '0')}
          </span>
          <button
            type="button"
            onClick={onNext}
            aria-label="下一个需求"
            className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 transition-colors flex items-center justify-center"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 px-8 py-10 space-y-10 bg-gradient-to-b from-white to-slate-50">
        {/* 详细定义 */}
        <section>
          <h3 className="flex items-center gap-2 text-lg font-black text-slate-900 mb-3">
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
              style={{ background: themeColor }}
            >
              <BookOpen className="w-3.5 h-3.5" />
            </span>
            详细定义
          </h3>
          <p className="text-slate-600 leading-relaxed">{need.long_description || need.description}</p>
        </section>

        {/* 常见触发场景 */}
        <section>
          <h3 className="flex items-center gap-2 text-lg font-black text-slate-900 mb-3">
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
              style={{ background: themeColor }}
            >
              <Lightbulb className="w-3.5 h-3.5" />
            </span>
            常见触发场景
          </h3>
          <ul className="space-y-2.5">
            {(need.scenarios || []).map((s, i) => (
              <li key={i} className="flex gap-3 items-start">
                <span
                  className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full"
                  style={{ background: themeColor }}
                />
                <span className="text-slate-600 leading-relaxed">{s}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 典型关键词 */}
        <section>
          <h3 className="flex items-center gap-2 text-lg font-black text-slate-900 mb-3">
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
              style={{ background: themeColor }}
            >
              <Target className="w-3.5 h-3.5" />
            </span>
            典型关键词 · 触发信号
          </h3>
          <div className="flex flex-wrap gap-2">
            {(need.signal_keywords || []).map((kw, i) => (
              <span
                key={i}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold border"
                style={{
                  color: themeColor,
                  borderColor: `${themeColor}33`,
                  background: `${themeColor}0d`,
                }}
              >
                {kw}
              </span>
            ))}
          </div>
        </section>

        {/* 与其他需求的关系 */}
        <section>
          <h3 className="flex items-center gap-2 text-lg font-black text-slate-900 mb-3">
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
              style={{ background: themeColor }}
            >
              <Users className="w-3.5 h-3.5" />
            </span>
            与其他需求的关系
          </h3>
          <ul className="space-y-2.5">
            {(need.relations || []).map((r, i) => (
              <li key={i} className="flex gap-3 items-start">
                <span
                  className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full"
                  style={{ background: themeColor }}
                />
                <span className="text-slate-600 leading-relaxed">{r}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 信号图谱 */}
        {need.signals && (need.signals.satisfied.length || need.signals.ignored.length || need.signals.enforced.length) && (
          <section>
            <h3 className="flex items-center gap-2 text-lg font-black text-slate-900 mb-4">
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
                style={{ background: themeColor }}
              >
                <Zap className="w-3.5 h-3.5" />
              </span>
              信号图谱
            </h3>
            <div className="grid gap-3">
              {need.signals.satisfied.length > 0 && (
                <div className="p-4 rounded-2xl border border-emerald-100 bg-emerald-50/60">
                  <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2">✓ 被满足的信号</div>
                  <div className="text-sm text-slate-600 leading-relaxed">{need.signals.satisfied.join('；')}</div>
                </div>
              )}
              {need.signals.ignored.length > 0 && (
                <div className="p-4 rounded-2xl border border-amber-100 bg-amber-50/60">
                  <div className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2">⚠ 被忽视的信号</div>
                  <div className="text-sm text-slate-600 leading-relaxed">{need.signals.ignored.join('；')}</div>
                </div>
              )}
              {need.signals.enforced.length > 0 && (
                <div className="p-4 rounded-2xl border border-rose-100 bg-rose-50/60">
                  <div className="text-xs font-bold text-rose-700 uppercase tracking-wider mb-2">⚡ 被强化的信号</div>
                  <div className="text-sm text-slate-600 leading-relaxed">{need.signals.enforced.join('；')}</div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* 真实案例 */}
        {need.real_cases && need.real_cases.length > 0 && (
          <section>
            <h3 className="flex items-center gap-2 text-lg font-black text-slate-900 mb-3">
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
                style={{ background: themeColor }}
              >
                <Shield className="w-3.5 h-3.5" />
              </span>
              真实案例 · 对照参考
            </h3>
            <div className="space-y-3">
              {need.real_cases.map((c, i) => (
                <div
                  key={i}
                  className="p-4 rounded-2xl bg-slate-900 text-slate-100"
                >
                  <div className="text-sm leading-relaxed font-mono">{c}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 防御表达（表层 vs 内层） */}
        {need.defense_patterns && need.defense_patterns.length > 0 && (
          <section>
            <h3 className="flex items-center gap-2 text-lg font-black text-slate-900 mb-4">
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
                style={{ background: themeColor }}
              >
                <Zap className="w-3.5 h-3.5" />
              </span>
              防御表达 · 「她说了A，其实要的是B」
            </h3>
            <div className="space-y-3">
              {need.defense_patterns.map((dp, i) => (
                <div
                  key={i}
                  className="p-4 rounded-2xl border border-slate-100 bg-white shadow-sm"
                >
                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 items-start">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 pt-0.5">表层</span>
                    <div className="text-sm text-slate-700 font-semibold">「{dp.surface}」</div>
                    <span className="text-[10px] font-bold uppercase tracking-wider pt-0.5" style={{ color: themeColor }}>内层</span>
                    <div className="text-sm text-slate-800 leading-relaxed">{dp.hidden}</div>
                    {dp.example && (
                      <>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 pt-0.5">说明</span>
                        <div className="text-xs text-slate-500 leading-relaxed italic">{dp.example}</div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="sticky bottom-0 z-10 bg-white/80 backdrop-blur border-t border-slate-100 px-8 py-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onPrev}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> 上一个
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: themeColor }}
          >
            关闭详情
          </button>
          <button
            type="button"
            onClick={onNext}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition-colors"
          >
            下一个 <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default PotentialPage
