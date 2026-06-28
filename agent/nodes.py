"""
DPU Agent 自定义节点
定义 LangGraph 图中的各个处理节点和路由函数

节点列表：
- route_input: 路由节点，判断输入类型
- dpu_analyze_node: DPU 需求分析节点
- llm_respond_node: LLM 响应生成节点
- tool_execute_node: 工具执行节点
- update_profile_node: 用户画像更新节点
- format_output_node: 输出格式化节点
- check_tool_calls: 条件边判断函数
"""

import re
import json
import os
from typing import Dict, Any, List

from core.engine import DemandPotentialEngine, DPUOutput
from core.config import DPUConfig
from core.demands import NeedMeta
from llm_client.factory import LLMFactory

# 安全：启动时加载 .env 文件
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from agent.state import DPUAgentState
from agent.memory import get_global_memory
from agent.prompts import (
    DPU_SYSTEM_PROMPT,
    DPU_ANALYSIS_PROMPT,
    GENERAL_CHAT_PROMPT,
    TOOL_RESULT_PROMPT,
    format_user_profile,
    format_dpu_context,
)
from agent.tools import parse_tool_calls, strip_tool_calls, execute_tool


# ==================== 全局引擎实例 ====================
_dpu_engine: DemandPotentialEngine = None


def _get_dpu_engine() -> DemandPotentialEngine:
    """
    获取全局 DPU 引擎实例（懒加载单例）

    Returns:
        DemandPotentialEngine 实例
    """
    global _dpu_engine
    if _dpu_engine is None:
        _dpu_engine = DemandPotentialEngine(DPUConfig(), llm_provider="tongyi")
    return _dpu_engine


def _get_llm_client():
    """
    获取 LLM 客户端实例（从配置文件读取 API Key）

    Returns:
        LLMClient 实例
    """
    try:
        # 从配置文件读取 LLM 配置
        config = _load_llm_config()
        provider = config.get("provider", "tongyi")
        api_key = config.get("api_key")
        model = config.get("model")
        base_url = config.get("base_url")
        
        if not api_key:
            return None
        
        kwargs = {"api_key": api_key}
        if model:
            kwargs["model"] = model
        if base_url:
            kwargs["base_url"] = base_url
        
        return LLMFactory.create_client(provider, **kwargs)
    except Exception:
        return None


def _load_llm_config() -> dict:
    """
    从配置文件加载 LLM 配置，API Key 优先从环境变量读取（安全策略）

    Returns:
        配置字典
    """
    import json
    from pathlib import Path
    
    config_file = Path(__file__).parent.parent / "config.json"
    
    default_config = {
        "provider": "tongyi",
        "model": "qwen-plus",
        "api_key": None,
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    }
    
    if config_file.exists():
        try:
            with open(config_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                if "llm" in data:
                    default_config.update(data["llm"])
        except Exception:
            pass

    # 安全：如果配置文件中无 API Key，从环境变量读取
    if not default_config.get("api_key"):
        provider = default_config.get("provider", "tongyi")
        env_key_map = {
            "tongyi": "TONGYI_API_KEY",
            "deepseek": "DEEPSEEK_API_KEY",
        }
        env_var = env_key_map.get(provider)
        if env_var:
            default_config["api_key"] = os.environ.get(env_var)
    
    return default_config


# ==================== 需求分析关键词检测 ====================

# 需要进行 DPU 分析的关键词模式
_DPU_TRIGGER_KEYWORDS = [
    "需求", "想要", "需要", "希望", "目标", "困惑", "迷茫",
    "选择", "纠结", "优先", "重要", "紧急", "帮我分析",
    "我应该", "怎么办", "建议", "规划", "计划",
    "压力", "焦虑", "烦恼", "担心", "害怕",
    "成长", "提升", "进步", "学习", "发展",
    "工作", "职业", "生活", "关系", "家庭",
    "健康", "财务", "安全", "自由",
]


def _should_analyze_dpu(text: str) -> bool:
    """
    判断用户输入是否需要进行 DPU 需求分析

    Args:
        text: 用户输入文本

    Returns:
        True 表示需要 DPU 分析
    """
    text_lower = text.lower()
    for keyword in _DPU_TRIGGER_KEYWORDS:
        if keyword in text_lower:
            return True
    return False


# ==================== 节点函数 ====================

def route_input(state: DPUAgentState) -> str:
    """
    路由节点：判断用户输入是普通对话还是需要 DPU 分析

    Args:
        state: 当前 Agent 状态

    Returns:
        "analyze" 表示需要 DPU 分析，"respond" 表示直接 LLM 回复
    """
    user_input = state.get("user_input", "")

    if _should_analyze_dpu(user_input):
        return "analyze"
    else:
        return "respond"


def dpu_analyze_node(state: DPUAgentState) -> dict:
    """
    DPU 分析节点：调用 DemandPotentialEngine.process() 进行需求势能分析

    Args:
        state: 当前 Agent 状态

    Returns:
        状态更新字典
    """
    user_input = state.get("user_input", "")

    try:
        engine = _get_dpu_engine()
        output: DPUOutput = engine.process(user_input)

        # 构建需求排名列表
        demand_ranking = []
        for item in output.demand_ranking:
            demand_ranking.append({
                "rank": item["rank"],
                "need": item["need"],
                "potential": item["potential"],
                "layer": item["layer"],
                "reason": item.get("reason", ""),
            })

        return {
            "demands": None,  # DemandSet 不可序列化，通过 ranking 传递
            "demand_ranking": demand_ranking,
            "suppressed_count": len(output.suppressed),
            "conflict_count": len(output.conflicts),
            "needs_dpu_analysis": True,
            "error": None,
        }

    except Exception as e:
        return {
            "demands": None,
            "demand_ranking": [],
            "suppressed_count": 0,
            "conflict_count": 0,
            "needs_dpu_analysis": False,
            "error": f"DPU分析失败: {str(e)}",
        }


def llm_respond_node(state: DPUAgentState) -> dict:
    """
    LLM 响应节点：调用通义千问生成回复，注入 DPU 分析结果

    根据是否有 DPU 分析结果，选择不同的 Prompt 模板。

    Args:
        state: 当前 Agent 状态

    Returns:
        状态更新字典（包含 llm_response 和 tool_calls）
    """
    user_input = state.get("user_input", "")
    needs_dpu = state.get("needs_dpu_analysis", False)
    demand_ranking = state.get("demand_ranking", [])
    user_profile = state.get("user_profile", {})
    iteration_count = state.get("iteration_count", 0)

    # 获取对话记忆
    memory = get_global_memory()
    chat_history = memory.get_context_text(n=5)

    # 构建 Prompt
    if needs_dpu and demand_ranking:
        # 有 DPU 分析结果：使用增强 Prompt
        dpu_context_lines = ["活跃需求（按优先级排序）："]
        for item in demand_ranking[:5]:
            dpu_context_lines.append(
                f"  {item['rank']}. {item['need']} - 势能: {item['potential']:.2f} | 层级: {item['layer']}"
            )

        suppressed_count = state.get("suppressed_count", 0)
        if suppressed_count > 0:
            dpu_context_lines.append(f"\n被层级压制的需求: {suppressed_count} 个")

        conflict_count = state.get("conflict_count", 0)
        if conflict_count > 0:
            dpu_context_lines.append(f"需求冲突: {conflict_count} 组")

        dpu_context = "\n".join(dpu_context_lines)
        profile_text = format_user_profile(user_profile)

        prompt = DPU_ANALYSIS_PROMPT.format(
            user_input=user_input,
            dpu_context=dpu_context,
            user_profile=profile_text,
        )
    else:
        # 无 DPU 分析：使用普通对话 Prompt
        prompt = GENERAL_CHAT_PROMPT.format(
            user_input=user_input,
            chat_history=chat_history or "（无历史对话）",
        )

    # 调用 LLM
    llm_client = _get_llm_client()
    if llm_client is None:
        return {
            "llm_response": "抱歉，LLM 客户端初始化失败，请检查配置。",
            "tool_calls": [],
            "error": "LLM客户端初始化失败",
        }

    try:
        response = llm_client.generate(
            prompt,
            system_prompt=DPU_SYSTEM_PROMPT,
            temperature=0.7,
        )

        if not response.is_success:
            return {
                "llm_response": f"LLM 生成失败: {response.error}",
                "tool_calls": [],
                "error": response.error,
            }

        response_text = response.content

        # 解析工具调用
        tool_calls = parse_tool_calls(response_text)

        return {
            "llm_response": response_text,
            "tool_calls": tool_calls,
            "iteration_count": iteration_count + 1,
            "error": None,
        }

    except Exception as e:
        return {
            "llm_response": f"生成回复时出错: {str(e)}",
            "tool_calls": [],
            "error": str(e),
        }


def tool_execute_node(state: DPUAgentState) -> dict:
    """
    工具执行节点：解析并执行 LLM 返回的工具调用

    Args:
        state: 当前 Agent 状态

    Returns:
        状态更新字典（包含 tool_results）
    """
    tool_calls = state.get("tool_calls", [])
    tool_results = []

    for call in tool_calls:
        result = execute_tool(call)
        tool_results.append(result)

    return {
        "tool_calls": [],
        "tool_results": tool_results,
        "needs_tool_execution": False,
    }


def check_tool_calls(state: DPUAgentState) -> str:
    """
    条件边判断函数：检查 LLM 响应中是否包含工具调用

    Args:
        state: 当前 Agent 状态

    Returns:
        "tools" 表示需要执行工具，"output" 表示直接输出
    """
    tool_calls = state.get("tool_calls", [])
    iteration_count = state.get("iteration_count", 0)
    max_iterations = state.get("max_iterations", 5)
    tool_results = state.get("tool_results", [])

    # 如果已经有工具结果，直接输出，不再循环
    if tool_results:
        return "output"

    # 有工具调用且未超过最大迭代次数
    if tool_calls and iteration_count < max_iterations:
        return "tools"

    return "output"


def update_profile_node(state: DPUAgentState) -> dict:
    """
    用户画像更新节点：根据 DPU 分析结果更新 12 维需求画像

    每次分析后，将激活的需求势能值累加到用户画像中。

    Args:
        state: 当前 Agent 状态

    Returns:
        状态更新字典（包含更新后的 user_profile）
    """
    demand_ranking = state.get("demand_ranking", [])
    user_profile = state.get("user_profile", {})

    if not demand_ranking:
        return {"user_profile": user_profile}

    # 复制画像（避免修改原字典）
    updated_profile = dict(user_profile)

    # 将 DPU 分析结果累加到画像
    for item in demand_ranking:
        need_name = item.get("need", "")
        potential = item.get("potential", 0.0)

        if need_name:
            updated_profile[need_name] = updated_profile.get(need_name, 0.0) + potential

    return {"user_profile": updated_profile}


def format_output_node(state: DPUAgentState) -> dict:
    """
    输出格式化节点：清理 LLM 响应文本，移除工具调用标记，
    并将对话记录到记忆中。

    Args:
        state: 当前 Agent 状态

    Returns:
        状态更新字典（包含格式化后的 llm_response）
    """
    user_input = state.get("user_input", "")
    llm_response = state.get("llm_response", "")
    tool_results = state.get("tool_results", [])

    # 去除工具调用标记
    clean_response = strip_tool_calls(llm_response)

    # 附加工具执行结果（保留 URL 供前端执行）
    if tool_results:
        tool_lines = ["\n---\n**工具执行结果：**"]
        for result in tool_results:
            status = "成功" if result.get("success") else "失败"
            message = result.get("message", "无详情")
            url = result.get("url", "")
            
            # 如果有 URL，生成工具调用格式让前端执行
            if url and result.get("success"):
                # 判断是搜索还是打开URL
                if "bing.com/search" in url:
                    query = result.get("query", "")
                    tool_lines.append(f"- [{status}] {message}")
                    # 添加前端可解析的工具调用
                    clean_response += f'\n\n<<<TOOL_CALL>>>\n{{"action": "search_web", "query": "{query}"}}\n<<<END_TOOL_CALL>>>'
                else:
                    tool_lines.append(f"- [{status}] {message}")
                    # 添加前端可解析的工具调用
                    clean_response += f'\n\n<<<TOOL_CALL>>>\n{{"action": "open_url", "url": "{url}"}}\n<<<END_TOOL_CALL>>>'
            else:
                tool_lines.append(f"- [{status}] {message}")
        
        clean_response += "\n".join(tool_lines)

    # 记录到对话记忆
    memory = get_global_memory()
    memory.add_user_message(user_input)
    memory.add_assistant_message(clean_response)

    return {
        "llm_response": clean_response,
        "messages": memory.get_all(),
    }
