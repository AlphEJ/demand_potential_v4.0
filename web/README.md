# DPU · 需求势能引擎前端

基于 React + TypeScript + Tailwind CSS + Framer Motion + ECharts 构建的商业级前端界面。

## 设计理念

- **浅色玻璃拟态**（Glassmorphism）：清爽、柔和、专业感
- **12维需求粒子球体**：Canvas 绘制的交互式可视化核心
- **微动效 + 滚动触发动画**：Framer Motion 驱动的流畅交互
- **可解释的算法可视化**：让复杂的势能计算过程直观可见

## 技术栈

- **React 18** + **TypeScript 5**：类型安全的现代前端
- **Vite**：极速开发体验
- **Tailwind CSS**：原子化 CSS + 自定义主题
- **Framer Motion**：流畅动画
- **ECharts**：数据可视化（雷达图、热力图、柱状图）
- **Canvas API**：3D 需求粒子球体
- **Lucide React**：统一风格的图标库

## 页面结构

```
/                            首页（Hero + 核心特性 + 对比 + 场景 + CTA）
├─ 12维需求粒子球体（交互）
├─ 4大核心技术卡片
├─ DPU vs LLM 对比表
├─ 应用场景展示
└─ 立即体验 CTA

/understand                 智能理解（核心功能）
├─ 预设场景快速体验
├─ 自由输入分析
├─ 需求球体实时可视化
├─ 优先级排序（带动画）
├─ 势能对比图 + 雷达图
└─ 决策逻辑说明

/potential                  势能计算详解
├─ 12维需求卡片（可展开）
├─ 12×12关联矩阵热力图
├─ 4步计算公式详解
└─ 层级压制机制可视化

/architecture               系统架构
├─ 6 层模块化架构图
└─ 技术规格

/agent                      智能体对话
├─ 现代聊天界面
├─ 每条回复附带需求优先级分析
└─ 实时需求球体

/memory                     记忆系统
├─ 6层记忆架构卡片
├─ 动态用户画像（12维）
└─ 记忆演化时间线
```

## 启动

```bash
cd web
npm install
npm run dev
```

访问 http://localhost:5173

## 设计规范

- 主色：`#3B82F6 → #1D4ED8`（蓝色渐变）
- 强调色：`#F59E0B`（琥珀色）
- 背景：`#FFFFFF → #F8FAFC → #EFF6FF`（极浅渐变）
- 卡片：`rgba(255,255,255,0.65~0.80)` + `backdrop-blur(20~30px)`
- 圆角：`1rem` / `1.25rem` / `2rem`（三级递进）
- 阴影：`0 4px 24px -12px rgba(29,78,216,0.10)`（柔和蓝调）
