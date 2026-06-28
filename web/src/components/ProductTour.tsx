import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Users, Brain, Bot, Search, Crown, Settings } from 'lucide-react'

const PAGES = [
  {
    icon: Users,
    title: '人格沙盘',
    path: '/needlab',
    desc: '选择或创建人格，与 AI 角色对话，实时观察 DPU 引擎对 12 维需求的动态分析——雷达图、路径追踪、层级压制一目了然。',
    color: 'from-indigo-500 to-blue-600',
    tag: '核心体验',
  },
  {
    icon: Brain,
    title: '智能理解',
    path: '/understand',
    desc: '同一段话，三种分析方式（纯关键词 → DPU引擎 → LLM+DPU），逐级对比，直观感受从"子串扫描"到"语义理解"的精度跃升。',
    color: 'from-violet-500 to-purple-600',
    tag: '三级对比',
  },
  {
    icon: Bot,
    title: '智能体',
    path: '/agent',
    desc: 'DPU 驱动的 AI 对话 Agent。每轮对话自动触发需求势能分析，生成诊断报告，记录贝叶斯画像更新。对话越多，越懂你。',
    color: 'from-emerald-500 to-teal-600',
    tag: 'Agent',
  },
  {
    icon: Search,
    title: '需求洞察',
    path: '/insight',
    desc: '从聊天记录中提取多个角色，分析每个角色的需求分布、情绪底色和社交策略。支持截图提取对话，一键生成动机分析报告。',
    color: 'from-rose-500 to-pink-600',
    tag: '深度分析',
  },
  {
    icon: Crown,
    title: '装逼检测',
    path: '/showoff',
    desc: '粘贴对话 → 自动识别装逼信号 → 量化装逼指数 → 推断 8 种装逼人格类型。AI 深度解析社交货币流向，支持 PDF 报告导出。',
    color: 'from-amber-500 to-orange-600',
    tag: '亮点功能',
  },
]

export function ProductTour() {
  return (
    <section className="py-24 relative">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-50 text-xs font-semibold text-purple-700 tracking-wider mb-6">
            PRODUCT TOUR · 功能导览
          </div>
          <h2 className="text-4xl sm:text-5xl font-black text-slate-900 mb-6 tracking-tight">
            五个页面，覆盖
            <span className="bg-gradient-to-r from-purple-500 to-pink-600 bg-clip-text text-transparent">需求分析</span>
            全流程
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            从人格沙盘的实时交互到装逼检测的深度报告，每个页面都展示 DPU 引擎的不同能力面。
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {PAGES.map((page, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.5, delay: 0.08 * i }}
            >
              <Link to={page.path}>
                <motion.div
                  whileHover={{ y: -4, scale: 1.02 }}
                  className="group relative bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-lg hover:border-slate-200 transition-all h-full flex flex-col"
                >
                  {/* Tag + Icon */}
                  <div className="flex items-center justify-between mb-4">
                    <div className={`inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br ${page.color} shadow-md group-hover:scale-110 transition-transform`}>
                      <page.icon className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-100">
                      {page.tag}
                    </span>
                  </div>

                  <h3 className="text-lg font-black text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors">
                    {page.title}
                  </h3>
                  <p className="text-sm text-slate-500 leading-relaxed flex-1">
                    {page.desc}
                  </p>

                  {/* 底部箭头 */}
                  <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-400 group-hover:text-indigo-500 transition-colors">
                      点击进入 →
                    </span>
                  </div>
                </motion.div>
              </Link>
            </motion.div>
          ))}

          {/* 第六个卡片：模型配置提示 */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <Link to="/models">
              <motion.div
                whileHover={{ y: -4, scale: 1.02 }}
                className="group relative bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-lg hover:border-slate-200 transition-all h-full flex flex-col"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-md group-hover:scale-110 transition-transform">
                    <Settings className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-100">
                    建议配置
                  </span>
                </div>

                <h3 className="text-lg font-black text-slate-900 mb-2 group-hover:text-amber-600 transition-colors">
                  ⚡ 模型配置
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed flex-1">
                  为了完整体验 LLM+DPU 模式，建议先填写 API Key。支持通义千问、DeepSeek、Ollama——LLM 不可用时自动降级到纯 DPU 算法。
                </p>

                <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400 group-hover:text-amber-500 transition-colors">
                    点击进入 →
                  </span>
                  <span className="text-[9px] text-slate-300">推荐通义千问</span>
                </div>
              </motion.div>
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
