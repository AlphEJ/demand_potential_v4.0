"""
需求势能3.0 - 12维需求定义
基于马斯洛需求层次理论原生衍生
"""

from enum import IntEnum
from dataclasses import dataclass, field
from typing import Dict, List, Optional


class MaslowLayer(IntEnum):
    """马斯洛五层需求层级"""
    PHYSIOLOGICAL = 0      # L0 生理层
    SAFETY = 1             # L1 安全层  
    SOCIAL = 2             # L2 社交归属层
    ESTEEM = 3             # L3 尊重层
    SELF_ACTUALIZATION = 4 # L4 自我实现层
    
    @property
    def name_cn(self) -> str:
        names = {0: "生理层", 1: "安全层", 2: "社交归属层", 3: "尊重层", 4: "自我实现层"}
        return names[self.value]
    
    @property
    def level_weight(self) -> float:
        """层级固定权重，底层天然高于上层"""
        weights = {0: 0.95, 1: 0.90, 2: 0.75, 3: 0.65, 4: 0.50}
        return weights[self.value]
    
    @property
    def level_factor(self) -> float:
        """层级乘法调制器"""
        factors = {0: 1.0, 1: 1.0, 2: 0.85, 3: 0.85, 4: 0.70}
        return factors[self.value]


class NeedMeta:
    """12维需求元数据"""
    
    # 12维需求定义 (D1-D12)
    NAMES: Dict[int, str] = {
        0: "生理生存",      # D1
        1: "安全稳定",      # D2
        2: "社交归属",      # D3
        3: "情感陪伴",      # D4
        4: "尊重认可",      # D5
        5: "认知求知",      # D6
        6: "审美价值",      # D7
        7: "自我实现",      # D8
        8: "自由掌控",      # D9
        9: "公平公正",      # D10
        10: "成长进阶",     # D11
        11: "秩序规整",     # D12
    }
    
    NAMES_EN: Dict[int, str] = {
        0: "Physiological Survival",
        1: "Safety Stability",
        2: "Social Belonging",
        3: "Emotional Companionship",
        4: "Respect Recognition",
        5: "Cognitive Knowledge",
        6: "Aesthetic Value",
        7: "Self Actualization",
        8: "Freedom Control",
        9: "Fairness Justice",
        10: "Growth Progression",
        11: "Order Structure",
    }
    
    # 需求归属层级
    LAYER_MAP: Dict[int, MaslowLayer] = {
        0: MaslowLayer.PHYSIOLOGICAL,
        1: MaslowLayer.SAFETY,
        2: MaslowLayer.SOCIAL,
        3: MaslowLayer.SOCIAL,
        4: MaslowLayer.ESTEEM,
        5: MaslowLayer.ESTEEM,
        6: MaslowLayer.SELF_ACTUALIZATION,
        7: MaslowLayer.SELF_ACTUALIZATION,
        8: MaslowLayer.SELF_ACTUALIZATION,
        9: MaslowLayer.SELF_ACTUALIZATION,
        10: MaslowLayer.SELF_ACTUALIZATION,
        11: MaslowLayer.SELF_ACTUALIZATION,
    }
    
    # 需求描述
    DESCRIPTIONS: Dict[int, str] = {
        0: "基础生命保障、生理诉求满足（饮食、睡眠、健康）",
        1: "风险规避、环境稳定、状态可控、财务安全",
        2: "人际联结、群体融入、情感归属感",
        3: "情绪慰藉、情感共鸣、陪伴诉求",
        4: "他人尊重、自我认同、社会地位、价值认可",
        5: "知识获取、认知提升、逻辑理解、好奇心驱动",
        6: "美感追求、价值判断、品质诉求、和谐体验",
        7: "理想实现、能力突破、价值创造、潜能发挥",
        8: "自主决策、控制感、抵御被迫、主动权诉求",
        9: "公平对待、规则公正、分配合理、权益保障",
        10: "能力提升、进步感、挑战超越、持续改善",
        11: "确定性、规律感、可预测性、混乱规避",
    }
    
    # 层级权重（用于P_base计算）
    LEVEL_WEIGHTS: Dict[int, float] = {
        0: 0.95, 1: 0.90, 2: 0.75, 3: 0.70,
        4: 0.80, 5: 0.85, 6: 0.55, 7: 0.60,
        8: 0.40, 9: 0.35, 10: 0.45, 11: 0.38,
    }
    
    @classmethod
    def get_name(cls, need_id: int) -> str:
        return cls.NAMES.get(need_id, f"Unknown({need_id})")
    
    @classmethod
    def get_name_en(cls, need_id: int) -> str:
        return cls.NAMES_EN.get(need_id, f"Unknown({need_id})")
    
    @classmethod
    def get_layer(cls, need_id: int) -> MaslowLayer:
        return cls.LAYER_MAP.get(need_id, MaslowLayer.SELF_ACTUALIZATION)
    
    @classmethod
    def get_description(cls, need_id: int) -> str:
        return cls.DESCRIPTIONS.get(need_id, "")
    
    @classmethod
    def get_level_weight(cls, need_id: int) -> float:
        return cls.LEVEL_WEIGHTS.get(need_id, 0.3)


@dataclass
class Demand:
    """单个需求实例"""
    id: int                              # 需求编号 0-11
    name: str = ""                       # 需求名称
    description: str = ""                # 需求描述
    layer: MaslowLayer = MaslowLayer.SELF_ACTUALIZATION
    level_weight: float = 0.3            # 层级权重
    
    # 12维影响因子
    urgency: float = 0.0                 # C1 紧急度
    importance: float = 0.0              # C2 重要度
    resource_dep: float = 0.0            # C3 资源依赖度
    intent: float = 0.0                  # C4 意图清晰度
    system_load: float = 0.0             # C5 系统负载
    wait_time: float = 0.0               # C6 等待时长
    exec_cost: float = 0.0               # C7 执行代价
    decay_rate: float = 0.02             # C8 自然衰减系数
    convergence: float = 0.5             # C9 认知收敛度
    base_priority: float = 0.0           # C10 优先级基底
    aging_delta: float = 0.008           # C11 老化增量系数
    strategy: str = "parallel"           # C12 行为策略类型
    
    # 计算结果
    potential_base: float = 0.0          # P_base 基础势能
    potential_couple: float = 0.0        # P_couple 耦合势能
    potential_final: float = 0.0         # P_final 最终势能
    suppressed: bool = False             # 是否被层级压制
    reason: str = ""                     # 激活原因
    
    def __post_init__(self):
        if not self.name:
            self.name = NeedMeta.get_name(self.id)
        if not self.description:
            self.description = NeedMeta.get_description(self.id)
        if self.layer == MaslowLayer.SELF_ACTUALIZATION:
            self.layer = NeedMeta.get_layer(self.id)
        if self.level_weight == 0.3:
            self.level_weight = NeedMeta.get_level_weight(self.id)
    
    @property
    def intent_gate(self) -> float:
        """意图门控：Intent < 0.3 时过滤"""
        return self.intent if self.intent >= 0.3 else 0.0
    
    @property
    def is_valid(self) -> bool:
        """需求是否有效"""
        return self.intent >= 0.3


@dataclass
class DemandSet:
    """需求集合"""
    demands: Dict[int, Demand] = field(default_factory=dict)
    source_text: str = ""                # 原始输入
    timestamp: float = 0.0               # 时间戳
    
    def add(self, demand: Demand):
        self.demands[demand.id] = demand
    
    def get(self, need_id: int) -> Optional[Demand]:
        return self.demands.get(need_id)
    
    def get_valid_demands(self) -> List[Demand]:
        """获取有效需求"""
        return [d for d in self.demands.values() if d.is_valid]
    
    def get_sorted(self, reverse: bool = True) -> List[Demand]:
        """按最终势能排序"""
        valid = self.get_valid_demands()
        return sorted(valid, key=lambda x: x.potential_final, reverse=reverse)
    
    def get_suppressed(self) -> List[Demand]:
        """获取被压制的需求"""
        return [d for d in self.demands.values() if d.suppressed]


# ==================== 关键词匹配表 ====================
# 每个需求ID对应一组关键词/短语，用于从用户输入中提取需求
DEMAND_KEYWORDS: Dict[int, List[str]] = {
    0: ["饿", "吃", "饭", "食物", "喝", "睡", "累", "困", "身体", "健康", "生病", "疼痛",
        "馒头", "米", "菜", "肉", "水果", "饿死", "吃饱", "营养", "休息", "疲惫", "体力",
        "撑不住", "熬不住", "体力不支", "虚脱", "犯困", "想睡", "睡不着", "失眠",
        "胃痛", "头疼", "不舒服", "难受", "病了", "吃药", "看病", "医院"],
    1: ["安全", "稳定", "工作", "收入", "房租", "钱", "工资", "存款", "房贷", "保险",
        "失业", "面试", "考试", "项目", "进度", "风险", "害怕", "担心", "焦虑", "压力",
        "生存", "保障", "积蓄", "经济", "财务", "交租", "实习", "就业",
        "不确定", "没保障", "怕失去", "害怕失去", "不安", "惶恐", "恐惧", "可怕",
        "危机", "威胁", "危险", "不踏实", "心慌", "担忧", "顾虑", "怕", "怕了",
        "裁员", "辞退", "开除", "没工作", "找工作", "养活", "养家", "负担"],
    2: ["朋友", "社交", "聚会", "孤独", "寂寞", "同事", "团队", "群", "聊天", "陪伴",
        "融入", "孤立", "被排斥", "不合群", "想找人", "没人陪", "一个人",
        "没人理", "被排挤", "融入不了", "被冷落", "没人懂", "被忽略", "被抛弃",
        "被丢下", "没人说话", "没人听", "被遗忘", "边缘", "透明人", "不存在感",
        "不合群", "插不上话", "插不进去", "圈子", "被排除", "落单", "形单影只"],
    3: ["爱", "喜欢", "感情", "恋爱", "男朋友", "女朋友", "伴侣", "亲密", "温暖",
        "关心", "思念", "分手", "表白", "心动", "暧昧", "依赖", "心灵", "慰藉",
        "听我说话", "认真听", "不理我", "爱答不理", "冷落", "冷淡", "冷漠",
        "在乎我", "关心我", "陪陪我", "想你", "想念", "思念",
        "温柔", "贴心", "哄我", "抱抱", "依恋",
        "离别", "失去你", "不要我", "丢下我", "抛弃",
        "冷冰冰", "你爱我", "不爱我", "还爱不爱", "到底爱不爱",
        "承诺", "誓言", "约定", "答应过", "许诺", "保证",
        "在乎", "在意", "心疼", "舍不得", "放不下", "牵挂", "惦记",
        "忽冷忽热", "不冷不热", "敷衍", "应付", "打发", "冷漠",
        "陪伴", "陪着", "在身边", "一直在", "不离开", "别走", "别离开"],
    4: ["尊重", "认可", "面子", "地位", "荣誉", "表扬", "成就", "看不起", "羡慕",
        "嫉妒", "攀比", "发朋友圈", "炫耀", "让别人", "看不起我", "证明自己", "尊严",
        "不重要", "没用", "没价值", "废物", "垃圾", "犯贱",
        "忽视", "无视", "不重视", "不当回事", "不当回事儿",
        "贬低", "否定", "打击", "嘲讽", "讽刺", "嘲笑", "笑话",
        "被需要", "被认可", "被肯定", "被重视", "被在乎",
        "丢脸", "丢人", "丢面子", "没面子", "下不来台",
        "瞧不起", "鄙视", "蔑视", "轻视", "怠慢", "敷衍了事",
        "看不起人", "高高在上", "居高临下", "趾高气扬",
        "不尊重", "不被尊重", "不被认可", "不被重视", "不被需要",
        "你算什么", "你算老几", "你算个啥", "什么都不是", "一文不值",
        "没有价值", "没有意义", "可有可无", "无所谓"],
    5: ["学习", "读书", "知识", "课程", "技能", "培训", "提升", "作业",
        "论文", "研究", "好奇", "探索", "专业", "上课",
        "搞清楚", "弄明白", "想明白", "想了解", "想知道", "想搞懂",
        "不明白", "不懂", "不理解", "困惑", "疑惑", "疑问",
        "思考", "琢磨", "研究", "分析", "逻辑", "原理",
        "学会了", "掌握了", "弄懂了", "搞懂了"],
    6: ["美", "艺术", "音乐", "画画", "设计", "品质", "精致", "审美", "品味",
        "好看", "漂亮", "优雅", "创意", "风格", "穿搭", "装饰",
        "丑", "难看", "粗糙", "廉价", "俗气", "土", "low",
        "舒服", "不舒服", "别扭", "违和", "不协调",
        "质感", "格调", "氛围", "意境", "美感"],
    7: ["梦想", "理想", "目标", "实现", "突破", "挑战", "创业", "潜能", "价值",
        "意义", "使命", "追求", "改变世界", "成功", "卓越", "自我", "成长",
        "不想这样", "不想一辈子", "碌碌无为", "浑浑噩噩", "混日子",
        "想要更多", "不甘心", "不甘平庸", "不想凑合", "不想将就",
        "活成", "变成", "不想变成", "不想活成",
        "人生", "一辈子", "未来", "以后", "前途",
        "热爱", "投入", "专注", "沉浸", "心流"],
    8: ["自由", "不想被", "控制", "束缚", "约束", "管", "自主", "选择", "独立",
        "逃离", "辞职", "旅行", "随心", "做自己", "主动权", "掌控",
        "别管我", "不要管我", "一边去", "别烦我", "别逼我", "别催我",
        "我自己能行", "不用你管", "不需要你管", "不关你事", "不关你什么事",
        "限制", "框框", "被控制", "被操纵", "被安排", "被决定",
        "挣脱", "喘不过气", "透不过气", "窒息", "压抑",
        "我要", "我不想", "我不要", "我偏要", "我偏不",
        "凭什么管我", "谁给你的权利", "你凭什么", "管太宽",
        "空间", "私人空间", "独处", "一个人待着", "清净"],
    9: ["公平", "公正", "不公", "偏心", "歧视", "平等", "正义", "权益", "合理",
        "规则", "凭什么", "不合理", "剥削", "压榨",
        "总是", "每次都", "从来都", "从来都是", "一向如此", "永远都是",
        "凭啥", "不公平", "不对等", "双标", "区别对待",
        "需要你的时候", "不需要你的时候", "用时方恨少",
        "付出", "回报", "不值得", "白费", "白付出", "白忙",
        "凭什么是我", "为什么是我", "为什么总是我", "为什么每次都是我",
        "偏袒", "偏心眼", "一碗水端不平", "厚此薄彼",
        "同样", "不一样", "差别对待", "看人下菜"],
    10: ["进步", "成长", "提升", "发展", "进化", "变强", "努力", "奋斗", "坚持",
        "锻炼", "健身", "自律", "习惯", "积累", "沉淀", "突破",
        "更好", "更强", "改变自己", "超越", "跨越", "升级",
        "学习", "充电", "磨炼", "历练", "打磨", "精进",
        "坚持不下来", "半途而废", "三天打鱼", "拖延", "懒惰", "懈怠"],
    11: ["秩序", "计划", "规律", "整理", "规划", "安排", "时间管理", "条理",
        "混乱", "无序", "拖延", "效率", "系统", "流程", "规范",
        "乱", "乱七八糟", "一团糟", "乱糟糟", "杂乱", "凌乱",
        "理不清", "搞不清", "没有头绪", "毫无头绪", "焦头烂额",
        "计划", "日程", "待办", "清单", "优先级", "先后",
        "规律", "作息", "生物钟", "节奏", "步调",
        "条理", "有条理", "井井有条", "井然有序", "按部就班"],
}

# 需求间冲突关键词（用于提升冲突检测准确度）
CONFLICT_KEYWORDS = [
    "但", "但是", "可是", "然而", "却", "不过", "同时", "又", "既要", "既要...又要",
    "一边", "一方面", "另一方面", "纠结", "矛盾", "两难", "权衡", "取舍",
    "虽然", "尽管", "然而", "可是", "只是",
]


def parse_demands_by_keywords(user_input: str) -> DemandSet:
    """
    纯关键词匹配解析需求（不依赖LLM）
    
    根据用户输入中的关键词，匹配12维需求并设置初始参数。
    匹配到的关键词越多，urgency和importance越高。
    
    Args:
        user_input: 用户自然语言输入
    
    Returns:
        DemandSet 需求集合
    """
    import time
    demand_set = DemandSet(source_text=user_input, timestamp=time.time())
    text = user_input.lower()
    
    matched_demands = {}  # demand_id -> matched_keywords_count
    
    for demand_id, keywords in DEMAND_KEYWORDS.items():
        match_count = sum(1 for kw in keywords if kw in text)
        if match_count > 0:
            matched_demands[demand_id] = match_count
    
    if not matched_demands:
        return demand_set
    
    # 根据匹配数量计算 urgency 和 importance
    max_matches = max(matched_demands.values())
    
    for demand_id, match_count in matched_demands.items():
        # 匹配越多，urgency和importance越高
        urgency = min(1.0, 0.3 + (match_count / max_matches) * 0.5)
        importance = min(1.0, 0.3 + (match_count / max_matches) * 0.4)
        
        # 检测冲突关键词，提升 intent
        has_conflict = any(kw in text for kw in CONFLICT_KEYWORDS)
        intent = 0.7 if has_conflict else 0.5
        
        demand = Demand(
            id=demand_id,
            urgency=urgency,
            importance=importance,
            resource_dep=0.3,
            intent=intent,
            reason=f"关键词匹配({match_count}个)"
        )
        demand_set.add(demand)

    return demand_set


def parse_demands_by_embedding(
    user_input: str,
    signal_texts: list,
    matcher=None,
    similarity_threshold: float = 0.40,
) -> DemandSet:
    """
    使用向量语义匹配解析需求（v4.1新增）

    通过句子嵌入+余弦相似度替代手工关键词匹配。
    当 matcher 为 None 时，自动降级回关键词匹配。

    Args:
        user_input: 用户原始输入
        signal_texts: LLM提取的信号文本列表
        matcher: DemandEmbeddingMatcher 实例（可选）
        similarity_threshold: 相似度阈值

    Returns:
        DemandSet 需求集合
    """
    import time
    demand_set = DemandSet(source_text=user_input, timestamp=time.time())

    # 尝试使用 embedding matcher
    if matcher is not None and matcher.is_available():
        try:
            return matcher.match_to_demand_set(
                signal_texts=signal_texts,
                source_text=user_input,
            )
        except Exception:
            # 向量匹配失败 → 降级到关键词
            pass

    # 降级：使用原有的关键词匹配
    text = user_input.lower()
    matched_demands = {}
    for demand_id, keywords in DEMAND_KEYWORDS.items():
        match_count = sum(1 for kw in keywords if kw in text)
        if match_count > 0:
            matched_demands[demand_id] = match_count

    if not matched_demands:
        return demand_set

    max_matches = max(matched_demands.values())
    for demand_id, match_count in matched_demands.items():
        urgency = min(1.0, 0.3 + (match_count / max_matches) * 0.5)
        importance = min(1.0, 0.3 + (match_count / max_matches) * 0.4)
        has_conflict = any(kw in text for kw in CONFLICT_KEYWORDS)
        intent = 0.7 if has_conflict else 0.5
        demand = Demand(
            id=demand_id,
            urgency=urgency,
            importance=importance,
            resource_dep=0.3,
            intent=intent,
            reason=f"关键词匹配({match_count}个)-embedding降级",
        )
        demand_set.add(demand)

    return demand_set
