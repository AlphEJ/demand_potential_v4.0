// ============================================================
// NeedLab 布局 — 全屏暗色、无导航栏
// ============================================================
import { Outlet } from 'react-router-dom'

export function NeedLabLayout() {
  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      background: '#0a0a0f', color: '#e2e8f0',
    }}>
      <Outlet />
    </div>
  )
}
