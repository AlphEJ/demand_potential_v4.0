import { useEffect, useRef, useMemo } from 'react'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  opacity: number
  hue: number
  type: 'droplet' | 'particle' | 'wave'
}

export function DynamicBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const animationIdRef = useRef<number | null>(null)

  const particles = useMemo(() => {
    const p: Particle[] = []
    // 创建水滴效果
    for (let i = 0; i < 15; i++) {
      p.push({
        x: Math.random() * 1200,
        y: Math.random() * 800 + 800,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -Math.random() * 0.8 - 0.3,
        radius: Math.random() * 8 + 4,
        opacity: Math.random() * 0.4 + 0.1,
        hue: 190 + Math.random() * 30,
        type: 'droplet',
      })
    }
    // 创建漂浮粒子
    for (let i = 0; i < 30; i++) {
      p.push({
        x: Math.random() * 1200,
        y: Math.random() * 800,
        vx: (Math.random() - 0.5) * 0.2,
        vy: Math.sin(i) * 0.15 - 0.1,
        radius: Math.random() * 3 + 1,
        opacity: Math.random() * 0.3 + 0.1,
        hue: 200 + Math.random() * 40,
        type: 'particle',
      })
    }
    // 创建波纹效果
    for (let i = 0; i < 8; i++) {
      p.push({
        x: Math.random() * 1200,
        y: Math.random() * 800,
        vx: 0,
        vy: 0,
        radius: Math.random() * 30 + 20,
        opacity: Math.random() * 0.15 + 0.05,
        hue: 205,
        type: 'wave',
      })
    }
    return p
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      ctx.scale(dpr, dpr)
    }

    resize()
    window.addEventListener('resize', resize)

    particlesRef.current = particles

    const timeRef = { value: 0 }

    const render = () => {
      timeRef.value += 0.008
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)

      // 背景渐变
      const bgGradient = ctx.createLinearGradient(0, 0, 0, window.innerHeight)
      bgGradient.addColorStop(0, 'rgba(248, 250, 252, 1)')
      bgGradient.addColorStop(0.5, 'rgba(239, 246, 255, 0.8)')
      bgGradient.addColorStop(1, 'rgba(207, 226, 255, 0.5)')
      ctx.fillStyle = bgGradient
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight)

      // 光晕效果
      const haloGradient = ctx.createRadialGradient(
        window.innerWidth * 0.5,
        window.innerHeight * 0.3,
        0,
        window.innerWidth * 0.5,
        window.innerHeight * 0.3,
        window.innerHeight * 0.6
      )
      haloGradient.addColorStop(0, 'rgba(59, 130, 246, 0.15)')
      haloGradient.addColorStop(0.4, 'rgba(59, 130, 246, 0.08)')
      haloGradient.addColorStop(1, 'rgba(59, 130, 246, 0)')
      ctx.fillStyle = haloGradient
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight)

      particlesRef.current.forEach((p) => {
        if (p.type === 'droplet') {
          // 水滴上升效果
          p.x += p.vx + Math.sin(timeRef.value + p.x * 0.01) * 0.5
          p.y += p.vy

          // 重置到底部
          if (p.y < -20) {
            p.y = window.innerHeight + 20
            p.x = Math.random() * window.innerWidth
          }

          // 绘制水滴
          const gradient = ctx.createRadialGradient(
            p.x - p.radius * 0.3,
            p.y - p.radius * 0.3,
            0,
            p.x,
            p.y,
            p.radius
          )
          gradient.addColorStop(0, `hsla(${p.hue}, 80%, 90%, ${p.opacity})`)
          gradient.addColorStop(0.5, `hsla(${p.hue}, 70%, 70%, ${p.opacity * 0.8})`)
          gradient.addColorStop(1, `hsla(${p.hue}, 60%, 50%, 0)`)

          ctx.beginPath()
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
          ctx.fillStyle = gradient
          ctx.fill()

          // 水滴高光
          ctx.beginPath()
          ctx.arc(p.x - p.radius * 0.3, p.y - p.radius * 0.3, p.radius * 0.3, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity * 0.6})`
          ctx.fill()
        } else if (p.type === 'particle') {
          // 漂浮粒子
          p.x += p.vx + Math.sin(timeRef.value + p.x * 0.02) * 0.2
          p.y += p.vy + Math.cos(timeRef.value + p.y * 0.02) * 0.15

          // 边界检测
          if (p.x < 0) p.x = window.innerWidth
          if (p.x > window.innerWidth) p.x = 0
          if (p.y < 0) p.y = window.innerHeight
          if (p.y > window.innerHeight) p.y = 0

          // 绘制粒子
          const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius)
          gradient.addColorStop(0, `hsla(${p.hue}, 70%, 70%, ${p.opacity})`)
          gradient.addColorStop(1, `hsla(${p.hue}, 70%, 50%, 0)`)

          ctx.beginPath()
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
          ctx.fillStyle = gradient
          ctx.fill()
        } else if (p.type === 'wave') {
          // 波纹效果
          const pulseRadius = p.radius + Math.sin(timeRef.value * 2 + p.hue) * 5
          const pulseOpacity = p.opacity * (0.5 + Math.sin(timeRef.value * 2 + p.hue) * 0.5)

          ctx.beginPath()
          ctx.arc(p.x, p.y, pulseRadius, 0, Math.PI * 2)
          ctx.strokeStyle = `hsla(${p.hue}, 60%, 60%, ${pulseOpacity})`
          ctx.lineWidth = 2
          ctx.stroke()

          ctx.beginPath()
          ctx.arc(p.x, p.y, pulseRadius * 1.5, 0, Math.PI * 2)
          ctx.strokeStyle = `hsla(${p.hue}, 60%, 60%, ${pulseOpacity * 0.5})`
          ctx.lineWidth = 1
          ctx.stroke()
        }
      })

      // 添加网格线效果
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.04)'
      ctx.lineWidth = 1
      const gridSize = 50
      for (let x = 0; x < window.innerWidth; x += gridSize) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, window.innerHeight)
        ctx.stroke()
      }
      for (let y = 0; y < window.innerHeight; y += gridSize) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(window.innerWidth, y)
        ctx.stroke()
      }

      animationIdRef.current = requestAnimationFrame(render)
    }

    render()

    return () => {
      window.removeEventListener('resize', resize)
      if (animationIdRef.current !== null) {
        cancelAnimationFrame(animationIdRef.current)
      }
    }
  }, [particles])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 0.9 }}
    />
  )
}