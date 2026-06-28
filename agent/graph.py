"""
DPU Agent 图定义
使用 LangGraph 构建基于 DPU 需求分析的智能体工作流

图结构：
    route -> dpu_analyze -> llm_respond -> check_tool_calls
                                              |          |
                                              v          v
                                         format_output  tool_execute -> llm_respond (循环)
                                              |
                                              v
                                        update_profile -> END

    route -> llm_respond (普通对话，不需要DPU分析时)
"""

from langgraph.graph import StateGraph, END

from agent.state import DPUAgentState
from agent.nodes import (
    route_input,
    dpu_analyze_node,
    llm_respond_node,
    tool_execute_node,
    update_profile_node,
    format_output_node,
    check_tool_calls,
)


def create_dpu_agent():
    """
    创建 DPU Agent 图

    构建完整的 LangGraph 状态图，包含：
    - 路由节点：判断输入类型
    - DPU 分析节点：需求势能分析
    - LLM 响应节点：生成回复
    - 工具执行节点：执行工具调用
    - 输出格式化节点：清理输出
    - 用户画像更新节点：更新长期画像

    Returns:
        编译后的 LangGraph 可执行图
    """
    # 创建状态图
    graph = StateGraph(DPUAgentState)

    # ===== 添加节点 =====
    # 注意：route_input 和 check_tool_calls 是条件边函数，不作为普通节点添加
    graph.add_node("dpu_analyze", dpu_analyze_node)
    graph.add_node("llm_respond", llm_respond_node)
    graph.add_node("tool_execute", tool_execute_node)
    graph.add_node("update_profile", update_profile_node)
    graph.add_node("format_output", format_output_node)

    # ===== 设置入口 =====
    # 使用条件边作为入口，而不是普通节点
    graph.set_conditional_entry_point(
        route_input,
        {
            "analyze": "dpu_analyze",
            "respond": "llm_respond",
        }
    )

    # ===== 添加边 =====

    # DPU分析 -> LLM回复
    graph.add_edge("dpu_analyze", "llm_respond")

    # LLM回复 -> 工具执行 或 输出格式化
    graph.add_conditional_edges(
        "llm_respond",
        check_tool_calls,
        {
            "tools": "tool_execute",
            "output": "format_output",
        }
    )

    # 工具执行 -> LLM回复（循环，让 LLM 根据工具结果继续生成）
    graph.add_edge("tool_execute", "llm_respond")

    # 输出格式化 -> 用户画像更新
    graph.add_edge("format_output", "update_profile")

    # 用户画像更新 -> 结束
    graph.add_edge("update_profile", END)

    # ===== 编译图 =====
    return graph.compile()
