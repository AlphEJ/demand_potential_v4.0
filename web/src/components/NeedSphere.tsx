import { useEffect, useRef, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { NEEDS, NEED_COLORS } from '@/data/needs'

interface NeedPosition {
  x: number
  y: number
  z: number
  baseX: number
  baseY: number
  baseZ: number
  intensity: number
}

interface Props {
  activeNeeds?: number[]        // 简化版：布尔型激活列表
  needsState?: number[]         // 完整版：12 维浮点数（0-1）
  onNeedHover?: (id: number | null) => void
  size?: number
}

export function NeedSphere({
  activeNeeds = [],
  needsState,
  onNeedHover,
  size = 520,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const particlesRef = useRef<
    { x: number; y: number; z: number; vx: number; vy: number; vz: number }[]
  >([])
  const needPositionsRef = useRef<NeedPosition[]>([])
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 })
  const animationIdRef = useRef<number | null>(null)
  const hoveredIdRef = useRef<number | null>(null)

  // 根据 needsState 计算每个需求的激活强度（0-1）
  const needIntensities = useMemo(() => {
    if (needsState && needsState.length === 12) {
      return needsState.map(v => Math.max(0, Math.min(1, v)))
    }
    // 回退到 activeNeeds 布尔模式
    const result = new Array(12).fill(0)
    activeNeeds.forEach(id => {
      if (id >= 0 && id < 12) result[id] = 1
    })
    return result
  }, [needsState, activeNeeds])

  const needIntensitiesRef = useRef(needIntensities)
  needIntensitiesRef.current = needIntensities

  const activeSet = useMemo(() => {
    return new Set(needIntensities.map((v, i) => (v > 0.15 ? i : -1)).filter(i => i >= 0))
  }, [needIntensities])
  const activeSetRef = useRef(activeSet)
  activeSetRef.current = activeSet

  // 同步 hoveredId 到 ref
  useEffect(() => {
    hoveredIdRef.current = hoveredId
  }, [hoveredId])

  // 初始化12个需求的位置（只在 size 变化时执行）
  useEffect(() => {
    const positions: NeedPosition[] = []
    const radius = size * 0.32
    const numPoints = 12
    for (let i = 0; i < numPoints; i++) {
      const phi = Math.acos(-1 + (2 * i) / numPoints)
      const theta = Math.sqrt(numPoints * Math.PI) * phi

      const x = radius * Math.cos(theta) * Math.sin(phi)
      const y = radius * Math.sin(theta) * Math.sin(phi)
      const z = radius * Math.cos(phi)

      positions.push({ x, y, z, baseX: x, baseY: y, baseZ: z, intensity: 0 })
    }

    const particles: {
      x: number
      y: number
      z: number
      vx: number
      vy: number
      vz: number
    }[] = []
    for (let i = 0; i < 80; i++) {
      const phi = Math.random() * Math.PI * 2
      const costh = Math.random() * 2 - 1
      const sinth = Math.sqrt(1 - costh * costh)
      const r = radius * (0.5 + Math.random() * 0.5)

      particles.push({
        x: r * sinth * Math.cos(phi),
        y: r * sinth * Math.sin(phi),
        z: r * costh,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        vz: (Math.random() - 0.5) * 0.15,
      })
    }

    needPositionsRef.current = positions
    particlesRef.current = particles
  }, [size])

  // 动画循环（只依赖 size，内部通过 ref 读取其他状态）
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    ctx.scale(dpr, dpr)

    let rotationX = 0.002
    let rotationY = 0.004

    const render = () => {
      ctx.clearRect(0, 0, size, size)
      const cx = size / 2
      const cy = size / 2

      // 更新鼠标
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.05
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.05

      // 中心光晕 - 根据整体激活强度调整
      const totalIntensity = needIntensitiesRef.current.reduce((a, b) => a + b, 0)
      const centerGlow = 0.08 + Math.min(0.3, totalIntensity * 0.05)
      const haloGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.45)
      haloGradient.addColorStop(0, `rgba(59, 130, 246, ${centerGlow.toFixed(2)})`)
      haloGradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.04)')
      haloGradient.addColorStop(1, 'rgba(59, 130, 246, 0)')
      ctx.fillStyle = haloGradient
      ctx.fillRect(0, 0, size, size)

      // 背景粒子
      particlesRef.current.forEach(p => {
        p.x += p.vx
        p.y += p.vy
        p.z += p.vz

        const dist = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z)
        const maxR = size * 0.38
        if (dist > maxR) {
          p.vx *= -1
          p.vy *= -1
          p.vz *= -1
        }

        const cosY = Math.cos(rotationY * 0.3)
        const sinY = Math.sin(rotationY * 0.3)
        const rx = p.x * cosY - p.z * sinY
        const rz = p.x * sinY + p.z * cosY

        const scale = 400 / (400 + rz)
        const px = cx + rx * scale + mouseRef.current.x * 0.02 * scale
        const py = cy + p.y * scale + mouseRef.current.y * 0.02 * scale

        const alpha = 0.15 + scale * 0.25
        ctx.fillStyle = `rgba(59, 130, 246, ${alpha})`
        ctx.beginPath()
        ctx.arc(px, py, 1.2 * scale, 0, Math.PI * 2)
        ctx.fill()
      })

      // 12 个需求节点（带动态强度）
      needPositionsRef.current.forEach((pos, id) => {
        const cosY = Math.cos(rotationY)
        const sinY = Math.sin(rotationY)
        const cosX = Math.cos(rotationX)
        const sinX = Math.sin(rotationX)

        let x = pos.baseX * cosY - pos.baseZ * sinY
        let z = pos.baseX * sinY + pos.baseZ * cosY
        let y = pos.baseY

        const y2 = y * cosX - z * sinX
        const z2 = y * sinX + z * cosX
        y = y2
        z = z2

        x += mouseRef.current.x * 0.05
        y += mouseRef.current.y * 0.05

        const scale = 400 / (400 + z)
        const px = cx + x * scale
        const py = cy + y * scale

        pos.x = px
        pos.y = py
        pos.z = z

        const intensity = needIntensitiesRef.current[id] || 0
        const isActive = intensity > 0.15
        const isHovered = hoveredIdRef.current === id
        const depth = (z + size * 0.35) / (size * 0.7)

        // 动态的光环和发光强度
        if (isActive || isHovered) {
          const glowBase = isHovered ? 1.2 : intensity
          const glowRadius = (14 + glowBase * 14) * scale
          const glowColor = NEED_COLORS[id]
          const glowGrad = ctx.createRadialGradient(px, py, 0, px, py, glowRadius * 2)
          glowGrad.addColorStop(0, `${glowColor}${Math.min(99, Math.floor(40 + intensity * 60)).toString(16).padStart(2, '0')}`)
          glowGrad.addColorStop(0.5, `${glowColor}22`)
          glowGrad.addColorStop(1, 'transparent')
          ctx.fillStyle = glowGrad
          ctx.beginPath()
          ctx.arc(px, py, glowRadius * 2, 0, Math.PI * 2)
          ctx.fill()
        }

        const baseRadius = isHovered ? 7 : isActive ? 5 + intensity * 3 : 3.5
        const radius = baseRadius * scale
        const needColor = NEED_COLORS[id]

        ctx.strokeStyle = `${needColor}88`
        ctx.lineWidth = 1.5 * scale
        ctx.beginPath()
        ctx.arc(px, py, radius + 2 * scale, 0, Math.PI * 2)
        ctx.stroke()

        const mainGrad = ctx.createRadialGradient(
          px - radius * 0.3,
          py - radius * 0.3,
          0,
          px,
          py,
          radius,
        )
        mainGrad.addColorStop(0, '#ffffff')
        mainGrad.addColorStop(0.4, needColor)
        mainGrad.addColorStop(1, needColor)
        ctx.fillStyle = mainGrad
        ctx.globalAlpha = 0.55 + depth * 0.45
        ctx.beginPath()
        ctx.arc(px, py, radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1

        // 脉冲效果（根据激活强度）
        if (isActive) {
          const time = Date.now() * 0.002
          const pulsePower = 2 + intensity * 6
          const pulseR = radius + pulsePower + Math.sin(time + id) * 2
          ctx.strokeStyle = `${needColor}${Math.floor(55 + intensity * 100).toString(16).padStart(2, '0')}`
          ctx.lineWidth = 1.5 * scale
          ctx.beginPath()
          ctx.arc(px, py, pulseR * scale, 0, Math.PI * 2)
          ctx.stroke()
        }
      })

      // 连接线
      const sortedPositions = needPositionsRef.current
        .map((p, i) => ({ ...p, id: i }))
        .sort((a, b) => a.z - b.z)

      for (let i = 0; i < sortedPositions.length; i++) {
        for (let j = i + 1; j < sortedPositions.length; j++) {
          const a = sortedPositions[i]
          const b = sortedPositions[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < size * 0.35) {
            const alpha = (1 - dist / (size * 0.35)) * 0.12
            ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`
            ctx.lineWidth = 0.8
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      rotationY += 0.0025
      rotationX += 0.0008

      animationIdRef.current = requestAnimationFrame(render)
    }

    render()

    return () => {
      if (animationIdRef.current !== null) {
        cancelAnimationFrame(animationIdRef.current)
      }
    }
  }, [size])

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left - size / 2
    const my = e.clientY - rect.top - size / 2
    mouseRef.current.targetX = mx
    mouseRef.current.targetY = my

    let found: number | null = null
    for (let i = 0; i < needPositionsRef.current.length; i++) {
      const p = needPositionsRef.current[i]
      const dx = p.x - (size / 2 + mx * 0.05)
      const dy = p.y - (size / 2 + my * 0.05)
      if (Math.sqrt(dx * dx + dy * dy) < 18) {
        found = i
        break
      }
    }
    if (found !== hoveredId) {
      setHoveredId(found)
      onNeedHover?.(found)
    }
  }

  const handleMouseLeave = () => {
    mouseRef.current.targetX = 0
    mouseRef.current.targetY = 0
    setHoveredId(null)
    onNeedHover?.(null)
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full hero-halo pointer-events-none"
        style={{ filter: 'blur(20px)' }}
      />
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          inset: '10%',
          background:
            'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4) 0%, transparent 60%)',
        }}
      />
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative cursor-pointer"
      />
      <AnimatePresence>
        {hoveredId !== null && (
          <motion.div
            key={`hover-${hoveredId}-${needIntensities[hoveredId].toFixed(2)}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap"
          >
            <div
              className="glass-card px-4 py-2 text-sm font-medium flex items-center gap-2"
              style={{ color: NEED_COLORS[hoveredId] }}
            >
              <span>D{hoveredId + 1} · {NEEDS[hoveredId].name}</span>
              {needsState && (
                <span className="text-xs opacity-70">
                  激活 {(needIntensities[hoveredId] * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
