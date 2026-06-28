// ============================================================
// LLM 配置面板 — 亮色调
// ============================================================
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings, Key, Check, AlertTriangle, Eye, EyeOff } from 'lucide-react'

const STORAGE_KEY = 'dpu_llm_config_v1'
interface LLMConfig { provider?: string; apiKey?: string; baseUrl?: string; modelName?: string }

function loadConfig(): LLMConfig {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : {} } catch { return {} }
}
function saveConfig(cfg: LLMConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
  window.dispatchEvent(new Event('llm-config-changed'))
}

const PROVIDERS = [
  { key: 'qwen', name: '通义千问', emoji: '☁️', defaultUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { key: 'deepseek', name: 'DeepSeek', emoji: '🔍', defaultUrl: 'https://api.deepseek.com' },
]

export function LLMConfigPanel() {
  const [open, setOpen] = useState(false)
  const [config, setConfig] = useState<LLMConfig>(loadConfig)
  const [saved, setSaved] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const hasConfig = !!(config.apiKey)
  useEffect(() => { setConfig(loadConfig()) }, [open])

  const handleSave = () => {
    const toSave: LLMConfig = { ...config }
    const p = PROVIDERS.find(x => x.key === toSave.provider)
    if (p && !toSave.baseUrl) toSave.baseUrl = p.defaultUrl
    saveConfig(toSave); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="mb-3.5">
      <button
        onClick={() => setOpen(!open)}
        className="w-full p-2.5 rounded-lg border-none cursor-pointer flex items-center gap-2 text-[11px] font-semibold transition-all"
        style={{
          background: hasConfig ? '#ecfdf5' : '#fffbeb',
          border: hasConfig ? '1px solid #a7f3d0' : '1px solid #fde68a',
          color: hasConfig ? '#059669' : '#d97706',
        }}
      >
        {hasConfig ? <Check size={13} /> : <AlertTriangle size={13} />}
        <span className="flex-1 text-left">{hasConfig ? `已配置：${config.provider === 'qwen' ? '通义千问' : config.provider === 'deepseek' ? 'DeepSeek' : config.provider}` : '配置 API Key'}</span>
        <Settings size={13} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-2 p-3 rounded-xl bg-white border border-slate-200 flex flex-col gap-2.5">
              {/* 提供商 */}
              <div>
                <label className="text-[9px] text-slate-400 mb-1 block">模型提供商</label>
                <div className="flex gap-1">
                  {PROVIDERS.map(p => (
                    <button key={p.key} onClick={() => setConfig(c => ({ ...c, provider: p.key, baseUrl: p.defaultUrl }))}
                      className="flex-1 py-1.5 rounded-md border-none cursor-pointer text-[10px] font-semibold transition-all"
                      style={{
                        background: config.provider === p.key ? `${'#6366f1'}14` : '#f8fafc',
                        color: config.provider === p.key ? '#6366f1' : '#94a3b8',
                      }}
                    ><span className="mr-1">{p.emoji}</span>{p.name}</button>
                  ))}
                </div>
              </div>
              {/* API Key */}
              <div>
                <label className="text-[9px] text-slate-400 mb-1 flex items-center gap-1"><Key size={9} /> API Key</label>
                <div className="flex gap-1">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={config.apiKey || ''}
                    onChange={e => setConfig(c => ({ ...c, apiKey: e.target.value }))}
                    placeholder="sk-xxxxxxxxxxxxxxxx"
                    className="flex-1 px-2.5 py-1.5 rounded-md bg-slate-50 border border-slate-200 text-slate-700 text-[11px] outline-none focus:border-indigo-300 font-mono"
                  />
                  <button onClick={() => setShowKey(!showKey)} className="w-7 rounded-md border-none cursor-pointer bg-slate-50 text-slate-400 flex items-center justify-center">
                    {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
              </div>
              {/* Base URL */}
              <div>
                <label className="text-[9px] text-slate-400 mb-1 block">API 地址（可选）</label>
                <input
                  type="text" value={config.baseUrl || ''}
                  onChange={e => setConfig(c => ({ ...c, baseUrl: e.target.value }))}
                  placeholder={PROVIDERS.find(p => p.key === config.provider)?.defaultUrl}
                  className="w-full px-2.5 py-1.5 rounded-md bg-slate-50 border border-slate-200 text-slate-700 text-[10px] outline-none focus:border-indigo-300 font-mono box-border"
                />
              </div>
              {/* 保存 */}
              <button
                onClick={handleSave}
                disabled={!config.apiKey}
                className="w-full py-2 rounded-md border-none text-[11px] font-semibold transition-all"
                style={{
                  background: config.apiKey ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#f1f5f9',
                  color: config.apiKey ? '#fff' : '#94a3b8',
                  cursor: config.apiKey ? 'pointer' : 'not-allowed',
                }}
              >
                {saved ? <span className="flex items-center justify-center gap-1.5"><Check size={12} /> 已保存</span> : '保存配置'}
              </button>
              <div className="text-[9px] text-slate-300 text-center">Key 仅保存在浏览器本地</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
