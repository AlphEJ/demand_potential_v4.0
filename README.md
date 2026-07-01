# DPU · 需求势能引擎

> **让 AI 知道什么对人类更重要。**

DPU（Demand Processing Unit）是一个基于**马斯洛需求层次理论**的 AI 价值判断引擎。它不替代大模型，而是作为大模型的「价值决策层」——LLM 负责理解语言，DPU 负责判断优先级。

## 这是什么？

当用户说 **"我饿了，但明天有个重要面试"** 时，通用大模型只会分别给出建议——吃饭和准备面试。但 DPU 能做到：

- 识别出「生理生存」和「安全稳定」两个需求存在**冲突**
- 根据马斯洛层级判断**哪个更优先**
- 给出**有依据、可追溯**的价值判断

DPU 把心理学理论变成了可计算的价值决策算法：**12 维需求体系 + 势能计算 + 层级压制 + 冲突仲裁 = 可解释的价值判断。**

## 能用来做什么？

- **AI Agent 价值决策**：作为 LLM Agent 的决策层，让 AI 在多个目标冲突时做出符合人类需求优先级的判断
- **用户需求分析**：分析用户对话/文本，实时计算 12 维需求强度，生成用户心理画像
- **多需求冲突仲裁**：当多个需求互相矛盾时（如"想休息"vs"要加班"），给出有理论依据的优先级排序
- **用户画像建模**：通过贝叶斯更新，持续追踪用户需求变化趋势，构建动态心理模型
- **记忆增强对话**：6 层记忆结构（L1-L6），借鉴认知心理学双系统设计，让 AI 对话有长期记忆

## 核心特性

| 特性 | 说明 |
|------|------|
| **12 维需求体系** | 将马斯洛 5 层理论细化为 12 个可计算的需求维度 |
| **势能计算引擎** | 多步骤量化每个需求的紧迫程度，综合考虑激活强度、需求层级、衰减、负载等因素 |
| **层级压制机制** | 当底层需求（如生理、安全）高度激活时，自动压制高层需求，符合马斯洛理论的优先级 |
| **冲突仲裁** | 多个需求互相矛盾时，通过关联矩阵和仲裁策略决定优先级 |
| **注意力加权** | 动态调整需求间的耦合强度，当前活跃的需求自动增强其关联对的权重 |
| **贝叶斯画像** | 每次交互后更新用户需求强度，画像随时间演化 |
| **6 层记忆系统** | System1（实时 L1-L4）+ System2（后台 L5-L6），双认知系统 |
| **LLM 多模型适配** | 支持通义千问、DeepSeek、Ollama，不可用时自动降级到纯算法 |

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
cd web && npm install
```

### 2. 配置 LLM API Key（可选）

在项目根目录创建 `.env`：

```bash
TONGYI_API_KEY=your_key_here    # 推荐
DEEPSEEK_API_KEY=your_key_here  # 可选
```

不配 API Key 也能用——LLM 模式自动降级到纯 DPU 算法。

### 3. 启动

```bash
# 终端 1：后端（Port 8000）
python server.py

# 终端 2：前端（Port 5173）
cd web && npm run dev
```

浏览器打开 `http://localhost:5173`。

## 项目结构

```
DPU/
├── server.py                   # FastAPI 启动入口
│
├── dpu_core/                   # 核心算法引擎（编译二进制，🔒 闭源）
│   ├── config.*.pyd            # 配置与超参数
│   ├── matrix.*.pyd            # 12×12 需求关联矩阵
│   ├── potential.*.pyd          # 势能计算引擎
│   ├── suppression.*.pyd        # 层级压制机制
│   ├── conflict.*.pyd          # 冲突仲裁
│   ├── profile.*.pyd           # 贝叶斯用户画像
│   ├── demands.py              # 12 维需求定义（开源）
│   └── __init__.py             # 公共 API 导出
│
├── core/                       # 核心算法代理层
│   ├── config.py               # → dpu_core.config
│   ├── matrix.py               # → dpu_core.matrix
│   ├── potential.py             # → dpu_core.potential
│   ├── suppression.py           # → dpu_core.suppression
│   ├── conflict.py              # → dpu_core.conflict
│   ├── profile.py               # → dpu_core.profile
│   ├── demands.py               # 12 维需求定义 + 关键词库
│   ├── engine.py                # DPU 主引擎（Facade）
│   ├── path_tracer.py           # 推理路径追踪
│   ├── embedding_matcher.py     # 语义向量匹配
│   ├── vector_store.py          # 向量存储
│   └── demand_descriptions.py   # 需求维度详细描述
│
├── api/                        # FastAPI 后端
│   ├── main.py                 # 应用入口
│   ├── models.py               # Pydantic 数据模型
│   ├── middleware.py            # CORS / 日志 / 异常处理
│   └── routes/
│       ├── analyze.py          # 需求分析接口
│       ├── chat.py             # Agent 对话接口
│       ├── config.py           # 配置管理接口
│       └── profile.py          # 用户画像接口
│
├── llm_client/                 # LLM 适配层
│   ├── base.py                 # 客户端基类
│   ├── factory.py              # 工厂模式（自动选 Provider）
│   ├── tongyi.py               # 通义千问
│   ├── deepseek.py             # DeepSeek
│   ├── ollama.py               # 本地 Ollama
│   └── openclaw.py             # OpenClaw 执行引擎
│
├── memory/                     # 记忆系统（System1 + System2）
│   ├── models.py               # 记忆数据模型
│   ├── persistence.py          # SQLite 持久化
│   ├── system1.py              # 实时处理（L1-L4）
│   ├── system2.py              # 后台整理（L5-L6）
│   └── manager.py              # 记忆管理器
│
├── agent/                      # LangGraph Agent
│   ├── state.py / graph.py / nodes.py
│   ├── prompts.py / memory.py / tools.py
│
├── web/                        # React + Vite + TypeScript 前端
│   └── src/
│       ├── pages/              # 10 个页面
│       ├── components/         # 公共组件
│       ├── lib/                # dpuEngine.ts + dpuApi.ts + llm.ts
│       └── types/              # TypeScript 类型定义
│
├── utils/                      # 工具模块
└── requirements.txt            # Python 依赖
```

> **注意**：`dpu_core/` 目录下的 `.pyd` 文件为编译后的二进制模块，核心算法的实现细节受保护。`core/` 中对应的文件为代理层，保持 API 兼容。

## 12 维需求体系

基于马斯洛需求层次理论，将 5 层需求细化为 12 个可计算维度：

| 编号 | 名称 | 层级 | 描述 |
|------|------|------|------|
| D1 | 生理生存 | L0 生理 | 饮食、睡眠、健康 |
| D2 | 安全稳定 | L1 安全 | 安全、财务、稳定 |
| D3 | 社交归属 | L2 社交 | 朋友、群体、归属 |
| D4 | 情感陪伴 | L2 社交 | 陪伴、情感、温暖 |
| D5 | 尊重认可 | L3 尊重 | 地位、成就、被认可 |
| D6 | 认知求知 | L3 尊重 | 学习、知识、探索 |
| D7 | 审美价值 | L4 自我实现 | 美感、品质、和谐 |
| D8 | 自我实现 | L4 自我实现 | 理想、创造、潜能 |
| D9 | 自由掌控 | L4 自我实现 | 自主、独立、控制 |
| D10 | 公平公正 | L4 自我实现 | 公平、正义、权益 |
| D11 | 成长进阶 | L4 自我实现 | 成长、进步、挑战 |
| D12 | 秩序规整 | L4 自我实现 | 秩序、计划、条理 |

## 6 层记忆结构

借鉴认知心理学和腾讯 Hy-Memory 的双系统设计：

| 层级 | 名称 | 系统 | 说明 |
|------|------|------|------|
| L1 | 原始痕迹 | System1 | 实时记录对话原始数据 |
| L2 | 原子事实 | System1 | 抽取关键事实和偏好 |
| L3 | 身份画像 | System1 | 12 维需求强度追踪 |
| L4 | 会话摘要 | System1 | 对话主题和关键决策 |
| L5 | 心智模型 | System2 | 行为模式和决策风格 |
| L6 | 前瞻意图 | System2 | 预测未来需求趋势 |

## LLM 支持

| 模型 | 配置 |
|------|------|
| 通义千问（推荐） | `TONGYI_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| Ollama 本地 | `ollama pull qwen2.5` |

LLM 不可用时自动降级到纯 DPU 算法（关键词 + 语义向量），用户体验不中断。

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Python 3.12 + FastAPI |
| 前端 | React + Vite + TypeScript + Tailwind CSS |
| Agent | LangGraph |
| LLM | 通义千问 / DeepSeek / Ollama |
| 记忆 | SQLite |

## 许可证

MIT License

## 作者

孟跃
