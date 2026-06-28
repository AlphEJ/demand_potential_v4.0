import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { DynamicBackground } from './components/DynamicBackground'
import { HomePage } from './pages/Home'
import { UnderstandPage } from './pages/Understand'
import { PotentialPage } from './pages/Potential'
import { ArchitecturePage } from './pages/Architecture'
import { AgentPage } from './pages/Agent'
import { MemoryPage } from './pages/Memory'
import { ModelsPage } from './pages/Models'
import { InsightPage } from './pages/Insight'
import { ShowoffPage } from './pages/Showoff'
import NeedLabPage from './pages/NeedLab'

// ============================================================
// 旧系统布局（科技风）
// 包含：DynamicBackground + Navbar + 路由
// ============================================================
function OldLayout() {
  return (
    <>
      <DynamicBackground />
      <div className="min-h-screen relative z-10">
        <Navbar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/needlab" element={<NeedLabPage />} />
          <Route path="/understand" element={<UnderstandPage />} />
          <Route path="/potential" element={<PotentialPage />} />
          <Route path="/architecture" element={<ArchitecturePage />} />
          <Route path="/agent" element={<AgentPage />} />
          <Route path="/memory" element={<MemoryPage />} />
          <Route path="/models" element={<ModelsPage />} />
          <Route path="/insight" element={<InsightPage />} />
          <Route path="/showoff" element={<ShowoffPage />} />
        </Routes>
      </div>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<OldLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/needlab" element={<NeedLabPage />} />
          <Route path="/understand" element={<UnderstandPage />} />
          <Route path="/potential" element={<PotentialPage />} />
          <Route path="/architecture" element={<ArchitecturePage />} />
          <Route path="/agent" element={<AgentPage />} />
          <Route path="/memory" element={<MemoryPage />} />
          <Route path="/models" element={<ModelsPage />} />
          <Route path="/insight" element={<InsightPage />} />
          <Route path="/showoff" element={<ShowoffPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
