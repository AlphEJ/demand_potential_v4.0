import { motion } from 'framer-motion'
import { Gamepad2, MessageCircleHeart, Bot } from 'lucide-react'

const SCENES = [
  {
    icon: Gamepad2,
    title: '游戏 NPC 智能决策',
    subtitle: 'Dynamic NPC · 生存模拟 · 沙盒世界',
    description:
      '让游戏角色拥有真实需求：饿了会吃饭、危险会逃跑、无聊会社交、目标驱动行为。告别机械的状态机 AI，实现真正有动机的智能体。',
    gradient: 'from-violet-500 via-purple-500 to-indigo-500',
  },
  {
    icon: MessageCircleHeart,
    title: '智能客服 / 情感陪伴',
    subtitle: '情绪识别 · 价值对齐 · 共情回复',
    description:
      '用户说「我累了想辞职」，系统识别出安全稳定与自由掌控的冲突，给出符合马斯洛层级的安慰与建议，而不是空洞的话术。',
    gradient: 'from-emerald-500 via-teal-500 to-cyan-500',
  },
  {
    icon: Bot,
    title: '机器人 / 智能体调度',
    subtitle: '自主决策 · 任务规划 · 多智能体协作',
    description:
      '自主机器人面临充电 vs 继续任务 vs 安全避险的两难选择，DPU 以势能排序自动决策，保证行为合理性与安全性。',
    gradient: 'from-amber-500 via-orange-500 to-red-500',
  },
]

export function ScenesSection() {
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
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700 tracking-wider mb-6">
            REAL-WORLD SCENES · 应用场景
          </div>
          <h2 className="text-4xl sm:text-5xl font-black text-slate-900 mb-6 tracking-tight">
            让每个<span className="bg-gradient-to-r from-blue-500 to-indigo-700 bg-clip-text text-transparent">智能体</span>
            <br />
            都懂人类的真实诉求
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            从游戏世界到生产环境，DPU 为需要价值判断的 AI 系统提供可解释的决策核心。
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {SCENES.map((scene, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.6, delay: 0.1 * i }}
              whileHover={{ y: -6 }}
              className="group relative bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 hover:shadow-md transition-shadow"
            >
              <div className={`h-1.5 w-full bg-gradient-to-r ${scene.gradient}`} />
              <div className="p-8">
                <div
                  className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br ${scene.gradient} shadow-md mb-6 group-hover:scale-110 transition-transform`}
                >
                  <scene.icon className="w-7 h-7 text-white" />
                </div>

                <h3 className="text-xl font-bold text-slate-900 mb-2">{scene.title}</h3>
                <p className="text-xs font-semibold text-slate-500 tracking-wider mb-5">
                  {scene.subtitle}
                </p>
                <p className="text-slate-600 leading-relaxed text-sm">{scene.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
