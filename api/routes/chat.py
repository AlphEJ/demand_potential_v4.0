"""
DPU Agent API - 聊天路由
提供消息发送、对话历史管理接口
"""

from fastapi import APIRouter
from typing import Dict, Any

from api.models import (
    ChatRequest,
    ChatResponse,
    ChatHistoryResponse,
    SimpleResponse,
)
from agent.memory import get_global_memory, reset_global_memory

router = APIRouter()


@router.post("/send", response_model=ChatResponse, summary="发送消息")
async def send_message(request: ChatRequest) -> ChatResponse:
    """
    发送消息给 DPU Agent，获取智能回复

    处理流程：
    1. 接收用户消息
    2. 通过 LangGraph Agent 图进行处理（路由 -> DPU分析 -> LLM回复 -> 工具执行 -> 输出）
    3. 返回 Agent 的回复及 DPU 分析结果
    """
    try:
        from agent.graph import create_dpu_agent

        # 创建 Agent 图
        agent = create_dpu_agent()

        # 获取当前用户画像
        memory = get_global_memory()
        user_profile: Dict[str, float] = {}

        # 构建初始状态
        initial_state = {
            "user_input": request.message,
            "demands": None,
            "demand_ranking": [],
            "suppressed_count": 0,
            "conflict_count": 0,
            "llm_response": "",
            "tool_calls": [],
            "tool_results": [],
            "messages": memory.get_all(),
            "needs_dpu_analysis": False,
            "needs_tool_execution": False,
            "iteration_count": 0,
            "max_iterations": 5,
            "user_profile": user_profile,
            "error": None,
        }

        # 执行 Agent 图
        result = agent.invoke(initial_state)

        # 构建响应
        return ChatResponse(
            success=result.get("error") is None,
            reply=result.get("llm_response", ""),
            demand_ranking=result.get("demand_ranking", []),
            suppressed_count=result.get("suppressed_count", 0),
            conflict_count=result.get("conflict_count", 0),
            tool_results=result.get("tool_results", []),
            error=result.get("error"),
        )

    except Exception as e:
        return ChatResponse(
            success=False,
            reply=f"处理消息时出错: {str(e)}",
            error=str(e),
        )


@router.get("/history", response_model=ChatHistoryResponse, summary="获取对话历史")
async def get_history() -> ChatHistoryResponse:
    """
    获取当前会话的对话历史

    Returns:
        对话消息列表和消息总数
    """
    memory = get_global_memory()
    messages = memory.get_all()

    return ChatHistoryResponse(
        messages=messages,
        total_count=len(messages),
    )


@router.delete("/history", response_model=SimpleResponse, summary="清空对话历史")
async def clear_history() -> SimpleResponse:
    """
    清空当前会话的对话历史

    Returns:
        操作结果
    """
    reset_global_memory()
    return SimpleResponse(
        success=True,
        message="对话历史已清空",
    )


@router.post("/clear-context", response_model=SimpleResponse, summary="清空上下文（完全重置）")
async def clear_context() -> SimpleResponse:
    """
    完全清空所有上下文记忆：
    1. 清空对话历史
    2. 重置 DPU 状态
    3. 清空 LangGraph 记忆

    用于用户说"抛开话题不谈"、"重新来"等需要完全重置的场景

    Returns:
        操作结果
    """
    try:
        # 1. 清空对话历史
        reset_global_memory()

        # 2. 清空全局 DPU 状态（如果有）
        try:
            from agent.dpu_state import reset_dpu_state
            reset_dpu_state()
        except ImportError:
            pass

        # 3. 清空用户画像（可选）
        try:
            from agent.user_profile import reset_user_profile
            reset_user_profile()
        except ImportError:
            pass

        return SimpleResponse(
            success=True,
            message="上下文已完全清空，模型将只响应您接下来的第一条指令",
        )

    except Exception as e:
        return SimpleResponse(
            success=False,
            message=f"清空上下文失败: {str(e)}",
        )
