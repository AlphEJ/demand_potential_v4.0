// ============================================================
// 人格选择器 — 预置 + 自定义人格混合列表
// ============================================================
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { NEED_NAMES_CN, NEED_COLORS, type NeedLabPersona } from './types'
import { Zap, Plus, Trash2 } from 'lucide-react'

interface Props {
  selected: NeedLabPersona | null
  personas: NeedLabPersona[]
  onSelect: (p: NeedLabPersona) => void
  onCreateNew: () => void
  onDeleteCustom: (id: string) => void
}

export function PersonalitySelector({ selected, personas, onSelect, onCreateNew, onDeleteCustom }: Props) {
  const [category, setCategory] = useState<string>('all')
  const cats = [
    { key: 'all', label: '全部', emoji: '✨' },
    { key: 'relationship', label: '情感', emoji: '💔' },
    { key: 'workplace', label: '职场', emoji: '💼' },
    { key: 'everyday', label: '日常', emoji: '🌿' },
  ]
  const filtered = category === 'all'
    ? personas
    : personas.filter(p => p.category === category || p.isCustom)

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-blue-500"></span>
        选择人格
      </h3>

      {/* 分类 */}
      <div className="flex gap-1.5 bg-slate-50/80 p-1 rounded-xl border border-slate-100">
        {cats.map(c => (
          <button key={c.key} onClick={() => setCategory(c.key)}
            className="flex-1 py-1.5 rounded-lg border-none cursor-pointer text-[10px] font-bold transition-all flex items-center justify-center gap-1"
            style={{
              background: category === c.key
                ? 'linear-gradient(135deg, #6366f1, #3b82f6)'
                : 'transparent',
              color: category === c.key ? '#fff' : '#94a3b8',
              boxShadow: category === c.key
                ? '0 2px 8px -2px rgba(99, 102, 241, 0.4)'
                : 'none',
            }}
          ><span>{c.emoji}</span>{c.label}</button>
        ))}
      </div>

      {/* 列表 */}
      <div className="flex flex-col gap-2 max-h-[460px] overflow-y-auto">
        <AnimatePresence>
          {filtered.map((p, i) => {
            const isActive = selected?.id === p.id
            return (
              <motion.button
                key={p.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => onSelect(p)}
                className="flex items-center gap-3 px-3.5 py-3 rounded-xl border-none cursor-pointer text-left w-full transition-all text-xs group hover:scale-[1.02] active:scale-[0.98] relative"
                style={{
                  background: isActive
                    ? `linear-gradient(135deg, ${p.color}12, ${p.color}06)`
                    : '#ffffff',
                  border: isActive
                    ? `1px solid ${p.color}30`
                    : '1px solid #f1f5f9',
                  boxShadow: isActive
                    ? `0 4px 12px -4px ${p.color}30, 0 2px 4px -2px rgba(0,0,0,0.04)`
                    : '0 1px 2px -1px rgba(0,0,0,0.03)',
                }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
                  style={{
                    background: isActive
                      ? `linear-gradient(135deg, ${p.color}20, ${p.color}0D)`
                      : '#f8fafc',
                  }}>
                  <span className="text-xl">{p.emoji}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-700 text-sm flex items-center gap-1.5">
                    {p.name}
                    <span className="text-[9px] px-1.5 py-0.5 rounded-md font-bold"
                      style={{ background: `${p.color}14`, color: p.color }}>
                      Lv.{p.difficulty}
                    </span>
                    {p.isCustom && (
                      <span className="text-[8px] px-1.5 py-0.5 rounded font-bold bg-purple-50 text-purple-500">
                        自定义
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 truncate">{p.tagline}</div>
                </div>
                {isActive && (
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, ${p.color}, ${p.color}cc)` }}>
                    <Zap size={11} className="text-white" />
                  </div>
                )}
                {/* 删除按钮（仅自定义人格） */}
                {p.isCustom && (
                  <button
                    onClick={e => { e.stopPropagation(); if (confirm(`确定删除「${p.name}」？`)) onDeleteCustom(p.id) }}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md flex items-center justify-center border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-all bg-white/80 hover:bg-rose-50"
                    style={{ color: '#ef4444' }}
                    title="删除"
                  ><Trash2 size={10} /></button>
                )}
              </motion.button>
            )
          })}
        </AnimatePresence>

        {/* 创建新人格按钮 */}
        <button
          onClick={onCreateNew}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-dashed cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99]"
          style={{
            borderColor: 'rgba(99, 102, 241, 0.3)',
            background: 'rgba(99, 102, 241, 0.03)',
            color: '#6366f1',
          }}
        >
          <Plus size={14} />
          <span className="text-xs font-bold">创建自定义人格</span>
        </button>
      </div>
    </div>
  )
}
