import { motion } from 'framer-motion'
import { Layers, Calculator, Scale, BrainCircuit } from 'lucide-react'

const FEATURES = [
  {
    icon: Layers,
    title: '12 维需求体系 + 注意力矩阵',
    description:
      '从生理生存到自我实现，细化为 12 个可计算维度。v4.2 注意力加权动态矩阵随每次输入实时调整耦合强度——同时激活的需求自动增强关联。',
    color: 'from-red-400 to-red-600',
  },
  {
    icon: Calculator,
    title: 'LLM 语义 + DPU 数学双引擎',
    description:
      'LLM 做语义理解（不分语境不看表面字词），DPU 做数学计算（势能/耦合/压制/仲裁）。两者各司其职，三级对比管线验证效果。',
    color: 'from-blue-400 to-blue-600',
  },
  {
    icon: Scale,
    title: '智能压制 + 主动增益',
    description:
      'LLM 判定底层无忧时，上层需求自动获得 ×1.12 增益，底层低 intent 需求被削弱 ×0.85。仅生存层(D0/D1)可触发上层压制——不再是粗暴的层级优先。',
    color: 'from-violet-400 to-violet-600',
  },
  {
    icon: BrainCircuit,
    title: '贝叶斯画像 + 自适应学习',
    description:
      '贝叶斯权重更新 + 注意力矩阵共现学习。对话越多，个性化权重和矩阵耦合值越精准。支持自定义人格创建 + 共享记忆注入。',
    color: 'from-amber-400 to-amber-600',
  },
]

export function CoreFeatures() {
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
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 text-xs font-semibold text-blue-700 tracking-wider mb-6">
            CORE TECHNOLOGY · 核心技术
          </div>
          <h2 className="text-4xl sm:text-5xl font-black text-slate-900 mb-6 tracking-tight">
            从<span className="bg-gradient-to-r from-blue-500 to-indigo-700 bg-clip-text text-transparent">语言生成</span>
            <br />
            迈向<span className="bg-gradient-to-r from-blue-500 to-indigo-700 bg-clip-text text-transparent">价值计算</span>
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            通用大模型擅长「说漂亮话」，DPU 专注于「做对的事」。
            每一个决策都有公式、每一次排序都有依据。
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.6, delay: 0.1 * i }}
              whileHover={{ y: -4, scale: 1.01 }}
              className="group relative bg-white p-8 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow"
            >
              <div
                className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.color} shadow-md mb-6 group-hover:scale-110 transition-transform`}
              >
                <feature.icon className="w-7 h-7 text-white" />
              </div>

              <h3 className="text-2xl font-bold text-slate-900 mb-3">{feature.title}</h3>
              <p className="text-slate-600 leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
