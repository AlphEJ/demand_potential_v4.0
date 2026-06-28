"""
DPU Agent API - FastAPI 应用入口
提供基于 DPU 需求势能分析的智能体后端服务

启动方式：
    python server.py
    或
    uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
"""

import logging
from fastapi import FastAPI

from api.middleware import setup_cors, log_requests_middleware, setup_exception_handlers
from api.routes import chat, analyze, config, profile
from api.models import HealthResponse

# ===== 配置日志 =====
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("dpu_agent")

# ===== 创建 FastAPI 应用 =====
app = FastAPI(
    title="DPU Agent API",
    description="""
    DPU (Demand Processing Unit) Agent 后端服务

    基于马斯洛需求层次理论的 AI 智能体，集成：
    - 12维需求势能分析引擎
    - LangGraph Agent 工作流
    - 通义千问 LLM 后端
    - 工具调用能力（搜索、文件操作等）
    - 用户画像追踪
    """,
    version="4.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ===== 配置中间件 =====
setup_cors(app)
app.middleware("http")(log_requests_middleware)
setup_exception_handlers(app)

# ===== 注册路由 =====
app.include_router(chat.router, prefix="/api/chat", tags=["聊天"])
app.include_router(analyze.router, prefix="/api/analyze", tags=["分析"])
app.include_router(config.router, prefix="/api/config", tags=["配置"])
app.include_router(profile.router, prefix="/api/profile", tags=["画像"])
# ===== 健康检查 =====
@app.get("/api/health", response_model=HealthResponse, summary="健康检查")
async def health_check() -> HealthResponse:
    """
    服务健康检查接口

    Returns:
        服务状态和版本信息
    """
    return HealthResponse(status="ok", version="4.0.0")


# ===== 启动事件 =====
@app.on_event("startup")
async def on_startup():
    """应用启动时执行"""
    logger.info("DPU Agent API v4.0.0 启动中...")
    logger.info("文档地址: http://localhost:8000/docs")


@app.on_event("shutdown")
async def on_shutdown():
    """应用关闭时执行"""
    logger.info("DPU Agent API 已关闭")
