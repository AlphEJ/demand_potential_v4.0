"""
DPU 大脑 + LLM 嘴 核心引擎
============================

架构层次：
  第1层：LLM 语义理解（Transformer 看懂中文）
  第2层：DPU 需求标注（12维需求向量）
  第3层：DPU 状态更新（指数衰减 + 核心需求加权）
  第4层：档位决策 + 话语检索（从模板库或RAG选句）
  第5层：LLM 精选 + 润色（只改风格不改态度）

核心设计原则：
  - NPC 的态度由 DPU 档位决定，不由 LLM 决定（绕开LLM对齐瓶颈）
  - 回复句从"她的原话库"或"类型语料库"中检索，不由LLM生成
  - LLM 只负责语义理解 + 润色，不做态度决策
"""

import logging
import random
import re
from typing import List, Dict, Any, Optional, Tuple

from api.models import (
    TierConfig,
    TierLibrary,
    TierEngineResponse,
    LLMSemanticOutput,
    DPUDemandState,
    TierDecision,
)

logger = logging.getLogger("tier_engine")

# ============================================================
# 常量
# ============================================================

NEED_NAMES_CN = [
    "生理生存", "安全稳定", "社交归属", "被理解",
    "尊重认可", "认知求知", "审美价值", "自我实现",
    "自由掌控", "公平公正", "成长进阶", "超越自我",
]

NEED_COLORS = [
    "#ef4444", "#f97316", "#eab308", "#22c55e",
    "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
    "#6366f1", "#14b8a6", "#84cc16", "#f43f5e",
]

# 档位定义
TIER_DEFINITIONS = {
    "cold": {
        "cn": "冷淡",
        "desc": "她不想理你，用最少的字回应或直接无视",
        "color": "#94a3b8",
    },
    "cautious": {
        "cn": "观望",
        "desc": "她在等你继续，用反问或试探性的话回应",
        "color": "#f59e0b",
    },
    "softening": {
        "cn": "软化",
        "desc": "她开始被触动了，语气出现松动",
        "color": "#6366f1",
    },
    "exploding": {
        "cn": "炸毛",
        "desc": "你踩到她的底线了，她会直接戳回去或冷嘲",
        "color": "#ef4444",
    },
    "connecting": {
        "cn": "连接",
        "desc": "你接通了她的情感需求，她愿意敞开心扉",
        "color": "#22c55e",
    },
}

# 空话关键词（触发压制）
EMPTY_TALK_KEYWORDS = [
    "对不起", "抱歉", "我错了", "我会改", "以后一定",
    "真的", "下次不会了", "原谅我", "别生气了", "我错了行不行",
]

# 有证据的关键词（证明不是空话）
EVIDENCE_KEYWORDS = [
    "个月", "半年", "三件事", "具体", "每天", "坚持",
    "证书", "考了", "学了", "我已经", "每周", "每天晚上",
    "这半年", "这几个月", "我做了", "具体是", "比如",
]

# ============================================================
# 第1层：LLM 语义理解
# ============================================================

def _llm_semantic_understand(user_input: str, use_llm: bool = True) -> LLMSemanticOutput:
    """
    调用 LLM 做语义理解。
    如果 LLM 不可用，退化为规则匹配。
    返回结构化的语义标注。
    """
    has_empty = any(k in user_input for k in EMPTY_TALK_KEYWORDS)
    has_evidence = any(k in user_input for k in EVIDENCE_KEYWORDS)
    key_phrases = [k for k in EMPTY_TALK_KEYWORDS + EVIDENCE_KEYWORDS if k in user_input]

    # 语气判断
    tone = "中性"
    if any(q in user_input for q in ["？", "?", "怎么", "为什么", "凭什么"]):
        tone = "质问性"
    elif any(q in user_input for q in ["！", "!!!"]):
        tone = "激动性"
    elif user_input.endswith("。") or user_input.endswith("……"):
        tone = "陈述性"

    # 分类
    category = "普通"
    if has_empty and not has_evidence:
        category = "空话"
    elif has_evidence:
        category = "具体话"
    elif any(q in user_input for q in ["我", "感觉", "觉得", "其实"]):
        category = "情感表达"

    # 场景判断
    situation = "普通对话"
    if "复合" in user_input or "分手" in user_input:
        situation = "复合场景"
    elif "加班" in user_input or "工作" in user_input:
        situation = "职场场景"
    elif "妈" in user_input or "爸" in user_input or "家里" in user_input:
        situation = "家庭场景"

    # 意图判断
    intent = "表达"
    if has_empty:
        intent = "道歉求和"
    if has_evidence:
        intent = "说明情况"

    if use_llm:
        try:
            from llm_client.factory import LLMFactory
            client = LLMFactory.create_client("tongyi")
            prompt = f"""分析以下这句话的语义，返回JSON（只返回JSON，不要其他内容）：
{{
    "situation": "场景（如：复合场景/职场场景/普通对话）",
    "intent": "意图（如：道歉/说明情况/质问/表达情感）",
    "has_evidence": true/false（这句话是否有具体的事实或证据，还是空泛的话）,
    "is_empty_talk": true/false（这句话是不是'说了等于没说'的空话）,
    "tone": "语气（试探性/陈述性/质问性/激动性/中性）",
    "key_phrases": ["关键词列表"],
    "category": "分类（空话/具体话/质问/情感表达/普通）"
}}

待分析的话：{user_input}
"""
            resp = client.generate(prompt, max_tokens=200, temperature=0.2)
            if resp.is_success and resp.content:
                import json
                text = resp.content.strip()
                # 尝试从 markdown code block 里提取 JSON
                match = re.search(r'\{[\s\S]*\}', text)
                if match:
                    data = json.loads(match.group())
                    return LLMSemanticOutput(
                        situation=str(data.get("situation", situation)),
                        intent=str(data.get("intent", intent)),
                        has_evidence=bool(data.get("has_evidence", has_evidence)),
                        is_empty_talk=bool(data.get("is_empty_talk", has_empty and not has_evidence)),
                        tone=str(data.get("tone", tone)),
                        key_phrases=list(data.get("key_phrases", key_phrases)) or key_phrases,
                        category=str(data.get("category", category)),
                    )
        except Exception as e:
            logger.warning(f"LLM语义理解失败，降级到规则: {e}")

    # 规则降级
    return LLMSemanticOutput(
        situation=situation,
        intent=intent,
        has_evidence=has_evidence,
        is_empty_talk=has_empty and not has_evidence,
        tone=tone,
        key_phrases=key_phrases,
        category=category,
    )


# ============================================================
# 第2层：DPU 需求标注
# ============================================================

# 关键词 → 12维需求映射
_DPU_KEYWORD_MAP: List[Tuple[List[str], int]] = [
    (["累", "困", "饿", "睡", "身体", "病", "疼", "吃", "没睡", "不舒服"], 0),  # 生理生存
    (["稳定", "安全", "确定", "保证", "怕", "担心", "风险", "焦虑", "害怕", "没安全感"], 1),  # 安全稳定
    (["朋友", "家人", "一起", "我们", "孤独", "没人", "聚会", "陪", "想你", "在一起"], 2),  # 社交归属
    (["理解", "懂我", "听我说", "想要", "其实我", "不明白", "你不懂", "你知道吗"], 3),  # 被理解
    (["尊重", "认可", "价值", "厉害", "优秀", "成功", "成就", "能力", "看不起", "小看我"], 4),  # 尊重认可
    (["为什么", "怎么", "原理", "了解", "学习", "研究", "知识", "信息", "好奇"], 5),  # 认知求知
    (["好看", "美", "艺术", "品味", "设计", "精致", "丑", "难看"], 6),  # 审美价值
    (["梦想", "目标", "实现", "意义", "使命", "成为", "追求", "理想", "价值"], 7),  # 自我实现
    (["自由", "我想", "我决定", "选择", "控制", "我要", "独立", "自己做"], 8),  # 自由掌控
    (["公平", "凭什么", "不合理", "应该", "对等", "不公正", "凭什么", "规则"], 9),  # 公平公正
    (["进步", "成长", "提升", "更好", "进阶", "改变", "证书", "突破", "学习新"], 10),  # 成长进阶
    (["超越", "更高", "更强", "境界", "人生", "意义", "自我超越"], 11),  # 超越自我
]


def _dpu_annotate_demands(user_input: str, semantic: LLMSemanticOutput) -> DPUDemandState:
    """
    第2层：分析用户输入，标注12维需求激活情况。
    结合关键词匹配 + 语义信息综合判断。
    """
    demands = [0.0] * 12

    # 关键词匹配
    for keywords, need_id in _DPU_KEYWORD_MAP:
        hits = sum(1 for kw in keywords if kw in user_input)
        if hits > 0:
            demands[need_id] = min(1.0, hits * 0.3)

    # 语义层增强：如果LLM判断"有证据"，轻微提升认知和被理解需求
    if semantic.has_evidence:
        demands[3] = max(demands[3], 0.15)  # 被理解
        demands[5] = max(demands[5], 0.2)   # 认知求知

    # 语义层增强：如果LLM判断"空话"，压制尊重认可和被理解
    if semantic.is_empty_talk:
        demands[4] = max(demands[4], 0.3)   # 尊重认可（被压制用正数表示激活方向，后续反算）
        demands[3] = max(demands[3], 0.2)   # 被理解
        # 空话实际上是压制，但这里用正值标记，后续在状态更新时反算

    # 被识别为"质问"语气 → 激活公平公正
    if semantic.tone == "质问性":
        demands[9] = max(demands[9], 0.4)

    # 被识别为"情感表达" → 激活被理解 + 社交归属
    if semantic.category == "情感表达":
        demands[3] = max(demands[3], 0.3)
        demands[2] = max(demands[2], 0.2)

    # 压制列表（空话压制尊重认可和被理解）
    suppressed: List[int] = []
    if semantic.is_empty_talk:
        suppressed = [4, 3]

    # 激活列表
    activated = [i for i, v in enumerate(demands) if v > 0.15]

    total = sum(demands)

    return DPUDemandState(
        demands=demands,
        suppressed=suppressed,
        activated=activated,
        total_activation=round(total, 3),
    )


# ============================================================
# 第3层：DPU 状态更新
# ============================================================

def _dpu_update_state(
    old_state: List[float],
    demand_delta: DPUDemandState,
    config: TierConfig,
    round_n: int,
) -> Tuple[List[float], str]:
    """
    第3层：更新12维心理状态。
    - 旧状态指数衰减（遗忘）
    - 新激活叠加
    - 核心需求放大
    - 综合判断当前档位
    """
    # 确保 old_state 是 12 维
    if len(old_state) < 12:
        old_state = old_state + [0.0] * (12 - len(old_state))
    if len(old_state) > 12:
        old_state = old_state[:12]

    # 敏感权重（她对各维度的敏感程度）
    sens = config.need_sensitivities
    if len(sens) < 12:
        sens = sens + [1.0] * (12 - len(sens))

    # 指数衰减系数
    DECAY = 0.82

    new_state = [0.0] * 12
    for i in range(12):
        decayed = old_state[i] * DECAY
        delta = demand_delta.demands[i]

        # 压制：需求被压制时是负值，但在 demands 里我们用正值标记"方向"
        # 如果 i 在 suppressed 里，说明这次是压制，需要从旧状态里扣减
        if i in demand_delta.suppressed:
            # 压制 = 从当前状态里扣减
            delta = -0.3 * sens[i]
        else:
            # 激活：应用敏感权重
            delta = delta * sens[i]
            # 核心需求放大（如果这个维度在这个人的核心需求里）
            if i in getattr(config, "core_needs", []):
                delta *= 1.3

        new_state[i] = max(0.0, min(1.0, decayed + delta))

    # 判断当前档位
    total = sum(new_state)
    avg_activation = total / 12

    # 炸毛检测：压制超过阈值
    has_exploding = len(demand_delta.suppressed) > 0 and total > 1.0

    if has_exploding:
        tier = "exploding"
        reason = f"你说了空话，压制了她的{','.join(NEED_NAMES_CN[i] for i in demand_delta.suppressed)}，她炸毛了"
    elif total > 2.5:
        tier = "softening"
        reason = "你的话接通了她的情感需求，她开始软化了"
    elif total > 1.5:
        tier = "cautious"
        reason = "她在观望你的下一步"
    elif avg_activation > 0.15:
        tier = "connecting"
        reason = "你在尝试跟她建立连接"
    else:
        tier = "cold"
        reason = "她暂时不想回应，或者你的话太中性了"

    return new_state, tier, reason


# ============================================================
# 第4层：档位决策 + 话语检索
# ============================================================

# 默认硬编码模板库（完全不依赖任何数据）
DEFAULT_TIER_LIBRARY: Dict[str, List[str]] = {
    "cold": [
        "嗯。",
        "哦。",
        "……",
        "行。",
        "随便。",
        "。",
        "……行吧。",
        "嗯嗯。",
        "好。",
        "知道了。",
    ],
    "cautious": [
        "然后呢？",
        "所以呢？",
        "你想说什么？",
        "……继续。",
        "所以你想表达什么？",
        "嗯，你继续。",
        "我在听。",
        "说重点。",
        "你到底想干嘛？",
        "……然后？",
    ],
    "softening": [
        "……是吗。",
        "……你真的这么想？",
        "嗯……好吧。",
        "……好吧，我听着呢。",
        "你继续说。",
        "……有点道理。",
        "那你是怎么想的？",
        "……我知道了。",
        "你说吧。",
        "行，我再给你一次机会。",
    ],
    "exploding": [
        "你有病吧？",
        "你每次都这么说！",
        "说点实际的好吗？",
        "我不想听这些。",
        "滚。",
        "你有完没完？",
        "这种话你也说得出口？",
        "谁允许你了？",
        "我懒得理你。",
        "闭嘴。",
    ],
    "connecting": [
        "谢谢你告诉我这些。",
        "我懂你的意思了。",
        "其实我也……",
        "嗯，我记住了。",
        "谢谢你愿意跟我说这些。",
        "我知道你在努力。",
        "嗯……谢谢你。",
        "你这么说，我很高兴。",
        "我感受到了。",
        "我们好好聊聊吧。",
    ],
}


def _tier_decide_and_retrieve(
    tier: str,
    tier_library: Optional[TierLibrary],
    config: TierConfig,
    semantic: LLMSemanticOutput,
) -> TierDecision:
    """
    第4层：根据当前档位，从话语库里检索3个候选句。
    优先用她自己的原话库（tier_library），不够则补充默认模板。
    """
    # 获取该档位的句子
    tier_cn = TIER_DEFINITIONS.get(tier, {}).get("cn", "观望")
    desc = TIER_DEFINITIONS.get(tier, {}).get("desc", "")

    candidates: List[str] = []

    if tier_library:
        texts = tier_library.get_tier_texts(tier)
        if texts:
            candidates = texts[:10]  # 最多取10条
        else:
            # 用默认模板，但性别适配一下
            candidates = DEFAULT_TIER_LIBRARY.get(tier, [])[:10]
    else:
        candidates = DEFAULT_TIER_LIBRARY.get(tier, [])[:10]

    # 如果不够10条，补满
    default_pool = DEFAULT_TIER_LIBRARY.get(tier, [])
    while len(candidates) < 3:
        remaining = [c for c in default_pool if c not in candidates]
        if not remaining:
            break
        candidates.append(random.choice(remaining))

    # 随机选1个作为默认选中
    selected_index = 0
    if len(candidates) > 1:
        selected_index = random.randint(0, min(2, len(candidates) - 1))

    # 匹配度排序（空话场景下，冷淡档比炸毛档更匹配）
    reason = f"[{tier_cn}] {desc}。系统从{len(candidates)}个候选中选中第{selected_index+1}句。"
    if semantic.is_empty_talk and tier == "cold":
        reason += "（空话+冷淡档：你没有内容，她懒得回应。）"
    elif semantic.is_empty_talk and tier == "exploding":
        reason += "（空话+炸毛档：说了等于没说，她炸了。）"
    elif semantic.has_evidence and tier in ["softening", "connecting"]:
        reason += "（有具体证据，她开始软化了。）"

    return TierDecision(
        tier=tier,
        tier_cn=tier_cn,
        reason=reason,
        candidates=candidates[:3],
        selected_index=selected_index,
    )


# ============================================================
# 第5层：LLM 精选 + 润色
# ============================================================

def _llm_polish(
    candidate: str,
    tier: str,
    user_input: str,
    persona_name: str,
    use_llm: bool = True,
) -> Tuple[str, str]:
    """
    第5层：LLM 精选 + 润色。
    
    重要：LLM 只做润色（改措辞），绝对不能改变候选句的态度和内容。
    如果 LLM 不可用，直接返回候选句。
    
    返回：(润色后的句子, 回复来源)
    """
    if not use_llm or not candidate:
        return candidate, "tier_template"

    try:
        from llm_client.factory import LLMFactory
        client = LLMFactory.create_client("tongyi")

        tier_cn = TIER_DEFINITIONS.get(tier, {}).get("cn", "观望")
        tier_desc = TIER_DEFINITIONS.get(tier, {}).get("desc", "")

        # 硬约束 prompt：LLM 绝对不能软化候选句
        prompt = f"""你是一个文字润色工具。你的任务：

**绝对规则（违反会输出原始句子）：**
1. 只改措辞（同义词替换、调整语序），**绝对不改变态度**
2. **绝对不能把刻薄变温和、把冷淡变热情**
3. 如果你把句子改温和了，直接返回原始句子，不要改

**当前档位：{tier_cn}（{tier_desc}）**
**她（{persona_name}）的人设是：这个档位下她必须保持{tier_cn}的态度**

**候选句（只润色，不软化）：**
"{candidate}"

请输出一句话（只输出这句话，不要解释）：
"""
        resp = client.generate(prompt, max_tokens=80, temperature=0.3)
        if resp.is_success and resp.content:
            polished = resp.content.strip()
            polished = re.sub(r'^["""「』\s]+|["""「』\s]+$', '', polished)
            if len(polished) > 2 and len(polished) < 60:
                return polished, "llm_polished"
    except Exception as e:
        logger.warning(f"LLM润色失败: {e}")

    return candidate, "tier_template"


# ============================================================
# 诊断报告生成
# ============================================================

def generate_diagnosis_report(
    needs_history: List[List[float]],
    tier_history: List[str],
) -> Dict[str, Any]:
    """
    对话结束后，根据历史数据生成诊断报告。
    """
    if not needs_history or not tier_history:
        return {
            "total_rounds": 0,
            "overall_score": 0,
            "summary": "数据不足，无法生成诊断报告。",
            "suggestions": ["建议先进行一轮完整的对话后再查看诊断报告。"],
            "boom_rounds": [],
            "best_rounds": [],
        }

    total_rounds = len(needs_history)
    boom_rounds = [i + 1 for i, t in enumerate(tier_history) if t == "exploding"]
    best_rounds = [i + 1 for i, t in enumerate(tier_history) if t == "connecting"]

    # 计算综合得分（0-100）
    # 炸毛越少越好，连接档越多越好
    boom_penalty = len(boom_rounds) * 15
    connecting_bonus = len(best_rounds) * 10
    score = max(0, min(100, 70 - boom_penalty + connecting_bonus))

    # 生成建议
    suggestions = []
    if len(boom_rounds) >= 3:
        suggestions.append("你在对话中多次触发了她的防御机制。建议：少说空话，多说具体事实。")
    elif len(boom_rounds) >= 1:
        suggestions.append(f"第{boom_rounds[0]}轮你说了空话触发了她的炸毛反应。这是关键转折点。")
    if len(best_rounds) >= 2:
        suggestions.append(f"第{best_rounds[0]}轮和{best_rounds[1]}轮你成功接通了她的情感需求，那两轮的沟通方式值得保持。")
    if len(best_rounds) == 0:
        suggestions.append("整场对话中你没有触发连接档。多尝试表达具体感受和事实，少说空泛的道歉。")
    if score >= 80:
        suggestions.append("整体沟通评分优秀！你很好地把握了她的需求边界。")
    elif score >= 60:
        suggestions.append("沟通评分中等。继续保持，但注意不要在关键时刻说空话。")
    else:
        suggestions.append("沟通评分较低。建议重新审视自己的沟通方式：多给具体信息，少用空话应付。")

    summary = (
        f"本轮对话共{total_rounds}轮，"
        f"触发炸毛{len(boom_rounds)}次，"
        f"成功连接{len(best_rounds)}次。"
        f"综合评分{score}分。"
    )

    return {
        "total_rounds": total_rounds,
        "needs_history": needs_history,
        "tier_history": tier_history,
        "boom_rounds": boom_rounds,
        "best_rounds": best_rounds,
        "overall_score": score,
        "summary": summary,
        "suggestions": suggestions,
    }


# ============================================================
# 主入口：tier_chat（完整5层处理）
# ============================================================

def tier_chat(
    user_input: str,
    old_needs_state: List[float],
    tier_library: Optional[TierLibrary],
    tier_config: Optional[TierConfig],
    persona_name: str,
    round_n: int = 1,
    use_llm: bool = True,
) -> TierEngineResponse:
    """
    DPU大脑 + LLM嘴 完整处理流程。
    
    参数：
      user_input: 用户输入
      old_needs_state: 当前的12维心理状态
      tier_library: 档位话语库（可选）
      tier_config: 档位配置（可选）
      persona_name: NPC的名字
      round_n: 当前轮次
      use_llm: 是否启用LLM（False则完全走规则引擎）
    
    返回：
      TierEngineResponse，包含所有5层的输出
    """
    try:
        # 初始化配置
        config = tier_config or TierConfig()
        if not getattr(config, "gender_hint", None):
            config.gender_hint = "中性"

        # ---- 第1层：LLM语义理解 ----
        semantic = _llm_semantic_understand(user_input, use_llm)

        # ---- 第2层：DPU需求标注 ----
        demand_state = _dpu_annotate_demands(user_input, semantic)

        # ---- 第3层：DPU状态更新 ----
        new_state, tier, tier_reason = _dpu_update_state(
            old_needs_state, demand_state, config, round_n
        )

        # ---- 第4层：档位决策 + 话语检索 ----
        decision = _tier_decide_and_retrieve(
            tier, tier_library, config, semantic
        )

        # ---- 第5层：LLM精选 + 润色 ----
        selected_candidate = decision.candidates[decision.selected_index] if decision.candidates else "……"
        reply, reply_source = _llm_polish(
            selected_candidate, tier, user_input, persona_name, use_llm
        )

        # ---- 生成分析说明 ----
        analysis_parts = []
        if semantic.is_empty_talk:
            analysis_parts.append(
                f"⚠️ 你说了空话（无具体证据），压制了对方的{','.join(NEED_NAMES_CN[i] for i in demand_state.suppressed)}需求。"
            )
        if demand_state.activated:
            activated_names = [NEED_NAMES_CN[i] for i in demand_state.activated]
            analysis_parts.append(f"✨ 你的话激活了：{', '.join(activated_names)}。")
        analysis_parts.append(decision.reason)
        analysis = " ".join(analysis_parts)

        return TierEngineResponse(
            success=True,
            semantic=semantic,
            demand_state=demand_state,
            decision=decision,
            reply=reply,
            reply_source=reply_source,
            analysis=analysis,
            tier=tier,
            new_needs_state=new_state,
            round_number=round_n,
        )

    except Exception as e:
        logger.exception(f"Tier Engine 处理失败: {e}")
        # 出错时返回最安全的降级回复
        return TierEngineResponse(
            success=False,
            reply="……",
            reply_source="error",
            analysis=f"处理出错：{str(e)}",
            tier="cautious",
            new_needs_state=old_needs_state,
            round_number=round_n,
            error=str(e),
        )
