// ============================================================
// 12维需求雷达图 + 进度条组件 — 亮色调
// ============================================================
import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { NEED_NAMES_CN, NEED_COLORS } from './types'

export function NeedRadar({ activation12, prevActivation, suppressed, height = 280 }: {
  activation12: number[]; prevActivation?: number[]; suppressed: string[]; height?: number
}) {
  const option = useMemo(() => {
    const indicators = Array.from({ length: 12 }, (_, i) => ({
      name: NEED_NAMES_CN[i],
      max: 1.0,
    }))
    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const values = params.value
          let html = `<div style="font-weight:bold;margin-bottom:6px;">${params.name}</div>`
          indicators.forEach((ind, i) => {
            const v = values[i]
            const pct = (v * 100).toFixed(1)
            html += `<div style="display:flex;justify-content:space-between;gap:16px;font-size:11px;">
              <span>${ind.name}</span>
              <span style="font-weight:bold;color:#6366f1;">${pct}%</span>
            </div>`
          })
          return html
        }
      },
      radar: {
        indicator: indicators,
        center: ['50%', '50%'],
        radius: '72%',
        shape: 'polygon' as const,
        splitNumber: 5,
        axisName: {
          color: '#475569',
          fontSize: 11,
          fontWeight: 'bold',
        },
        splitArea: {
          areaStyle: {
            color: [
              'rgba(59,130,246,0.02)',
              'rgba(59,130,246,0.04)',
              'rgba(59,130,246,0.06)',
              'rgba(59,130,246,0.08)',
              'rgba(59,130,246,0.10)',
            ]
          }
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(59,130,246,0.15)',
            width: 1,
          }
        },
        axisLine: {
          lineStyle: {
            color: 'rgba(59,130,246,0.25)',
            width: 1.5,
          }
        },
      },
      series: [
        {
          type: 'radar' as const,
          data: [{ value: activation12, name: '当前势能' }],
          symbol: 'circle',
          symbolSize: 7,
          areaStyle: {
            color: {
              type: 'radial' as const,
              x: 0.5, y: 0.5, r: 0.5,
              colorStops: [
                { offset: 0, color: 'rgba(99,102,241,0.45)' },
                { offset: 1, color: 'rgba(59,130,246,0.1)' }
              ]
            }
          },
          lineStyle: {
            color: '#6366f1',
            width: 2.5,
            shadowColor: 'rgba(99,102,241,0.5)',
            shadowBlur: 8,
          },
          itemStyle: {
            color: '#818cf8',
            borderColor: '#fff',
            borderWidth: 2,
            shadowColor: 'rgba(99,102,241,0.6)',
            shadowBlur: 6,
          },
        },
        ...(prevActivation ? [{
          type: 'radar' as const,
          data: [{ value: prevActivation, name: '上一轮' }],
          symbol: 'none' as const,
          areaStyle: { opacity: 0 },
          lineStyle: {
            color: 'rgba(148,163,184,0.4)',
            width: 1.5,
            type: 'dashed' as const,
          },
          itemStyle: { opacity: 0 },
          silent: true,
        }] : []),
      ],
    }
  }, [activation12, prevActivation, suppressed])

  return <ReactECharts option={option} style={{ height, width: '100%' }} opts={{ renderer: 'canvas' }} notMerge />
}

// 水平进度条
export function NeedBars({ activation12, topN = 5 }: { activation12: number[]; topN?: number }) {
  const ranked = activation12
    .map((v, i) => ({ id: i, name: NEED_NAMES_CN[i], value: v, color: NEED_COLORS[i] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, topN)

  return (
    <div className="flex flex-col gap-2.5">
      {ranked.map((n, idx) => (
        <div key={n.id} className="flex items-center gap-3">
          <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-black text-white shadow-sm"
            style={{ background: n.color }}>
            {idx + 1}
          </div>
          <span className="w-[60px] text-xs text-slate-600 font-semibold flex-shrink-0 truncate">{n.name}</span>
          <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden shadow-inner">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${Math.min(100, n.value * 100)}%`,
                background: `linear-gradient(90deg, ${n.color}, ${n.color}aa)`,
                boxShadow: `0 0 8px ${n.color}40`,
              }}
            />
          </div>
          <span className="w-10 text-xs text-slate-500 text-right font-mono font-semibold">
            {(n.value * 100).toFixed(0)}%
          </span>
        </div>
      ))}
    </div>
  )
}
