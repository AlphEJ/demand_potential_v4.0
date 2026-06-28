import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Settings, Key, Server, CheckCircle, XCircle, RotateCcw, Bot, Shield, Zap, Eye, Sparkles, ExternalLink, ArrowRight } from 'lucide-react'
import {
  PROVIDER_INFO,
  ModelProvider,
  ModelConfig,
  loadModelConfig,
  saveModelConfig,
  clearModelConfig,
  testConnection,
  NEED_NAMES,
  NEED_LAYERS,
} from '../lib/llm'

export function ModelsPage() {
  const [config, setConfig] = useState<ModelConfig>({ provider: 'offline', apiKey: '' })
  const [baseUrl, setBaseUrl] = useState('')
  const [modelName, setModelName] = useState('')
  const [visionModelName, setVisionModelName] = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    const c = loadModelConfig()
    setConfig(c)
    setBaseUrl(c.baseUrl || PROVIDER_INFO[c.provider].defaultBase)
    setModelName(c.modelName || PROVIDER_INFO[c.provider].defaultModel)
    setVisionModelName(c.visionModelName || PROVIDER_INFO[c.provider].defaultVisionModel)
  }, [])

  const providerList: ModelProvider[] = ['offline', 'qwen', 'deepseek', 'kimi', 'openai', 'claude', 'ollama']

  const pickProvider = (p: ModelProvider) => {
    setConfig({ ...config, provider: p })
    if (p === 'offline') {
      setBaseUrl('')
      setModelName('')
      setVisionModelName('')
    } else {
      setBaseUrl(PROVIDER_INFO[p].defaultBase)
      setModelName(PROVIDER_INFO[p].defaultModel)
      setVisionModelName(PROVIDER_INFO[p].defaultVisionModel)
    }
    setTestResult(null)
  }

  const handleSave = () => {
    const merged: ModelConfig = {
      provider: config.provider,
      apiKey: config.apiKey.trim(),
      baseUrl: baseUrl.trim(),
      modelName: modelName.trim(),
      visionModelName: visionModelName.trim(),
    }
    saveModelConfig(merged)
    setConfig(merged)
    setSavedMsg('已保存 ✓（仅保存在本地浏览器，不上传）')
    setTimeout(() => setSavedMsg(''), 3500)
  }

  const handleTest = async () => {
    setIsTesting(true)
    setTestResult(null)
    const merged: ModelConfig = {
      provider: config.provider,
      apiKey: config.apiKey.trim(),
      baseUrl: baseUrl.trim(),
      modelName: modelName.trim(),
      visionModelName: visionModelName.trim(),
    }
    const r = await testConnection(merged)
    setTestResult(r)
    setIsTesting(false)
  }

  const handleReset = () => {
    clearModelConfig()
    setConfig({ provider: 'offline', apiKey: '' })
    setBaseUrl('')
    setModelName('')
    setTestResult(null)
    setSavedMsg('已重置为纯算法模式')
    setTimeout(() => setSavedMsg(''), 3000)
  }

  return (
    <div className="min-h-screen pt-24 pb-20 bg-gradient-to-br from-slate-50 via-sky-50/30 to-indigo-50/20">
      <div className="max-w-5xl mx-auto px-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/70 border border-sky-200 text-xs font-bold text-sky-700 tracking-wider mb-4 shadow-sm">
            <Settings className="w-4 h-4" /> MODEL CONFIGURATION
          </div>
          <h1 className="text-4xl lg:text-5xl font-black text-slate-900 mb-3 tracking-tight">
            接入你熟悉的<span className="bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent"> 大模型</span>
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl mx-auto">
            API Key <span className="text-sky-700 font-bold">仅保存在你的浏览器本地</span>（localStorage），不会上传到任何服务器。
            配置后，智能体将通过 LLM 进行真正的<span className="font-bold text-indigo-600">语义理解</span>，而不是关键词匹配。
          </p>
        </motion.div>

        {/* 新手引导横幅 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-gradient-to-r from-sky-50/80 via-indigo-50/60 to-purple-50/40 backdrop-blur rounded-3xl border border-sky-200/60 shadow-sm p-6 mb-6"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-sky-600" />
                <span className="text-sm font-bold text-sky-700">第一次使用？跟着这 3 步配置即可</span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/80 rounded-lg border border-sky-100">
                  <span className="w-5 h-5 rounded-full bg-sky-500 text-white flex items-center justify-center text-[10px] font-bold">1</span>
                  选「通义千问」
                </span>
                <ArrowRight className="w-3 h-3 text-slate-300 self-center hidden md:block" />
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/80 rounded-lg border border-sky-100">
                  <span className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px] font-bold">2</span>
                  粘贴 API Key
                </span>
                <ArrowRight className="w-3 h-3 text-slate-300 self-center hidden md:block" />
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/80 rounded-lg border border-sky-100">
                  <span className="w-5 h-5 rounded-full bg-purple-500 text-white flex items-center justify-center text-[10px] font-bold">3</span>
                  保存并测试
                </span>
              </div>
            </div>
            <a
              href="https://dashscope.aliyun.com/"
              target="_blank"
              rel="noreferrer"
              className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border-2 border-sky-300 text-sky-700 text-sm font-bold hover:bg-sky-50 hover:border-sky-400 transition-colors shadow-sm"
            >
              <ExternalLink className="w-4 h-4" />
              去获取 API Key（通义千问）
            </a>
          </div>
          <div className="mt-3 pt-3 border-t border-sky-100/60 text-xs text-slate-500 leading-relaxed">
            <span className="font-semibold text-slate-700">提示：</span>
            不配置也能用「纯 DPU 算法模式」，只是没有 LLM 语义增强。
            通义千问新用户有免费额度，国内访问最稳定。也可以选择 DeepSeek / Kimi / Ollama 本地模型。
          </div>
        </motion.div>

        {/* 选择厂商 */}
        <div className="bg-white/80 backdrop-blur rounded-3xl border border-slate-200 shadow-lg p-6 mb-6">
          <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Bot className="w-4 h-4 text-sky-600" /> 选择模型厂商
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {providerList.map(p => {
              const info = PROVIDER_INFO[p]
              const active = config.provider === p
              return (
                <button
                  key={p}
                  onClick={() => pickProvider(p)}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${active
                      ? 'border-sky-500 bg-sky-50 shadow-md shadow-sky-100'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                    }`}
                >
                  <div className="font-bold text-sm text-slate-900 mb-1">{info.label}</div>
                  <div className="text-xs text-slate-500 leading-relaxed">{info.desc}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* 详细配置 */}
        {config.provider !== 'offline' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="bg-white/80 backdrop-blur rounded-3xl border border-slate-200 shadow-lg p-6 mb-6"
          >
            <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Key className="w-4 h-4 text-sky-600" /> 详细配置
            </h2>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">API Key</label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={config.apiKey}
                    onChange={e => setConfig({ ...config, apiKey: e.target.value })}
                    placeholder="sk-... 或 dashscope / deepseek / moonshot / anthropic 的 Key"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 focus:outline-none text-sm font-mono pr-20"
                  />
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-sky-600 font-bold"
                  >
                    {showKey ? '隐藏' : '显示'}
                  </button>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1">
                    <Server className="w-3 h-3" /> Base URL
                  </label>
                  <input
                    value={baseUrl}
                    onChange={e => setBaseUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 focus:outline-none text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1">
                    <Zap className="w-3 h-3" /> 模型名称
                  </label>
                  <input
                    value={modelName}
                    onChange={e => setModelName(e.target.value)}
                    placeholder="gpt-4o-mini / qwen-plus / deepseek-chat / moonshot-v1-8k / claude-3-haiku-20240307"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 focus:outline-none text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1">
                    <Eye className="w-3 h-3" /> 视觉模型（用于图片/OCR 识别）
                  </label>
                  <input
                    value={visionModelName}
                    onChange={e => setVisionModelName(e.target.value)}
                    placeholder="qwen-vl-max / gpt-4o-mini / claude-3-haiku-20240307"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 focus:outline-none text-sm font-mono"
                  />
                  <p className="text-[11px] text-slate-500 mt-1.5">装逼检测器的图片上传功能依赖此模型。推荐：<span className="font-bold text-sky-700">qwen-vl-max</span>（千问视觉能力最强）</p>
                </div>
              </div>

              {PROVIDER_INFO[config.provider].docs && (
                <div className="text-xs text-slate-500">
                  <Shield className="w-3 h-3 inline mr-1" />
                  官方文档：<a href={PROVIDER_INFO[config.provider].docs} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline font-semibold">{PROVIDER_INFO[config.provider].docs}</a>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* 操作按钮 */}
        <div className="bg-white/80 backdrop-blur rounded-3xl border border-slate-200 shadow-lg p-6 mb-6">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSave}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 text-white text-sm font-bold shadow hover:shadow-lg transition-shadow flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" /> 保存配置
            </button>
            {config.provider !== 'offline' && (
              <button
                onClick={handleTest}
                disabled={isTesting || !config.apiKey}
                className="px-5 py-2.5 rounded-xl bg-white border-2 border-sky-300 text-sky-700 text-sm font-bold hover:bg-sky-50 disabled:opacity-40 transition-colors flex items-center gap-2"
              >
                {isTesting ? '正在测试…' : <> <Zap className="w-4 h-4" /> 测试连通</>}
              </button>
            )}
            <button
              onClick={handleReset}
              className="px-5 py-2.5 rounded-xl bg-white border-2 border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 transition-colors flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> 重置
            </button>
            {savedMsg && (
              <span className="text-xs text-emerald-600 font-bold self-center">{savedMsg}</span>
            )}
          </div>
          {testResult && (
            <div className={`mt-4 p-4 rounded-xl text-sm font-semibold flex items-start gap-2 ${testResult.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {testResult.ok ? <CheckCircle className="w-4 h-4 mt-0.5" /> : <XCircle className="w-4 h-4 mt-0.5" />}
              <span>{testResult.msg}</span>
            </div>
          )}
        </div>

        {/* 说明卡片 */}
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          {[
            { icon: '🔒', title: '隐私保护', desc: 'API Key 仅存于你的浏览器（localStorage），不上传任何服务器。' },
            { icon: '🧠', title: '语义理解', desc: '配置后，DPU 将使用 LLM 分析文本中的真实意图，而不是简单的关键词匹配。' },
            { icon: '🎯', title: '隐性需求', desc: 'LLM 能识别表面话之下的深层动机，并自动标记需求冲突。' },
          ].map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.1 }}
              className="bg-white/70 backdrop-blur rounded-2xl p-5 border border-slate-200 shadow-sm"
            >
              <div className="text-2xl mb-2">{f.icon}</div>
              <div className="font-bold text-slate-900 text-sm mb-1">{f.title}</div>
              <div className="text-xs text-slate-600 leading-relaxed">{f.desc}</div>
            </motion.div>
          ))}
        </div>

        {/* 12 维需求预览 */}
        <div className="bg-white/80 backdrop-blur rounded-3xl border border-slate-200 shadow-lg p-6">
          <h2 className="text-sm font-bold text-slate-900 mb-4">📋 当前 12 维需求体系</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {NEED_NAMES.map((name, i) => {
              const layerNames = ['生理层', '安全层', '社交层', '尊重层', '自我实现层']
              return (
                <div key={i} className="px-3 py-2 bg-slate-50 rounded-lg text-xs flex items-center justify-between gap-2 border border-slate-100">
                  <span className="font-bold text-slate-700">{i + 1}. {name}</span>
                  <span className="text-slate-400">{layerNames[NEED_LAYERS[i]]}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="text-center mt-8 text-xs text-slate-400">
          DPU v4.0 · 多模型接入 · 本地存储 · 语义增强
        </div>
      </div>
    </div>
  )
}
