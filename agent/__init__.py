"""
DPU Agent 模块
基于 LangGraph 的智能体，集成 DPU 需求势能分析引擎
"""

__all__ = ["create_dpu_agent"]
__version__ = "4.0.0"

def create_dpu_agent():
    """延迟导入以避免 langgraph 依赖问题"""
    from agent.graph import create_dpu_agent as _create_dpu_agent
    return _create_dpu_agent()
