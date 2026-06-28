"""
DPU Agent API - 用户画像路由
提供用户画像查询和重置接口
"""

from fastapi import APIRouter

from api.models import (
    UserProfileResponse,
    UserProfile,
    SimpleResponse,
)
from agent.memory import get_global_memory

router = APIRouter()


@router.get("/current", response_model=UserProfileResponse, summary="获取当前用户画像")
async def get_user_profile() -> UserProfileResponse:
    """
    获取当前用户的需求画像

    用户画像基于历史对话中 DPU 分析结果的累计激活值，
    反映用户长期关注的需求维度。

    Returns:
        用户画像数据
    """
    try:
        from agent.nodes import _get_dpu_engine

        # 从 Agent 节点模块获取全局引擎（如果有的话可以扩展）
        # 这里使用对话记忆中的信息来估算交互次数
        memory = get_global_memory()
        total_interactions = memory.turn_count

        # 当前版本中，画像数据需要从 Agent 状态中获取
        # 由于 Agent 状态是临时的，这里返回空画像
        # 实际使用中，画像应该持久化到数据库
        profile_data: dict = {}

        # 计算 Top 3 需求
        sorted_needs = sorted(profile_data.items(), key=lambda x: x[1], reverse=True)
        top_needs = [name for name, _ in sorted_needs[:3]]

        profile = UserProfile(
            profile=profile_data,
            total_interactions=total_interactions,
            top_needs=top_needs,
        )

        return UserProfileResponse(
            success=True,
            profile=profile,
        )

    except Exception as e:
        return UserProfileResponse(
            success=False,
            profile=UserProfile(),
        )


@router.put("/reset", response_model=SimpleResponse, summary="重置用户画像")
async def reset_user_profile() -> SimpleResponse:
    """
    重置用户画像和对话历史

    Returns:
        操作结果
    """
    try:
        from agent.memory import reset_global_memory

        reset_global_memory()

        return SimpleResponse(
            success=True,
            message="用户画像和对话历史已重置",
        )

    except Exception as e:
        return SimpleResponse(
            success=False,
            message=f"重置失败: {str(e)}",
        )
