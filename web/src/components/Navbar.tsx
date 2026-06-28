import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Brain } from 'lucide-react'

// 导航项顺序（调整数组即可重排）
const NAV_ITEMS = [
  { path: '/', label: '首页' },
  { path: '/needlab', label: '人格沙盘' },
  { path: '/understand', label: '智能理解' },
  { path: '/potential', label: '势能计算' },
  { path: '/architecture', label: '系统架构' },
  { path: '/agent', label: '智能体' },
  { path: '/memory', label: '记忆系统' },
  { path: '/insight', label: '需求洞察' },
  { path: '/showoff', label: '装逼检测' },
  { path: '/models', label: '模型配置' },
]

export function Navbar() {
  const location = useLocation()

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="fixed top-0 left-0 right-0 z-50"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 mt-3">
        <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-indigo-700 via-indigo-600 to-blue-700 px-4 sm:px-6 py-3 shadow-lg shadow-indigo-900/40 border border-indigo-500/60">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group flex-shrink-0">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                <Brain className="w-5 h-5 text-indigo-700" />
              </div>
            </div>
            <div>
              <div className="font-extrabold text-white text-sm tracking-wide">DPU</div>
              <div className="text-[11px] text-indigo-100 font-semibold tracking-wider">
                DEMAND PROCESSING UNIT
              </div>
            </div>
          </Link>

          {/* Nav Items */}
          <div className="hidden xl:flex items-center gap-1">
            {NAV_ITEMS.map(item => {
              const isActive =
                (item.path === '/' && location.pathname === '/') ||
                (item.path !== '/' && location.pathname.startsWith(item.path))
              return (
                <Link key={item.path} to={item.path}>
                  <div
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-white text-indigo-700 shadow-md'
                        : 'text-white/90 hover:text-white hover:bg-white/20'
                    }`}
                  >
                    {item.label}
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Mobile / Tablet: Show current page + hide menu */}
          <div className="xl:hidden flex items-center gap-2">
            {NAV_ITEMS.filter(item =>
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path)
            ).slice(0, 1).map(item => (
              <span
                key={item.path}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white text-indigo-700 shadow-sm"
              >
                {item.label}
              </span>
            ))}
          </div>


        </div>
      </div>
    </motion.nav>
  )
}
