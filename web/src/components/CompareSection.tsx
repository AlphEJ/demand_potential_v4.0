import { motion } from 'framer-motion'
import { Brain, Target } from 'lucide-react'

const COMPARE_ROWS = [
  {
    label: '核心范式',
    llm: '语言生成',
    llmDetail: '基于概率的文字预测，输出流畅但黑盒',
    dpu: '价值计算',
    dpuDetail: '基于规则的需求量化，过程透明可解释',
  },
  {
    label: '价值判断',
    llm: '训练数据中的多数共识',
    llmDetail: '缺乏稳定的价值标准，容易被引导',
    dpu: '马斯洛层级 + 注意力加权矩阵',
    dpuDetail: 'v4.2 注意力矩阵随输入动态调节耦合强度',
  },
  {
    label: '冲突处理',
    llm: '都重要 / 折中建议',
    llmDetail: '逃避决策，给出模棱两可的答案',
    dpu: '明确优先级排序',
    dpuDetail: '敢于做选择，压制标记清晰可见',
  },
  {
    label: '可解释性',
    llm: '注意力权重不可读',
    llmDetail: '无法回答为什么给出这个答案',
    dpu: '公式 + PathTracer 推理路径',
    dpuDetail: '每步计算可追溯，PathTracer 可视化传导链',
  },
  {
    label: '计算成本',
    llm: 'GPU 推理 / 高延迟',
    llmDetail: '每次调用消耗算力，成本不可控',
    dpu: '纯本地算法 / 毫秒级',
    dpuDetail: 'CPU 即可运行，零外部 API 依赖',
  },
  {
    label: '离线运行',
    llm: '需网络或大型模型',
    llmDetail: '断网即失效，本地部署需大量显存',
    dpu: '完全本地化',
    dpuDetail: '轻量级算法，任何设备均可运行',
  },
  {
    label: '动态画像',
    llm: '依赖 Prompt Engineering',
    llmDetail: '难以持续学习和积累用户偏好',
    dpu: '内置画像引擎',
    dpuDetail: '交互越多越懂你，贝叶斯权重更新',
  },
]

export function CompareSection() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-50 text-xs font-semibold text-amber-700 tracking-wider mb-6">
            WHY DPU · 为什么需要 DPU
          </div>
          <h2 className="text-4xl sm:text-5xl font-black text-slate-900 mb-6 tracking-tight">
            不是比谁「说得好」
            <br />
            而是比谁「<span className="bg-gradient-to-r from-blue-500 to-indigo-700 bg-clip-text text-transparent">想得对</span>」
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            在 Agent 调度、情感陪伴、NPC 决策等真实场景中，
            可解释的价值判断远比流畅的话术重要。
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="bg-white rounded-3xl overflow-hidden shadow-lg border border-slate-100"
        >
          <div className="grid grid-cols-2 bg-slate-900 text-white">
            <div className="p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
                  <Brain className="w-5 h-5 text-slate-300" />
                </div>
                <div>
                  <div className="text-lg font-bold">通用大模型</div>
                  <div className="text-xs text-slate-400 font-medium">LLM · 语言模型</div>
                </div>
              </div>
            </div>
            <div className="p-6 sm:p-8 relative bg-gradient-to-br from-blue-600 to-indigo-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                  <Target className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-lg font-bold">DPU 引擎</div>
                  <div className="text-xs text-blue-100 font-medium">Demand Processing Unit</div>
                </div>
              </div>
            </div>
          </div>

          {COMPARE_ROWS.map((row, i) => (
            <div
              key={i}
              className={`grid grid-cols-2 border-t border-slate-100 ${
                i === COMPARE_ROWS.length - 1 ? '' : ''
              }`}
            >
              <div className="p-5 sm:p-6 border-r border-slate-100">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  {row.label}
                </div>
                <div className="font-bold text-slate-700 mb-2">{row.llm}</div>
                <div className="text-sm text-slate-500 leading-relaxed">{row.llmDetail}</div>
              </div>
              <div className="p-5 sm:p-6 bg-blue-50/30">
                <div className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">
                  {row.label}
                </div>
                <div className="font-bold text-slate-900 mb-2">{row.dpu}</div>
                <div className="text-sm text-slate-600 leading-relaxed">{row.dpuDetail}</div>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
