// ============================================================
// 智能理解页面 — DPU v4.2
// 三级对比：关键词 → DPU引擎 → LLM+DPU
// 每级在前一级基础上叠加能力，结果逐步精准
// ============================================================
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, Send, BarChart3, Brain, Zap, GitBranch, Shield, Cpu, Bot, Lightbulb, TrendingUp } from 'lucide-react'
import { NEED_COLORS } from '../data/needs'
import { analyzeDemands, tracePath, type AnalyzeResponse, type TracePathResponse, API_BASE, getLlmHeaders } from '@/lib/dpuApi'
import { useLlmStatus, LlmStatusBadge } from '@/components/LlmStatusBadge'

const NEED_NAMES = [
  '生理生存', '安全稳定', '社交归属', '情感陪伴',
  '尊重认可', '认知求知', '审美价值', '自我实现',
  '自由掌控', '公平公正', '成长进阶', '秩序规整',
]

const NEED_LAYERS = ['生理层','安全层','社交层','社交层','尊重层','尊重层','自我实现层','自我实现层','自我实现层','自我实现层','自我实现层','自我实现层']

type Mode = 'keyword' | 'dpu' | 'llm'

// ============================================================
// 本地关键词匹配（前端离线）
// ============================================================
function runKeywordMatch(text: string) {
  const keywordMap: Record<number, string[]> = {
    0: ['饿','吃','饭','食物','喝','睡','累','困','身体','健康','生病','疼痛','疲惫','休息'],
    1: ['安全','稳定','工作','收入','房租','钱','工资','存款','房贷','保险','失业','面试','考试','项目','风险','害怕','担心','焦虑','压力'],
    2: ['朋友','社交','聚会','孤独','寂寞','同事','团队','聊天','陪伴','融入','孤立','想找人','没人陪','一个人'],
    3: ['爱','喜欢','感情','恋爱','男朋友','女朋友','伴侣','亲密','温暖','关心','思念','分手','表白','依赖','心灵','慰藉'],
    4: ['尊重','认可','面子','地位','荣誉','表扬','成就','看不起','羡慕','嫉妒','攀比','证明自己','尊严'],
    5: ['学习','读书','知识','课程','技能','培训','提升','考试','论文','研究','理解','好奇','探索','专业'],
    6: ['美','艺术','音乐','画画','设计','品质','精致','审美','品味','好看','漂亮','优雅','创意','风格'],
    7: ['梦想','理想','目标','实现','突破','挑战','创业','潜能','价值','意义','使命','追求','成功','卓越','自我','成长'],
    8: ['自由','不想被','控制','束缚','约束','自主','选择','独立','逃离','辞职','旅行','随心','做自己','主动权'],
    9: ['公平','公正','不公','偏心','歧视','平等','正义','权益','合理','规则','凭什么','不合理'],
    10: ['进步','提升','发展','变强','努力','奋斗','坚持','锻炼','健身','自律','积累','沉淀','突破'],
    11: ['秩序','计划','规律','整理','规划','安排','时间管理','条理','混乱','无序','拖延','效率','系统','流程'],
  }
  const lower = text.toLowerCase()
  const levelWeights = [0.95,0.90,0.75,0.70,0.80,0.85,0.55,0.60,0.40,0.35,0.45,0.38]
  const lowerLayers = [0,1]
  const matches = NEED_NAMES.map((_, id) => {
    const hits = (keywordMap[id]||[]).filter(k => lower.includes(k))
    return { id, count: hits.length, keywords: hits.slice(0,4) }
  }).filter(m => m.count > 0)
  const maxC = Math.max(...matches.map(m => m.count), 1)
  const baseActive = matches.some(m => lowerLayers.includes(m.id) && (m.count/maxC) > 0.3)
  const ranking = matches.map(m => {
    const urgency = 0.3 + (m.count/maxC)*0.5
    const bp = levelWeights[m.id] * (0.30*urgency + 0.25 + 0.15*0.5) + 0.35*levelWeights[m.id]
    const fp = bp * 1.2
    const suppressed = baseActive && !lowerLayers.includes(m.id) && Math.random() < 0.3
    return { needId: m.id, potential: suppressed ? fp*0.5 : fp, keywords: m.keywords, suppressed, layer: NEED_LAYERS[m.id] }
  }).sort((a,b)=>b.potential-a.potential)
  // 计算 top-1 准确率标记（对比赛演示有用）
  const topNeed = ranking[0]
  return { ranking, conflicts: [] as any[], method: 'keyword', topNeed, suppressedCount: ranking.filter((r:any)=>r.suppressed).length, keywordHits: matches.reduce((s,m)=>s+m.count,0) }
}

// ============================================================
// DPU 结果映射（通用）
// ============================================================
function mapDpuResult(analysis: AnalyzeResponse, activation12: number[]) {
  if (!analysis?.top_needs?.length) return null
  const ranking = activation12
    .map((v, i) => ({ needId: i, potential: v, layer: NEED_LAYERS[i],
      suppressed: (analysis.suppressed||[]).includes(NEED_NAMES[i]), keywords: [] as string[] }))
    .sort((a,b)=>b.potential-a.potential)
  const conflicts = (analysis.conflicts||[]).map((c: any) => ({
    type: '互斥冲突', winner: typeof c==='string'?c.split(' vs ')[0]:c.need_a,
    loser: typeof c==='string'?c.split(' vs ')[1]:c.need_b,
    reason: '12×12 关联矩阵检测到强互斥关系',
  }))
  return { ranking, conflicts, method: 'dpu' as const, signals: analysis.signals||[], llmAvailable: analysis.llm_available||false }
}

// ============================================================
// 预设场景
// ============================================================
const PRESETS = [
  { title: '工作太累想辞职', text: '我工作太累了天天加班，老板不合理的要求让我很崩溃，想辞职不干了，但又怕找不到更好的工作，存款也不多，房贷还要交，好纠结。' },
  { title: '饿了要考试', text: '我好饿想吃东西，肚子咕咕叫，但是明天有个重要的考试要准备，复习资料还没看完，很焦虑又很累。' },
  { title: '被领导PUA', text: '领导又在会上当众批评我了，说我的方案不值一提，同事都在笑。我觉得很丢脸，开始怀疑自己是不是真的不行。' },
]

// ============================================================
// 差异演示预设 —— 专门用于展示三级分析结果明显不同
// 关键词模式会判断错，DPU+LLM 才能判断对
// ============================================================
const DEMO_PRESETS = [
  {
    title: '🔍 否定词陷阱',
    text: '我一点也不饿，刚吃完大餐，现在精力挺充沛的',
    desc: '"不饿"两次，关键词扫到"饿"字就激活生理生存。LLM会先理解否定语义再传给DPU',
  },
  {
    title: '💬 口语化情绪',
    text: '你总是不认真听我说话，我在你眼里到底算什么',
    desc: '这话底层是对尊重的呐喊，但关键词库很难覆盖这类口语化表达。LLM能提取出"需要被认真对待"的信号',
  },
  {
    title: '😶 表面说没事',
    text: '挺好的，都挺好的，我自己能扛，你不用担心',
    desc: '关键词扫到"好"字无明确匹配。LLM能识别这是自我实现受挫后的被动妥协',
  },
  {
    title: '🍜 孤独的晚餐',
    text: '一个人吃饭，吃什么都没味道',
    desc: '关键词只看到"吃饭"→生理生存。LLM能把"一个人+没味道"翻译为社交归属需求',
  },
]

// ============================================================
// SVG 雷达图
// ============================================================
function SimpleRadar({ act12, maxW = 320 }: { act12: number[]; maxW?: number }) {
  const cx=140, cy=140, r=100
  const angles = Array.from({length:12},(_,i)=>(Math.PI*2*i)/12-Math.PI/2)
  const dataPoly = angles.map((a,i)=>{ const v=Math.max(0.03,act12[i]||0); return `${cx+r*v*Math.cos(a)},${cy+r*v*Math.sin(a)}` }).join(' ')
  return (
    <svg viewBox="0 0 280 280" className="w-full" style={{maxWidth:maxW,margin:'0 auto'}}>
      {[0.25,0.5,0.75,1.0].map(lv=><polygon key={lv} points={angles.map(a=>`${cx+r*lv*Math.cos(a)},${cy+r*lv*Math.sin(a)}`).join(' ')} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth={lv===1?1.2:0.6}/>)}
      {angles.map((a,i)=><line key={i} x1={cx} y1={cy} x2={cx+r*Math.cos(a)} y2={cy+r*Math.sin(a)} stroke="rgba(148,163,184,0.12)" strokeWidth={0.6}/>)}
      {angles.map((a,i)=>{const lr=r+14,lx=cx+lr*Math.cos(a),ly=cy+lr*Math.sin(a); const an=Math.cos(a)>0.1?'start':Math.cos(a)<-0.1?'end':'middle'; return <text key={i} x={lx} y={ly} textAnchor={an} dominantBaseline="middle" fill="#64748b" fontSize={8} fontWeight={600}>{NEED_NAMES[i].length>3?NEED_NAMES[i].slice(0,3):NEED_NAMES[i]}</text>})}
      <polygon points={dataPoly} fill="rgba(99,102,241,0.25)" stroke="#6366f1" strokeWidth={1.8} strokeLinejoin="round"/>
      {angles.map((a,i)=>{const v=Math.max(0.02,act12[i]||0);return<circle key={i} cx={cx+r*v*Math.cos(a)} cy={cy+r*v*Math.sin(a)} r={3} fill="white" stroke="#6366f1" strokeWidth={1.5}/>})}
    </svg>
  )
}

// ============================================================
// 进度条组件
// ============================================================
function NeedBar({ needId, value, rank, suppressed, small }: { needId:number; value:number; rank:number; suppressed?:boolean; small?:boolean }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className={`font-mono font-bold flex-shrink-0 ${small?'text-[9px] w-5':'text-[10px] w-6'}`} style={{color:NEED_COLORS[needId]}}>#{rank}</span>
      <span className={`flex-shrink-0 truncate ${small?'text-[10px] w-14':'text-xs w-16'}`} style={{color:suppressed?'#94a3b8':'#334155',fontWeight:suppressed?500:600}}>{NEED_NAMES[needId]}</span>
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{width:`${Math.min(100,value*100)}%`,background:suppressed?'#cbd5e1':NEED_COLORS[needId]}}/>
      </div>
      <span className={`font-mono flex-shrink-0 ${small?'text-[9px] w-8':'text-[10px] w-9'} text-right`} style={{color:suppressed?'#94a3b8':NEED_COLORS[needId]}}>{(value*100).toFixed(0)}%</span>
      {suppressed && <span className="text-[8px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded-full flex-shrink-0">压制</span>}
    </div>
  )
}

// ============================================================
// 主页面
// ============================================================
export function UnderstandPage() {
  const { status: llmConfigStatus, refresh: refreshLlmConfig } = useLlmStatus()
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<Mode>('llm')
  // 三种结果
  const [kwResult, setKwResult] = useState<any>(null)
  const [dpuResult, setDpuResult] = useState<any>(null)
  const [llmResult, setLlmResult] = useState<any>(null)
  const [dpuAct12, setDpuAct12] = useState<number[]>(new Array(12).fill(0))
  const [llmAct12, setLlmAct12] = useState<number[]>(new Array(12).fill(0))
  const [llmStatus, setLlmStatus] = useState<string>('waiting')
  const [trace, setTrace] = useState<any>(null)

  const handleAnalyze = async (input: string) => {
    if (!input.trim()) return
    setLoading(true); setText(input)
    setLlmResult(null); setLlmStatus('waiting')

    // 步骤 1：前端关键词（本地，瞬间完成）
    const kw = runKeywordMatch(input)
    setKwResult(kw.ranking?.length > 0 ? kw : { ...kw, empty: true })

    // 步骤 2+3：Lv.2 DPU引擎 和 Lv.3 LLM+DPU 并行发起
    try {
      const [dpuResp, traceResp, llmResp] = await Promise.all([
        fetch(API_BASE + '/analyze/demands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getLlmHeaders() },
          body: JSON.stringify({ text: input }),
        }).then(r => r.json()).catch(e => ({ success: false, error: String(e) })),
        tracePath(input).catch(() => null),
        analyzeDemands(input).catch(e => { setLlmStatus('error'); return null }),
      ])

      if (dpuResp?.success) {
        setDpuAct12(dpuResp.activation12 || new Array(12).fill(0))
        setDpuResult(mapDpuResult(dpuResp, dpuResp.activation12 || new Array(12).fill(0)))
      }
      if (traceResp?.path) setTrace(traceResp.path)

      if (llmResp?.success) {
        const a12 = llmResp.activation12 || new Array(12).fill(0)
        setLlmAct12(a12)
        const mapped = mapDpuResult(llmResp, a12)
        setLlmResult(mapped)
        setLlmStatus(mapped?.llmAvailable ? 'loaded' : 'no_key')
      } else if (llmResp?.error) {
        setLlmResult({ error: llmResp.error })
        setLlmStatus('error')
      } else {
        setLlmStatus('no_key')
      }
    } catch {}

    setLoading(false)
  }

  // ===== 输入页 =====
  if (!kwResult && !dpuResult && !llmResult) {
    return (
      <div className="min-h-screen pt-32 pb-24 bg-gradient-to-b from-white via-slate-50 to-blue-50/30">
        <div className="max-w-3xl mx-auto px-6">
          <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 text-[11px] font-bold text-indigo-600 mb-5">
              <Sparkles size={12}/> 智能理解 · v4.2
            </div>
            <h1 className="text-4xl font-black text-slate-900 mb-3">
              输入你的<span className="bg-gradient-to-r from-indigo-500 to-violet-600 bg-clip-text text-transparent">困扰</span>
            </h1>
            <p className="text-slate-500 text-sm max-w-xl mx-auto">
              同一段话，三种分析方式。从粗到精，每级叠加新能力。
            </p>
            <div className="mt-3"><LlmStatusBadge status={llmConfigStatus} onRefresh={refreshLlmConfig} /></div>
          </motion.div>

          {/* 三级说明卡片 */}
          <div className="flex items-center justify-center gap-3 mb-8 flex-wrap">
            {([
              { k:'keyword' as Mode, label:'纯关键词', desc:'前端本地', icon:Cpu, color:'#f59e0b', bg:'bg-amber-50', border:'border-amber-200' },
              { k:'dpu' as Mode, label:'DPU 引擎', desc:'语义向量+势能', icon:Brain, color:'#6366f1', bg:'bg-indigo-50', border:'border-indigo-200' },
              { k:'llm' as Mode, label:'LLM+DPU', desc:'语义增强完整版', icon:Bot, color:'#8b5cf6', bg:'bg-violet-50', border:'border-violet-200' },
            ]).map((m,i) => {
              const active = mode === m.k
              return (
                <button key={m.k} onClick={() => setMode(m.k)}
                  className={`flex items-center gap-2.5 px-5 py-3 rounded-2xl border-2 text-sm font-bold transition-all ${m.bg} ${m.border} ${active ? 'scale-105 shadow-lg' : 'opacity-60 hover:opacity-100'}`}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{background:active?`${m.color}20`:'#f1f5f9'}}>
                    <m.icon size={16} style={{color:m.color}}/>
                  </div>
                  <div className="text-left">
                    <div className="text-slate-800">{m.label}</div>
                    <div className="text-[10px] text-slate-400 font-normal">{m.desc}</div>
                  </div>
                  <div className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{background:`${m.color}14`,color:m.color}}>
                    {active ? '当前' : `Lv.${i+1}`}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mb-8 flex flex-wrap items-center justify-center gap-2.5">
            <span className="text-xs font-bold text-slate-400 tracking-wider">预设场景 →</span>
            {PRESETS.map((p,i) => (
              <button key={i} onClick={() => { setText(p.text); handleAnalyze(p.text) }}
                className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:scale-105 hover:border-indigo-300 hover:bg-indigo-50 transition-all shadow-sm"
              >{p.title}</button>
            ))}
          </div>

          {/* 差异演示预设 */}
          <div className="mb-8">
            <div className="text-center mb-3">
              <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-3 py-1 rounded-full">⚡ 三种模式差异演示</span>
              <p className="text-[10px] text-slate-400 mt-1.5">以下案例会让关键词判断错、DPU 引擎部分纠正、LLM+DPU 完全正确</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 max-w-2xl mx-auto">
              {DEMO_PRESETS.map((p,i) => (
                <button key={i} onClick={() => { setText(p.text); handleAnalyze(p.text) }}
                  className="p-3 rounded-xl bg-white border-2 border-rose-100 hover:border-rose-300 hover:bg-rose-50/50 transition-all text-left shadow-sm group"
                >
                  <div className="text-xs font-bold text-slate-700 group-hover:text-rose-700">{p.title}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.1}} className="bg-white rounded-3xl p-8 shadow-md border border-slate-100">
            <textarea value={text} onChange={e=>setText(e.target.value)}
              placeholder="描述你当下的心情、困境或选择..."
              className="w-full min-h-[100px] bg-slate-50 rounded-2xl p-5 text-slate-800 placeholder:text-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all text-sm leading-relaxed"
            />
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100">
              <span className="text-xs text-slate-400">{text.length} 字</span>
              <button onClick={()=>handleAnalyze(text)} disabled={!text.trim()||loading}
                className="flex items-center gap-2 px-8 py-3 rounded-xl text-white font-bold text-sm bg-gradient-to-r from-indigo-500 to-violet-600 shadow-md hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100"
              >
                {loading?<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>分析中...</>
                :<><Send size={16}/> 开始分析</>}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    )
  }

  // ===== 结果页：三栏对比 =====
  const hasLlm = llmResult && !llmResult.ranking?.length === false

  return (
    <div className="min-h-screen pt-20 pb-16 bg-gradient-to-b from-white via-slate-50 to-blue-50/30">
      <div className="max-w-[2000px] mx-auto px-4">
        {/* 标题行 */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <div className="text-[10px] text-indigo-500 font-bold mb-1">智能理解 · v4.2</div>
            <h2 className="text-xl font-black text-slate-900">三级对比分析</h2>
          </div>
          <div className="mb-4"><LlmStatusBadge status={llmConfigStatus} onRefresh={refreshLlmConfig} /></div>
          <button onClick={()=>{setKwResult(null);setDpuResult(null);setLlmResult(null);setTrace(null)}}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-600 font-semibold hover:bg-slate-50"
          >← 重新分析</button>
        </div>

        {/* 输入摘要 */}
        <div className="mb-5 p-3 rounded-xl bg-white border border-slate-200 shadow-sm">
          <div className="text-[10px] text-slate-400 mb-1">输入文本 · {text.length}字</div>
          <div className="text-sm text-slate-700 leading-relaxed">{text.length>200?text.slice(0,200)+'...':text}</div>
        </div>

        {/* ============================================================ */}
        {/* 三栏对比 */}
        {/* ============================================================ */}
        <div className="grid lg:grid-cols-3 gap-3 mb-8">
          {/* ---- 栏 1：纯关键词 ---- */}
          <ResultColumn
            title="纯关键词匹配"
            subtitle="前端本地 · 子串扫描"
            icon={<Cpu size={14} className="text-amber-500"/>}
            badge="Lv.1 BASELINE"
            badgeColor="amber"
            theme="amber"
            data={kwResult}
            act12={null}
            trace={null}
            notes={[
              { icon: <Lightbulb size={10}/>, text: '子串假阳性："不累"也会匹配"累"' },
              { icon: <Lightbulb size={10}/>, text: '压制判断用随机数模拟' },
              { icon: <Lightbulb size={10}/>, text: '无语义等价理解：不知道"快饿死了"="饿"' },
            ]}
          />

          {/* ---- 栏 2：DPU 引擎 ---- */}
          <ResultColumn
            title="DPU 引擎"
            subtitle="后端本地 · 语义向量 + 4步势能（因语义向量库数据量较少，尚无法做到大模型级别的精准语义理解）"
            icon={<Brain size={14} className="text-indigo-500"/>}
            badge="Lv.2 DPU CORE"
            badgeColor="indigo"
            theme="indigo"
            data={dpuResult}
            act12={dpuAct12}
            trace={null}
            notes={[
              { icon: <TrendingUp size={10}/>, text: '语义向量替代子串匹配，消除假阳性' },
              { icon: <TrendingUp size={10}/>, text: '精确势能计算 + 马斯洛层级压制' },
              { icon: <TrendingUp size={10}/>, text: '不依赖 LLM API Key，纯数学管道' },
            ]}
          />

          {/* ---- 栏 3：LLM+DPU ---- */}
          <ResultColumn
            title="LLM + DPU"
            subtitle="LLM语义提取 + 全引擎（大模型先做语义理解 → 交给DPU计算 → DPU返回结果 → 大模型生成文本）"
            icon={<Bot size={14} className="text-violet-500"/>}
            badge="Lv.3 完整版"
            badgeColor="violet"
            theme="violet"
            data={llmResult}
            act12={llmAct12}
            trace={null}
            notes={[
              { icon: <TrendingUp size={10}/>, text: 'LLM 将口语化表达翻译为标准信号词' },
              { icon: <TrendingUp size={10}/>, text: '"你总是不认真听我说话" → 识别到情感需求' },
              { icon: <TrendingUp size={10}/>, text: '最准确的语义理解，最强效果' },
            ]}
            llmStatus={llmStatus}
          />
        </div>

        {/* ============================================================ */}
        {/* 12维对比表格 */}
        {/* ============================================================ */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-8">
          <h3 className="text-base font-black text-slate-900 mb-1">📊 12维激活值对比</h3>
          <p className="text-xs text-slate-500 mb-5">同一段话，三级分析方式，同一套12维需求体系</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 font-bold text-slate-600 w-[100px]">需求维度</th>
                  <th className="text-center py-2 font-bold text-amber-600 w-[80px]">关键词</th>
                  <th className="text-center py-2 font-bold text-indigo-600 w-[80px]">DPU引擎</th>
                  <th className="text-center py-2 font-bold text-violet-600 w-[80px]">LLM+DPU</th>
                  <th className="text-left py-2 font-bold text-slate-600 w-[140px]">逐级变化</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({length:12},(_,i)=>{
                  const kv = kwResult?.ranking?.find((r:any)=>r.needId===i)?.potential||0
                  const dv = dpuResult?.ranking?.find((r:any)=>r.needId===i)?.potential||0
                  const lv = llmResult?.ranking?.find((r:any)=>r.needId===i)?.potential||0
                  // 逐级改善检测
                  const kwDpu = dv - kv
                  const dpuLlm = lv - dv
                  const trend: string[] = []
                  if (kv===0 && dv>0) trend.push('DPU独有识别')
                  else if (kv>0 && dv===0) trend.push('关键词假阳性')
                  if (dpuLlm > 0.06) trend.push('LLM增强')
                  if (Math.abs(kwDpu) > 0.06 || Math.abs(dpuLlm) > 0.06) {
                    // significant change
                  }
                  const sig = trend.length > 0
                  return (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2 font-semibold text-slate-700">{NEED_NAMES[i]}</td>
                      <td className="py-2 text-center font-mono" style={{color: kv>0.05?NEED_COLORS[i]:'#cbd5e1'}}>{(kv*100).toFixed(0)}%</td>
                      <td className="py-2 text-center font-mono font-bold" style={{color: dv>0.05?NEED_COLORS[i]:'#cbd5e1'}}>{(dv*100).toFixed(0)}%</td>
                      <td className="py-2 text-center font-mono font-bold" style={{color: lv>0.05?NEED_COLORS[i]:'#cbd5e1'}}>{(lv*100).toFixed(0)}%</td>
                      <td className={`py-2 text-[10px] ${sig?'text-indigo-600 font-semibold':'text-slate-400'}`}>
                        {trend.length>0?trend.join(' · '):'—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ============================================================ */}
        {/* 推理路径追踪 */}
        {/* ============================================================ */}
        {trace && (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-8">
            <h3 className="text-base font-black text-slate-900 mb-1 flex items-center gap-2">
              <GitBranch size={16} className="text-indigo-500"/> 推理路径追踪
            </h3>
            <p className="text-xs text-slate-500 mb-5">仅 DPU 引擎可提供。展示需求信号如何通过 12×12 关联矩阵传导激活。</p>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <div className="text-[11px] font-bold text-slate-600 mb-2">根激活节点</div>
                {(trace.nodes||[]).filter((n:any)=>n.node_type==='root').map((n:any)=>(
                  <div key={n.need_id} className="flex items-center gap-2 p-2 rounded-lg bg-indigo-50/50 mb-1 text-xs">
                    <span className="w-2 h-2 rounded-full" style={{background:NEED_COLORS[n.need_id]}}/>
                    <span className="font-bold text-slate-700">{n.need_name}</span>
                    <span className="ml-auto text-indigo-500 font-mono text-[10px]">{(n.value*100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-600 mb-2">传导激活节点</div>
                {(trace.nodes||[]).filter((n:any)=>n.node_type!=='root').slice(0,6).map((n:any)=>(
                  <div key={`${n.need_id}-${n.layer}`} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 mb-1 text-xs">
                    <span className="text-slate-400">→</span>
                    <span className="font-bold text-slate-600">{n.need_name}</span>
                    <span className="ml-auto text-slate-400 font-mono text-[10px]">L{n.layer} {(n.value*100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* 方法论 */}
        {/* ============================================================ */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <h3 className="text-base font-black text-slate-900 mb-5">🔬 三级分析管线</h3>
          <div className="flex items-center gap-3 flex-wrap">
            <MethodCard step="01" title="语义提取" desc="LLM将口语表达翻译为标准信号词" icon={Bot} color="violet"/>
            <span className="text-slate-300 text-xl">→</span>
            <MethodCard step="02" title="向量匹配" desc="语义向量替代关键词子串扫描" icon={Brain} color="indigo"/>
            <span className="text-slate-300 text-xl">→</span>
            <MethodCard step="03" title="4步势能+压制" desc="意图门控→耦合→最终势能+层级压制" icon={BarChart3} color="indigo"/>
            <span className="text-slate-300 text-xl">→</span>
            <MethodCard step="04" title="冲突仲裁" desc="12×12矩阵检测互斥+三层仲裁" icon={Shield} color="indigo"/>
            <span className="text-slate-300 text-xl">→</span>
            <MethodCard step="05" title="推理路径" desc="完整传导路径可追溯、可解释" icon={GitBranch} color="indigo"/>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 单个结果栏
// ============================================================
function ResultColumn({ title, subtitle, icon, badge, badgeColor, theme, data, act12, trace, notes, llmStatus: llmSt }: {
  title: string; subtitle: string; icon: React.ReactNode; badge: string; badgeColor: string; theme: string;
  data: any; act12: number[] | null; trace: any; notes: { icon: React.ReactNode; text: string }[]; llmStatus?: string;
}) {
  const bgMap: Record<string,string> = { amber:'bg-amber-50/60', indigo:'bg-indigo-50/60', violet:'bg-violet-50/60' }
  const borderMap: Record<string,string> = { amber:'border-amber-200', indigo:'border-indigo-200', violet:'border-violet-200' }
  const textMap: Record<string,string> = { amber:'text-amber-800', indigo:'text-indigo-800', violet:'text-violet-800' }
  const subMap: Record<string,string> = { amber:'text-amber-600', indigo:'text-indigo-600', violet:'text-violet-600' }
  const badgeBg: Record<string,string> = { amber:'bg-amber-100 text-amber-700', indigo:'bg-indigo-100 text-indigo-700', violet:'bg-violet-100 text-violet-700' }

  if (llmSt === 'no_key' || llmSt === 'error') {
    return (
      <div className={`rounded-2xl bg-white border ${borderMap[badgeColor]} shadow-sm overflow-hidden`}>
        <div className={`px-4 py-3 ${bgMap[badgeColor]} border-b ${borderMap[badgeColor]} flex items-center gap-2`}>
          {icon}
          <div className="flex-1"><div className={`text-sm font-bold ${textMap[badgeColor]}`}>{title}</div><div className={`text-[10px] ${subMap[badgeColor]}`}>{subtitle}</div></div>
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${badgeBg[badgeColor]}`}>{badge}</span>
        </div>
        <div className="p-5 text-center">
          <Bot size={32} className="text-slate-200 mx-auto mb-3"/>
          {llmSt === 'error' ? (
            <p className="text-sm font-bold text-rose-600 mb-1">LLM 调用失败</p>
          ) : (
            <p className="text-sm font-bold text-slate-600 mb-1">需要 API Key</p>
          )}
          <p className="text-xs text-slate-400">在 <b>/models</b> 页面填写通义千问或 DeepSeek 的 API Key 后即可启用此模式</p>
        </div>
      </div>
    )
  }
  if (llmSt === 'waiting' && !data?.ranking) {
    return (
      <div className={`rounded-2xl bg-white border ${borderMap[badgeColor]} shadow-sm overflow-hidden`}>
        <div className={`px-4 py-3 ${bgMap[badgeColor]} border-b ${borderMap[badgeColor]} flex items-center gap-2`}>
          {icon}
          <div className="flex-1"><div className={`text-sm font-bold ${textMap[badgeColor]}`}>{title}</div><div className={`text-[10px] ${subMap[badgeColor]}`}>{subtitle}</div></div>
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${badgeBg[badgeColor]}`}>{badge}</span>
        </div>
        <div className="p-5 text-center">
          <div className="w-6 h-6 border-2 border-violet-300 border-t-transparent rounded-full animate-spin mx-auto mb-2"/>
          <p className="text-xs text-slate-400">等待 LLM 分析...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-2xl bg-white border ${borderMap[badgeColor]} shadow-sm overflow-hidden`}>
      <div className={`px-4 py-3 ${bgMap[badgeColor]} border-b ${borderMap[badgeColor]} flex items-center gap-2`}>
        {icon}
        <div className="flex-1"><div className={`text-sm font-bold ${textMap[badgeColor]}`}>{title}</div><div className={`text-[10px] ${subMap[badgeColor]}`}>{subtitle}</div></div>
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${badgeBg[badgeColor]}`}>{badge}</span>
      </div>
      <div className="p-4">
        {data?.ranking?.length ? (
          <>
            {act12 && <div className="mb-3"><SimpleRadar act12={act12} maxW={240}/></div>}
            {data.ranking.slice(0,6).map((r:any,i:number)=>(
              <NeedBar key={i} needId={r.needId} value={r.potential} rank={i+1} suppressed={r.suppressed} small/>
            ))}
            {data.signals?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-1">
                <span className="text-[9px] text-slate-400">信号词：</span>
                {data.signals.slice(0,5).map((s:string,j:number)=>(
                  <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-medium">{s}</span>
                ))}
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="text-[10px] font-bold text-slate-500 mb-2">评估</div>
              {notes.map((n,i)=>(
                <div key={i} className="flex items-start gap-1.5 mb-1 text-[10px] text-slate-500">
                  <span className="mt-px flex-shrink-0">{n.icon}</span>
                  <span>{n.text}</span>
                </div>
              ))}
            </div>
          </>
        ) : data?.empty ? (
          <div className="text-center py-6 text-xs text-slate-400">
            <Cpu size={24} className="mx-auto mb-2 text-slate-200"/>
            <p className="font-semibold text-amber-600">关键词库无匹配</p>
            <p className="mt-1">这句话的表达超出了关键词覆盖范围</p>
            <p className="text-slate-400 mt-0.5">这正是 DPU+LLM 要解决的问题</p>
          </div>
        ) : data?.error ? (
          <div className="text-center py-6 text-xs text-slate-400">
            <Brain size={24} className="mx-auto mb-2 text-slate-200"/>
            <p className="font-semibold text-rose-500">{data.error}</p>
          </div>
        ) : (
          <div className="text-center py-6 text-xs text-slate-400">等待分析...</div>
        )}
      </div>
    </div>
  )
}

function MethodCard({ step, title, desc, icon:Icon, color }: { step:string; title:string; desc:string; icon:any; color:string }) {
  return (
    <div className="p-4 rounded-2xl bg-slate-50 text-center" style={{minWidth:120,flex:'1 1 120px'}}>
      <div className="text-[10px] font-black text-indigo-500 mb-2">STEP {step}</div>
      <Icon size={18} className="mx-auto mb-1.5" style={{color}}/>
      <div className="font-bold text-slate-800 text-xs mb-1">{title}</div>
      <div className="text-[10px] text-slate-500 leading-relaxed">{desc}</div>
    </div>
  )
}
