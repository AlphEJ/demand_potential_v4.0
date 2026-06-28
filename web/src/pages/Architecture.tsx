import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import {
  Cpu,
  Network,
  Database,
  Brain,
  Sparkles,
  ArrowDown,
  Layers,
  Settings,
  Zap,
  Shield,
  Users,
  MessageSquare,
} from 'lucide-react'

const ARCH_MODULES = [
  {
    icon: Users,
    title: '用户输入层',
    subtitle: 'User Input Layer',
    description: '接收自然语言描述，支持文本输入、预设场景、对话历史导入。v4.2 新增人格沙盘交互和自定义人格创建。',
    features: ['自然语言文本', '人格沙盘对话', '自定义人格创建', '对话历史导入'],
    color: 'from-sky-400 to-sky-600',
  },
  {
    icon: Cpu,
    title: '需求解析引擎',
    subtitle: 'Demand Parser — v4.2 升级',
    description: '三级级联解析管线：LLM 语义理解 → 向量语义匹配 → 关键词检索。自动选择最优路径。',
    features: ['LLM 语义解析', 'TF-IDF 向量匹配', 'sentence-transformers', '关键词检索降级'],
    color: 'from-blue-400 to-blue-600',
  },
  {
    icon: Brain,
    title: '势能计算核心',
    subtitle: 'Potential Calculator — v4.2 升级',
    description: '注意力加权动态矩阵替代静态 12×12 矩阵。LLM 模式下动态调节权重分配（w1=0.12），让 LLM 判断主导计算。',
    features: ['注意力加权矩阵', '动态权重调节', '4 步势能计算', '可解释输出'],
    color: 'from-indigo-400 to-indigo-600',
  },
  {
    icon: Network,
    title: '冲突仲裁器',
    subtitle: 'Conflict Arbiter — v4.2 升级',
    description: 'LLM 模式下势能优先排序（非层级优先）。仅生存层(D0/D1)可触发压制。上层需求在生存无忧时获得主动增益。',
    features: ['势能优先排序', '生存层压制', '上层需求增益 ×1.12', '可切换模式'],
    color: 'from-violet-400 to-violet-600',
  },
  {
    icon: Database,
    title: '用户画像引擎',
    subtitle: 'User Profiler',
    description: '贝叶斯权重更新 + 注意力矩阵自适应学习。对话越多，个性化权重和矩阵耦合值越精准。',
    features: ['贝叶斯权重更新', '注意力矩阵学习', '交互历史追踪', '个性化画像'],
    color: 'from-emerald-400 to-emerald-600',
  },
  {
    icon: MessageSquare,
    title: '输出与集成',
    subtitle: 'Output & Integration',
    description: '三级对比可视化（关键词基线/DPU引擎/LLM+DPU）。可独立运行，也可作为 LLM 的决策增强模块集成。',
    features: ['三级对比分析', '可视化雷达图', '推理路径追踪', 'REST API'],
    color: 'from-amber-400 to-amber-600',
  },
]

const TECH_SPECS = [
  { label: '核心语言', value: 'Python 3.10+' },
  { label: '前端框架', value: 'React + TypeScript' },
  { label: '向量匹配', value: 'TF-IDF / FAISS' },
  { label: 'LLM 集成', value: '通义千问 / DeepSeek' },
  { label: '运行环境', value: 'CPU 即可 / 零 GPU' },
  { label: '响应延迟', value: '< 10ms 纯算法' },
  { label: '矩阵类型', value: '注意力加权动态' },
  { label: '模型依赖', value: '零强制 / 可选接入' },
]

export function ArchitecturePage() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })

  return (
    <div className="min-h-screen pt-32 pb-24">
      <div className="max-w-7xl mx-auto px-6">
        {/* 标题 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-card text-xs font-semibold text-brand-500 tracking-wider mb-6">
            <Layers className="w-3.5 h-3.5" />
            SYSTEM ARCHITECTURE · 系统架构
          </div>
          <h1 className="text-5xl font-black text-slate-900 mb-6 tracking-tight text-balance">
            6 层<span className="brand-gradient">模块化架构</span>
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto text-balance">
            从输入解析到决策输出，每一层都是独立可替换的模块。
            既可以独立运行，也可以作为 LLM Agent 的决策增强组件。
          </p>
        </motion.div>

        {/* 架构流程图 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-20"
        >
          <div className="glass-strong p-8 lg:p-12">
            <div className="grid grid-cols-1 gap-4 lg:gap-6">
              {ARCH_MODULES.map((mod, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.1 }}
                  className="relative"
                >
                  <div className="glass-card p-6 lg:p-8 hover:scale-[1.01] transition-transform">
                    <div className="grid lg:grid-cols-[120px_1fr_1fr] gap-6 items-center">
                      {/* 图标 */}
                      <div className="flex items-center justify-center lg:justify-start">
                        <div
                          className={`w-20 h-20 rounded-3xl bg-gradient-to-br ${mod.color} flex items-center justify-center soft-shadow`}
                        >
                          <mod.icon className="w-10 h-10 text-white" />
                        </div>
                      </div>

                      {/* 标题和说明 */}
                      <div>
                        <div className="text-xs font-bold text-brand-500 tracking-wider mb-1">
                          MODULE {String(i + 1).padStart(2, '0')} · {mod.subtitle}
                        </div>
                        <h3 className="text-2xl font-bold text-slate-900 mb-3">{mod.title}</h3>
                        <p className="text-slate-600 leading-relaxed">{mod.description}</p>
                      </div>

                      {/* 特性 */}
                      <div className="grid grid-cols-2 gap-2">
                        {mod.features.map((f, j) => (
                          <div
                            key={j}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 text-sm font-medium text-slate-700"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-brand-500" />
                            {f}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 箭头 */}
                  {i < ARCH_MODULES.length - 1 && (
                    <div className="flex items-center justify-center my-1">
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 + i * 0.1 }}
                        className="text-brand-500"
                      >
                        <ArrowDown className="w-6 h-6" />
                      </motion.div>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* 技术规格 */}
        <div ref={ref} className="mb-20">
          <h2 className="text-3xl font-black text-slate-900 mb-10 text-center">技术规格</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {TECH_SPECS.map((spec, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.05 * i }}
                whileHover={{ y: -4 }}
                className="glass-card p-6 text-center"
              >
                <div className="text-xs font-bold text-slate-400 tracking-wider mb-2 uppercase">
                  {spec.label}
                </div>
                <div className="text-lg font-bold text-slate-900">{spec.value}</div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* 设计原则 */}
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: Zap,
              title: '双模式架构',
              desc: '纯 DPU 数学引擎（离线毫秒级）和 LLM+DPU 完整管线（语义增强）自由切换。适应不同部署场景。',
            },
            {
              icon: Shield,
              title: '完全可解释 + 可追溯',
              desc: '每个决策都有公式支撑，每条传导路径可通过 PathTracer 追溯。v4.2 注意力矩阵更让关联度有据可循。',
            },
            {
              icon: Settings,
              title: '动态自适应',
              desc: '注意力加权矩阵随输入实时调整耦合强度。贝叶斯画像随交互持续学习。LLM 模式下权重自动优化。',
            },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i }}
              className="glass-strong p-8 text-center"
            >
              <div className="w-14 h-14 rounded-2xl brand-gradient-bg flex items-center justify-center mx-auto mb-5 soft-shadow">
                <item.icon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">{item.title}</h3>
              <p className="text-slate-600 text-sm leading-relaxed">{item.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* v4.2 技术演进路线 */}
        <div className="mt-20">
          <h2 className="text-3xl font-black text-slate-900 mb-10 text-center">v4.2 技术演进路线</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                phase: '已实现',
                items: [
                  '注意力加权动态矩阵（替代静态 12×12）',
                  'LLM 直出模式（跳过关键词管道）',
                  '三级对比分析管线',
                  '势能优先排序 + 生存层压制',
                  '上层需求主动增益 ×1.12',
                  'LLM 模式动态权重调节',
                  '自定义人格创建 + 共享记忆注入',
                ],
                color: 'from-emerald-500 to-green-500',
              },
              {
                phase: '规划中',
                items: [
                  '图神经网络多阶传播矩阵',
                  '大规模对话数据共现 bootstrap',
                  '跨领域需求维度迁移框架',
                  '具身智能场景适配（机器人）',
                  '多维场景乘数动态压制',
                  '实时注意力可视化面板',
                ],
                color: 'from-amber-400 to-orange-500',
              },
            ].map((col, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * i }}
                className="glass-card p-8"
              >
                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r ${col.color} bg-clip-text text-transparent text-xs font-bold mb-6`}>
                  <span className="text-white bg-gradient-to-r ${col.color} px-3 py-1 rounded-full">{col.phase}</span>
                </div>
                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r ${col.color} text-white text-xs font-bold mb-6`}>
                  {col.phase}
                </div>
                <ul className="space-y-3">
                  {col.items.map((item, j) => (
                    <li key={j} className="flex items-start gap-3 text-sm text-slate-700">
                      <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-brand-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
