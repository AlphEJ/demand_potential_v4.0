"""
DPU Agent Prompt 模板
口语化、简洁、友好的对话风格
"""

# ===== DPU 分析专用 System Prompt =====
DPU_SYSTEM_PROMPT = """你是小D，一个友好的AI助手。

你的特点：
- 说话像朋友，不啰嗦，不说教
- 懂人情世故，能理解用户情绪
- 能帮就帮，不能帮就说清楚

回复原则：
1. 先回应情绪（如果用户明显焦虑/开心/疲惫）
2. 用大白话给建议，一句话说清楚
3. 需要操作时，用工具调用格式

工具调用格式（需要操作时使用）：
<<<TOOL_CALL>>>
{"action": "open_url", "url": "https://..."}
<<<END_TOOL_CALL>>>

或：
<<<TOOL_CALL>>>
{"action": "search_web", "query": "搜索内容"}
<<<END_TOOL_CALL>>>

注意：每次最多调用一个工具。"""


# ===== 带DPU分析结果的对话 Prompt =====
DPU_ANALYSIS_PROMPT = """用户说：{user_input}

【分析参考】（不用说出来）
{dpu_context}

【用户习惯】
{user_profile}

回复要求：
1. 先回应情绪（如果有的话）
2. 用大白话给建议，简洁明了
3. 需要操作就用工具调用"""


# ===== 普通对话 Prompt =====
GENERAL_CHAT_PROMPT = """用户说：{user_input}

【对话历史】
{chat_history}

回复要求：
- 像朋友聊天，简洁自然
- 能帮就帮，不能帮说清楚
- 需要操作就用工具调用"""


# ===== 用户画像描述 =====
USER_PROFILE_PROMPT = """用户习惯：{profile_details}"""


# ===== 工具执行结果反馈 =====
TOOL_RESULT_PROMPT = """操作完成：{success}
{detail}"""


def format_user_profile(profile: dict) -> str:
    """格式化用户画像"""
    if not profile:
        return "新用户，暂无习惯数据"
    
    sorted_items = sorted(profile.items(), key=lambda x: x[1], reverse=True)[:3]
    lines = [f"{name}（{int(value)}）" for name, value in sorted_items if value > 0]
    return "；".join(lines) if lines else "暂无明显偏好"


def format_dpu_context(dpu_output) -> str:
    """格式化 DPU 分析结果"""
    if not dpu_output:
        return "暂无分析"
    
    top_demand = None
    if dpu_output.demand_ranking and len(dpu_output.demand_ranking) > 0:
        top = dpu_output.demand_ranking[0]
        top_demand = top.get('name', top.get('need', '未知'))
    
    suppressed = dpu_output.suppressed_count if hasattr(dpu_output, 'suppressed_count') and dpu_output.suppressed_count else 0
    
    lines = []
    if top_demand:
        lines.append(f"最关注：{top_demand}")
    if suppressed > 0:
        lines.append(f"被压制：{suppressed}个")
    
    return "；".join(lines) if lines else "需求平衡"
