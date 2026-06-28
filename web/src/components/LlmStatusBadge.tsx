import { useState, useEffect } from 'react'
import { Zap, RefreshCw } from 'lucide-react'
import { loadModelConfig } from '../lib/llm'

export interface LlmStatus {
  ok: boolean
  text: string
  provider?: string
  model?: string
  detail: string
  reasons?: string[]
}

export function computeLlmStatus(): LlmStatus {
  const cfg = loadModelConfig()
  const hasLLM = cfg.provider !== 'offline' && !!cfg.apiKey
  if (hasLLM) {
    return {
      ok: true,
      text: `${cfg.provider} · ${cfg.modelName || '已配置'}`,
      provider: cfg.provider,
      model: cfg.modelName || '',
      detail: `API Key: ${cfg.apiKey.slice(0, 6)}...${cfg.apiKey.slice(-4)}`,
    }
  }
  const reasons: string[] = []
  if (cfg.provider === 'offline') reasons.push('未选择模型厂商')
  if (!cfg.apiKey) reasons.push('API Key 为空')
  return { ok: false, text: '未配置 LLM', reasons, detail: reasons.join('；') }
}

export function useLlmStatus() {
  const [status, setStatus] = useState<LlmStatus>(computeLlmStatus)

  useEffect(() => {
    const check = () => setStatus(computeLlmStatus())
    check()
    window.addEventListener('focus', check)
    window.addEventListener('visibilitychange', check)
    window.addEventListener('storage', check)
    return () => {
      window.removeEventListener('focus', check)
      window.removeEventListener('visibilitychange', check)
      window.removeEventListener('storage', check)
    }
  }, [])

  return { status, refresh: () => setStatus(computeLlmStatus()) }
}

export function LlmStatusBadge({ status, onRefresh }: { status: LlmStatus; onRefresh?: () => void }) {
  return (
    <div className="inline-flex items-center gap-2">
      {status.ok ? (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          {status.text}
          <span className="text-[9px] text-emerald-500 ml-1">({status.detail})</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 border border-red-200 text-[11px] font-semibold text-red-600">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          {status.text}
          <span className="text-[9px] text-red-400 ml-1">({status.detail})</span>
          <a
            href="/models"
            className="ml-1 px-1.5 py-0.5 rounded bg-red-100 hover:bg-red-200 text-[10px] font-bold transition-colors"
          >
            去配置 →
          </a>
          {onRefresh && (
            <button
              onClick={(e) => { e.stopPropagation(); onRefresh() }}
              className="ml-1 px-1.5 py-0.5 rounded bg-red-100 hover:bg-red-200 text-[9px] font-bold"
              title="强制重新读取 localStorage"
            >
              <RefreshCw className="w-3 h-3 inline" />
            </button>
          )}
        </span>
      )}
    </div>
  )
}
