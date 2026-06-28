"""
DPU Agent API - 中间件配置
包含 CORS、请求日志、异常处理等中间件
"""

import time
import logging
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

logger = logging.getLogger("dpu_agent")


def setup_cors(app) -> None:
    """
    配置 CORS 跨域中间件（安全加固版）
    - 限制允许的来源，禁止通配符 + 凭证组合
    - 生产环境应将 ALLOWED_ORIGINS 替换为实际域名

    Args:
        app: FastAPI 应用实例
    """
    # 安全：限制允许的来源，不再使用 "*"
    # 生产环境请替换为实际前端域名，如 ["http://localhost:3000", "https://yourdomain.com"]
    import os
    allowed_origins_str = os.environ.get("CORS_ALLOWED_ORIGINS", "")
    if allowed_origins_str:
        allow_origins = [origin.strip() for origin in allowed_origins_str.split(",") if origin.strip()]
    else:
        # 默认允许所有来源（CloudBase/Vercel/本地开发均可访问）
        # 如需限制，在 Railway Environment Variables 中设置 CORS_ALLOWED_ORIGINS
        allow_origins = ["*"]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Requested-With", "X-LLM-Provider", "X-LLM-Api-Key", "X-LLM-Base-Url", "X-LLM-Model"],
    )


async def log_requests_middleware(request: Request, call_next):
    """
    请求日志中间件
    记录每个请求的方法、路径和耗时

    Args:
        request: 请求对象
        call_next: 下一个中间件/路由处理函数

    Returns:
        响应对象
    """
    start_time = time.time()

    # 处理请求
    response = await call_next(request)

    # 计算耗时
    process_time = (time.time() - start_time) * 1000
    logger.info(
        f"{request.method} {request.url.path} - "
        f"状态码: {response.status_code} - "
        f"耗时: {process_time:.1f}ms"
    )

    # 在响应头中添加处理时间
    response.headers["X-Process-Time"] = f"{process_time:.1f}ms"

    return response


def setup_exception_handlers(app) -> None:
    """
    配置全局异常处理器

    Args:
        app: FastAPI 应用实例
    """

    @app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError):
        """处理参数验证错误"""
        logger.warning(f"参数验证错误: {exc}")
        return JSONResponse(
            status_code=422,
            content={"success": False, "error": f"参数错误: {str(exc)}"},
        )

    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):
        """处理未捕获的异常（安全：不向客户端泄露内部错误详情）"""
        logger.error(f"未捕获异常: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": "服务器内部错误，请稍后重试"},
        )
