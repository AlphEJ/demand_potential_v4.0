"""
12维需求标准描述文本
用于向量语义匹配的基准向量生成
中英文双语版本，后续可扩展更多语言
"""

from typing import Dict, List

# ============================================================
# 中文标准描述（用于句子嵌入）
# ============================================================
DESCRIPTIONS_ZH: Dict[int, str] = {
    0: "生理生存需求：感到饥饿、口渴、疲劳、身体不适，需要食物、水、睡眠、休息、健康保障。当人说饿了、困了、累了、身体不舒服时，属于此类。",
    1: "安全稳定需求：感到焦虑、不安、恐惧，担心失业、缺钱、没有保障，需要稳定收入、安全环境、风险规避。当人说害怕、担心、压力大、不安全时，属于此类。",
    2: "社交归属需求：感到孤独、被孤立、被排斥，渴望交朋友、融入群体、被接纳。当人说没人理我、不合群、被冷落、想找人聊天时，属于此类。",
    3: "情感陪伴需求：感到被冷落、不被关心、思念某人，渴望亲密关系、情感慰藉、温暖陪伴。当人说想你了、陪陪我、在乎我、别离开我时，属于此类。",
    4: "尊重认可需求：感到被轻视、不被尊重、没面子，渴望被认可、被重视、有地位。当人说看不起我、不重要、没价值、丢脸时，属于此类。",
    5: "认知求知需求：感到困惑、不理解、想知道，渴望学习新知识、探索未知、搞清楚问题。当人说搞不懂、想了解、学不会、不明白时，属于此类。",
    6: "审美价值需求：追求美感、品质、格调、和谐体验，对粗糙低劣感到不满。当人说好看、有品味、精致、有格调时，属于此类。",
    7: "自我实现需求：感到不甘平庸、想要实现梦想、发挥潜能、创造价值。当人说想改变、不甘心、追求梦想、实现目标时，属于此类。",
    8: "自由掌控需求：感到被控制、被束缚、被限制，渴望自主决策、掌控生活、独立空间。当人说别管我、不想被控制、需要自由、自己做主时，属于此类。",
    9: "公平公正需求：感到不公平、被偏心、被区别对待，渴望公正、合理、权益保障。当人说凭什么、不公平、偏袒、被欺负时，属于此类。",
    10: "成长进阶需求：渴望进步、提升能力、变得更强、超越自我。当人说想进步、要成长、变强、突破自己时，属于此类。",
    11: "秩序规整需求：需要计划、规律、条理，对混乱无序感到不适。当人说太乱了、需要规划、整理一下、有规律时，属于此类。",
}

# ============================================================
# 英文标准描述
# ============================================================
DESCRIPTIONS_EN: Dict[int, str] = {
    0: "Physiological survival needs: feeling hungry, thirsty, tired, or physically unwell. Needing food, water, sleep, rest, and health security. When someone says they are hungry, tired, or not feeling well.",
    1: "Safety and stability needs: feeling anxious, fearful, or insecure. Worrying about job loss, lack of money, or lack of protection. Needing stable income, safe environment, and risk avoidance. When someone expresses fear, worry, pressure, or insecurity.",
    2: "Social belonging needs: feeling lonely, isolated, or excluded. Desiring friendship, group integration, and acceptance. When someone says they feel ignored, left out, or want to connect with others.",
    3: "Emotional companionship needs: feeling neglected, uncared for, or missing someone. Desiring intimate relationships, emotional comfort, and warm companionship. When someone says they miss you, want company, or feel unloved.",
    4: "Respect and recognition needs: feeling belittled, disrespected, or losing face. Desiring recognition, importance, and status. When someone feels undervalued, unimportant, or ashamed.",
    5: "Cognitive knowledge needs: feeling confused, not understanding, or wanting to learn. Desiring knowledge acquisition, exploration, and clarity. When someone expresses confusion or desire to understand.",
    6: "Aesthetic value needs: pursuing beauty, quality, taste, and harmonious experience. Dissatisfaction with roughness or inferiority. When someone appreciates elegance, refinement, or design.",
    7: "Self-actualization needs: feeling不甘于平庸, wanting to realize dreams, fulfill potential, and create value. When someone wants change, pursues dreams, or seeks meaning.",
    8: "Freedom and autonomy needs: feeling controlled, constrained, or restricted. Desiring independent decision-making, life control, and personal space. When someone says don't control me, need freedom, or want autonomy.",
    9: "Fairness and justice needs: feeling unfairly treated, discriminated against, or biased. Desiring justice, reasonableness, and rights protection. When someone says it's unfair, shows favoritism, or feels wronged.",
    10: "Growth progression needs: desiring improvement, capability enhancement, becoming stronger, and self-transcendence. When someone wants to progress, grow, or break through limits.",
    11: "Order structure needs: needing plans, regularity, and organization. Discomfort with chaos and disorder. When someone says things are chaotic, needs planning, or wants organization.",
}

# ============================================================
# 简版描述（用于快速embedding，短文本更精准）
# ============================================================
DESCRIPTIONS_SHORT_ZH: Dict[int, str] = {
    0: "饿了困了累了身体不舒服需要休息健康",
    1: "害怕担心焦虑不安压力大缺钱没保障风险安全",
    2: "孤独孤立被冷落想交朋友融入群体被接纳",
    3: "想念在乎陪伴温暖亲密关系情感慰藉别离开",
    4: "被看不起不重要没价值丢脸需要认可尊重地位",
    5: "困惑不懂想学习探索未知搞清楚弄明白求知",
    6: "美感品味格调精致品质好看优雅审美",
    7: "不甘平庸实现梦想发挥潜能创造价值改变人生",
    8: "别管我需要自由自主独立不想被控制束缚空间",
    9: "不公平凭什么偏袒被欺负权益公正合理待遇",
    10: "想进步要成长变强突破提升能力超越自己",
    11: "太乱了需要规划整理规律条理秩序计划安排",
}

DESCRIPTIONS_SHORT_EN: Dict[int, str] = {
    0: "hungry tired exhausted need food water sleep rest health",
    1: "afraid worried anxious stressed insecure money safety stability risk",
    2: "lonely isolated excluded need friends belonging acceptance social",
    3: "miss you care about me companionship warmth intimate emotional comfort",
    4: "looked down upon unimportant worthless need respect recognition status",
    5: "confused don't understand curious want to learn explore knowledge",
    6: "beauty taste quality elegance aesthetic refined harmonious",
    7: "unfulfilled dreams potential self actualization meaning purpose change",
    8: "don't control me need freedom autonomy independence personal space",
    9: "unfair why me favoritism justice rights equality fair treatment",
    10: "improve grow stronger progress breakthrough self transcendence",
    11: "chaotic need organization plan structure order regularity systematic",
}


def get_all_descriptions(lang: str = "zh", short: bool = False) -> Dict[int, str]:
    """获取所有12维度的标准描述文本。

    Args:
        lang: 语言代码，'zh'/'en'
        short: 是否使用简版描述

    Returns:
        {need_id: description_text} 字典
    """
    if lang == "en" and short:
        return DESCRIPTIONS_SHORT_EN
    elif lang == "en":
        return DESCRIPTIONS_EN
    elif short:
        return DESCRIPTIONS_SHORT_ZH
    else:
        return DESCRIPTIONS_ZH


def get_description(need_id: int, lang: str = "zh", short: bool = False) -> str:
    """获取单个维度的描述文本"""
    if lang == "en" and short:
        return DESCRIPTIONS_SHORT_EN.get(need_id, "")
    elif lang == "en":
        return DESCRIPTIONS_EN.get(need_id, "")
    elif short:
        return DESCRIPTIONS_SHORT_ZH.get(need_id, "")
    else:
        return DESCRIPTIONS_ZH.get(need_id, "")
