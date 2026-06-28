"""
DPU Agent 后端服务启动脚本
使用 uvicorn 启动 FastAPI 应用

启动方式：
    python server.py

服务启动后：
    - API 地址: http://localhost:8000
    - API 文档: http://localhost:8000/docs
    - ReDoc 文档: http://localhost:8000/redoc
    - 健康检查: http://localhost:8000/api/health
"""

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
