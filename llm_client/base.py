"""
LLM客户端基类
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, Dict, Any


@dataclass
class LLMResponse:
    """LLM响应结构"""
    content: str
    model: str
    usage: Optional[Dict] = None
    error: Optional[str] = None
    
    @property
    def is_success(self) -> bool:
        return self.error is None


class LLMClient(ABC):
    """LLM客户端抽象基类"""
    
    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None, **kwargs):
        self.api_key = api_key
        self.base_url = base_url
        self.config = kwargs
    
    @abstractmethod
    def generate(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> LLMResponse:
        """生成文本"""
        pass
    
    @abstractmethod
    def get_model_name(self) -> str:
        """获取模型名称"""
        pass

    # ========================================================================
    # 【架构入口 ①】LLM 语义提取层
    #  把"自然语言"翻译为"需求信号关键词"
    #  注意：LLM 只做翻译，不做需求 ID 判断——需求 ID 交给 DPU 关键词匹配
    # ========================================================================
    def extract_demand_signals(self, user_input: str) -> Dict[str, Any]:
        """
        从用户输入中提取需求信号关键词/短语。

        返回:
        {
            "extracted_signals": [
                {"text": "不认真听我说话", "tone": "抱怨"},
                {"text": "对我来说根本不重要", "tone": "委屈"},
            ],
            "context": "亲密关系中的抱怨",
            "emotional_tone": "委屈 + 愤怒",
            "implicit_needs": ["被倾听", "被在乎"]
        }
        """
        system_prompt = """【LLM 语义提取层】

你是一个敏锐的对话观察者。你的任务只有一件事：
从用户输入里，提取出那些"表达了某种需求信号"的关键词/短语/句子片段。

⚠️ 不要做任何"这个信号属于哪个需求维度"的判断——那个留给 DPU。
⚠️ 你只需要：挑出那些有情绪有态度的信号词，不要那些中性的叙述。

比如用户说："你总是不认真听我说话，好像我对你来说根本不重要"
你要提取：
- "不认真听我说话"（抱怨）
- "对我来说根本不重要"（委屈）

请按以下 JSON 格式输出：
{
    "extracted_signals": [
        {"text": "从原文提取的关键信号短语", "tone": "情绪色彩/语气"}
    ],
    "context": "一句话描述这个场景是什么（如：亲密关系中的抱怨 / 求职焦虑 / 学术困惑）",
    "emotional_tone": "一句话描述情绪底色（如：委屈 + 愤怒 / 焦虑 + 期待 / 释然）",
    "implicit_needs": ["被倾听", "被在乎", ...不超过3个，是你从这段话里读出来的深层"想要什么"]
}

越简洁越好。extracted_signals 里的 text 要从原文里挑，不要自己编。"""

        response = self.generate(user_input, system_prompt=system_prompt, temperature=0.3)

        if not response.is_success:
            return {"error": response.error, "extracted_signals": []}

        import json
        import re

        try:
            json_match = re.search(r'\{[\s\S]*\}', response.content)
            if json_match:
                data = json.loads(json_match.group())
                return data
            else:
                return {"error": "无法解析响应", "raw": response.content, "extracted_signals": []}
        except Exception as e:
            return {"error": str(e), "raw": response.content, "extracted_signals": []}

    # ========================================================================
    # 【备用】LLM 直接做需求 ID 分析
    #  当 extract_demand_signals + DPU 关键词匹配都失败时，才会退到这里。
    #  正常情况下不应该走到这里。
    # ========================================================================
    def analyze_demand(self, user_input: str) -> Dict[str, Any]:
        """
        备用：直接让 LLM 判断需求维度
        """
        system_prompt = """【DPU 需求分析专家】

你是基于马斯洛需求层次理论的需求分析专家。分析用户输入，判断涉及的需求维度并给出激活强度(0-1)。

12维需求：
D0: 生理生存-饮食睡眠健康。**注意：如果吃只是场景而非核心诉求，不要激活D0**
D1: 安全稳定-安全稳定财务焦虑恐惧
D2: 社交归属-朋友群体归属感，被孤立，**一个人**，孤独
D3: 情感陪伴-陪伴情感温暖被冷落
D4: 尊重认可-尊重地位成就被看不起
D5: 认知求知-学习知识探索困惑
D6: 审美价值-美感品质和谐
D7: 自我实现-理想创造潜能不甘
D8: 自由掌控-自主控制独立被束缚
D9: 公平公正-公平正义权益
D10: 成长进阶-成长进步挑战
D11: 秩序规整-秩序计划条理

## 关键判断原则
1. **区分"场景词"和"核心诉求"**。
   - 当字面词只是场景载体时，提取背后的真实需求。
     例："一个人吃饭没味道"→ 吃饭是场景，核心是 D2 社交归属 + D3 情感陪伴
   - 当字面词本身就是核心诉求时，尊重它。
     例："我自己能扛"→ 能扛=自主独立，核心是 D8 自由掌控，可以同时识别潜层情感但不覆盖它
     例："我很焦虑害怕"→ 害怕=安全需求，核心是 D1 安全稳定，不需要过度解读
2. 一句话通常涉及多个需求，主需求 urgency 最高，次需求按重要性排列
3. urgency=紧迫程度，importance=对生活影响程度。两者独立判断，不要互相复制
4. 不要为凑数给无关需求低分。如果只有1-2个需求明确激活，就只输出1-2个

## 输出格式(只返回JSON，不要额外文字)：
{"needs":[{"id":0,"urgency":0.3,"importance":0.5,"resource_dep":0.2,"intent":0.6,"reason":"简要说明"}]}"""

        response = self.generate(user_input, system_prompt=system_prompt, temperature=0.3)
        
        if not response.is_success:
            return {"error": response.error, "needs": []}
        
        import json
        import re
        
        try:
            json_match = re.search(r'\{[\s\S]*\}', response.content)
            if json_match:
                data = json.loads(json_match.group())
                return data
            else:
                return {"error": "无法解析响应", "needs": []}
        except Exception as e:
            return {"error": str(e), "needs": []}
    
    # ========================================================================
    # 【架构入口 ④】LLM 自然语言回答层
    #  基于 DPU 的结构化分析结果，给用户自然语言的解读/建议/回答
    #  这里 LLM 不自己重新分析，只基于已有的 DPU 结果来表达
    # ========================================================================
    def reply_based_on_dpu(self, user_input: str, dpu_context: Dict[str, Any], 
                          user_question: str = None) -> str:
        """
        基于 DPU 分析结果给用户回答。

        参数:
            user_input: 原始用户输入
            dpu_context: DPU 的结构化分析结果
                {
                    "activation12": [0.0, 0.0, 0.0, 0.85, 0.80, ...],
                    "top_needs": ["情感陪伴 85%", "尊重认可 80%"],
                    "suppressed": ["被压制的需求信息"],
                    "conflicts": ["冲突信息"],
                    "signals": ["LLM 提取的信号词"],
                }
            user_question: 用户具体问的问题（可选），没有的话就给通用解读
        """
        needs_names = ["生理生存", "安全稳定", "社交归属", "情感陪伴", 
                       "尊重认可", "认知求知", "审美价值", "自我实现", 
                       "自由掌控", "公平公正", "成长进阶", "秩序规整"]
        activations = dpu_context.get("activation12", [])
        
        activation_desc = []
        for i, v in enumerate(activations):
            if v > 0.15:
                activation_desc.append(f"{needs_names[i]}({int(v*100)}%)")
        activation_text = "、".join(activation_desc) if activation_desc else "没有明显激活"

        if user_question:
            prompt = f"""【基于 DPU 分析回答用户问题】

原始文本："{user_input}"

DPU 分析结果（12维需求激活）：{activation_text}
核心需求：{', '.join(dpu_context.get('top_needs', []))}
被压制的需求：{', '.join(dpu_context.get('suppressed', [])) or '无'}
冲突信号：{', '.join(dpu_context.get('conflicts', [])) or '无'}
提取到的信号词：{', '.join(dpu_context.get('signals', [])) or '无'}

用户的问题："{user_question}"

请基于上面的 DPU 分析来回答。不要凭空编新信息，不要说"我认为"——你看到的信息就是上面列出的。
如果用户问的是"他想要什么"，就基于激活的需求来回答他最在乎的是什么。
如果用户问的是"该怎么回应"，就基于最主要的需求给一个简短、具体、口语化的回应建议。
"""
        else:
            prompt = f"""【基于 DPU 分析做需求解读】

原始文本："{user_input}"

DPU 分析结果（12维需求激活）：{activation_text}
核心需求：{', '.join(dpu_context.get('top_needs', []))}
被压制的需求：{', '.join(dpu_context.get('suppressed', [])) or '无'}
冲突信号：{', '.join(dpu_context.get('conflicts', [])) or '无'}
提取到的信号词：{', '.join(dpu_context.get('signals', [])) or '无'}

请你做一个 150 字以内的解读，回答三个问题：
1. 这段话最核心的心理信号是什么？
2. 对方/作者最想要被满足的需求是什么？
3. 如果我想回应，应该从哪个需求出发去说话？

不要使用学术化的表达，尽量口语化。"""

        response = self.generate(prompt, system_prompt="你是一个敏锐、接地气的心理观察者。不使用学术术语，用普通人能听懂的话来说。", temperature=0.5)
        return response.content if response.is_success else f"（LLM 响应失败：{response.error}）"
