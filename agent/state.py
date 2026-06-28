"""
DPU Agent 状态定义
定义 Agent 在图中流转时携带的所有状态数据
"""

from typing import TypedDict, List, Dict, Any, Optional
from core.demands import Demand, DemandSet


class DPUAgentState(TypedDict):
    """
    DPU Agent 的状态定义

    包含用户输入、DPU分析结果、LLM响应、工具调用、
    对话记忆、控制流、用户画像和错误处理等字段。
    """

    # ===== 用户输入 =====
    user_input: str                          # 用户原始输入文本

    # ===== DPU 分析结果 =====
    demands: Optional[DemandSet]             # DPU解析后的需求集合
    demand_ranking: List[Dict[str, Any]]     # 需求优先级排序列表
    suppressed_count: int                    # 被层级压制的需求数量
    conflict_count: int                      # 需求冲突数量

    # ===== LLM 相关 =====
    llm_response: str                        # LLM 生成的回复文本

    # ===== 工具执行 =====
    tool_calls: List[Dict[str, Any]]         # 待执行的工具调用列表
    tool_results: List[Dict[str, Any]]       # 工具执行结果列表

    # ===== 对话记忆 =====
    messages: List[Dict[str, str]]           # 对话历史 [{"role": "user"/"assistant", "content": "..."}]

    # ===== 控制流 =====
    needs_dpu_analysis: bool                 # 是否需要执行DPU分析
    needs_tool_execution: bool               # 是否需要执行工具调用
    iteration_count: int                     # 当前迭代次数（防止无限循环）
    max_iterations: int                      # 最大迭代次数

    # ===== 用户画像（长期） =====
    user_profile: Dict[str, float]           # 12维需求激活历史，键为需求名称，值为累计激活值

    # ===== 错误处理 =====
    error: Optional[str]                     # 错误信息，None 表示无错误
