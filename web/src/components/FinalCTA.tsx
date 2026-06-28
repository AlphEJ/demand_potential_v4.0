import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

export function FinalCTA() {
  return (
    <section className="py-24 relative">
      <div className="max-w-5xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-700 to-indigo-900 p-12 sm:p-20 text-center shadow-2xl"
        >
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.2) 0%, transparent 50%)',
            }}
          />
          <div className="relative">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 backdrop-blur-sm text-white text-xs font-bold tracking-wider mb-8">
              <Sparkles className="w-3.5 h-3.5" />
              READY TO EXPERIENCE · 立即体验
            </div>

            <h2 className="text-4xl sm:text-6xl font-black text-white mb-8 tracking-tight leading-tight">
              让你的 AI
              <br />
              <span className="text-blue-100">学会价值判断</span>
            </h2>

            <p className="text-lg sm:text-xl text-blue-100 max-w-2xl mx-auto mb-10 leading-relaxed">
              DPU 可以独立运行，也可以作为任何 LLM 系统的决策增强模块。
              零 API 依赖、毫秒级响应、完全可解释。
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4 mb-10">
              <a
                href="#/"
                className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-white text-blue-700 font-bold text-base hover:scale-105 transition-transform shadow-xl"
              >
                <Sparkles className="w-5 h-5" />
                立即体验 Demo
              </a>
              <a
                href="https://github.com"
                className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-white/10 backdrop-blur-sm text-white font-bold text-base hover:bg-white/20 transition-colors border border-white/30"
              >
                查看源码
              </a>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 pt-8 border-t border-white/20">
              {[
                { v: '12', l: '维需求维度' },
                { v: '4步', l: '势能计算' },
                { v: 'ms级', l: '响应速度' },
                { v: '零', l: '外部依赖' },
                { v: 'Python', l: '纯算法实现' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-2xl font-black text-white">{item.v}</span>
                  <span className="text-sm text-blue-200 font-medium">{item.l}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export function Footer() {
  return (
    <footer className="py-12 border-t border-slate-200/60">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-700 flex items-center justify-center text-white font-black text-sm">
              D
            </div>
            <div>
              <div className="font-bold text-slate-800 text-sm">DPU · 需求势能引擎</div>
              <div className="text-xs text-slate-500">Demand Processing Unit v4.0</div>
            </div>
          </div>
          <p className="text-sm text-slate-500">基于马斯洛需求层次理论 · 让 AI 知道什么对人类更重要</p>
        </div>
      </div>
    </footer>
  )
}
