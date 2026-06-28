"""
DPU Agent API - Pydantic 数据模型
定义所有 API 请求和响应的数据结构
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


# ==================== 聊天相关模型 ====================

class ChatRequest(BaseModel):
    """聊天请求"""
    message: str = Field(..., description="用户消息内容", min_length=1, max_length=5000)
    session_id: Optional[str] = Field(None, description="会话ID（可选，用于多会话隔离）")


class ChatResponse(BaseModel):
    """聊天响应"""
    success: bool = Field(True, description="请求是否成功")
    reply: str = Field("", description="Agent 回复内容")
    demand_ranking: List[Dict[str, Any]] = Field(default_factory=list, description="DPU需求排名")
    suppressed_count: int = Field(0, description="被压制需求数量")
    conflict_count: int = Field(0, description="冲突需求数量")
    tool_results: List[Dict[str, Any]] = Field(default_factory=list, description="工具执行结果")
    error: Optional[str] = Field(None, description="错误信息")


class ChatHistoryResponse(BaseModel):
    """对话历史响应"""
    messages: List[Dict[str, str]] = Field(default_factory=list, description="对话消息列表")
    total_count: int = Field(0, description="消息总数")


# ==================== DPU 分析相关模型 ====================

class AnalyzeRequest(BaseModel):
    """DPU 分析请求"""
    text: str = Field(..., description="待分析的文本", min_length=1, max_length=5000)


class DemandItem(BaseModel):
    """单个需求项"""
    rank: int = Field(..., description="排名")
    need: str = Field(..., description="需求名称")
    potential: float = Field(..., description="势能值")
    layer: str = Field(..., description="所属层级")
    reason: str = Field("", description="激活原因")


class AnalyzeResponse(BaseModel):
    """DPU 分析响应"""
    success: bool = Field(True, description="请求是否成功")
    source_text: str = Field("", description="原始输入文本")
    demand_ranking: List[Dict[str, Any]] = Field(default_factory=list, description="需求排名")
    suppressed: List[str] = Field(default_factory=list, description="被压制的需求列表")
    conflicts: List[Dict[str, Any]] = Field(default_factory=list, description="冲突列表")
    total_active_needs: int = Field(0, description="活跃需求总数")
    suppression_report: Dict[str, Any] = Field(default_factory=dict, description="压制报告")
    error: Optional[str] = Field(None, description="错误信息")


class MatrixResponse(BaseModel):
    """关联矩阵响应"""
    success: bool = Field(True)
    matrix: List[List[float]] = Field(..., description="12x12关联矩阵")
    needs: List[str] = Field(..., description="12维需求名称列表")


class FormulasResponse(BaseModel):
    """计算公式说明响应"""
    success: bool = Field(True)
    formulas: Dict[str, str] = Field(..., description="公式说明字典")


# ==================== 配置相关模型 ====================

class LLMConfig(BaseModel):
    """LLM 配置"""
    provider: str = Field("tongyi", description="LLM 提供商")
    model: str = Field("qwen-plus", description="模型名称")
    api_key: Optional[str] = Field(None, description="API Key")
    api_key_masked: Optional[str] = Field(None, description="脱敏显示的 API Key")
    base_url: Optional[str] = Field(None, description="自定义 API 地址")
    temperature: float = Field(0.7, description="温度参数", ge=0.0, le=2.0)
    max_tokens: int = Field(2048, description="最大生成 token 数", ge=1, le=32768)


class LLMConfigResponse(BaseModel):
    """LLM 配置响应"""
    success: bool = Field(True)
    config: LLMConfig
    available_providers: List[Dict[str, Any]] = Field(default_factory=list, description="可用提供商列表")


class DPUConfigRequest(BaseModel):
    """DPU 参数配置请求"""
    w1_level: Optional[float] = Field(None, ge=0.0, le=1.0, description="层级权重")
    w2_composite: Optional[float] = Field(None, ge=0.0, le=1.0, description="紧急x重要耦合权重")
    w3_resource: Optional[float] = Field(None, ge=0.0, le=1.0, description="资源依赖权重")
    w4_intent: Optional[float] = Field(None, ge=0.0, le=1.0, description="意图门控权重")
    intent_threshold: Optional[float] = Field(None, ge=0.0, le=1.0, description="意图门控阈值")
    suppression_trigger: Optional[float] = Field(None, ge=0.0, le=1.0, description="压制触发阈值")
    suppression_base: Optional[float] = Field(None, ge=0.0, le=1.0, description="压制基数")
    strong_exclusion_threshold: Optional[float] = Field(None, ge=0.0, le=1.0, description="强互斥阈值")
    enable_chaos: Optional[bool] = Field(None, description="是否启用混沌扰动")
    chaos_range: Optional[float] = Field(None, ge=0.0, le=0.5, description="混沌扰动范围")


class DPUConfigResponse(BaseModel):
    """DPU 配置响应"""
    success: bool = Field(True)
    config: Dict[str, Any] = Field(..., description="当前DPU配置")


# ==================== 用户画像相关模型 ====================

class UserProfile(BaseModel):
    """用户画像"""
    profile: Dict[str, float] = Field(default_factory=dict, description="12维需求激活值")
    total_interactions: int = Field(0, description="总交互次数")
    top_needs: List[str] = Field(default_factory=list, description="最活跃的需求 Top 3")


class UserProfileResponse(BaseModel):
    """用户画像响应"""
    success: bool = Field(True)
    profile: UserProfile


# ==================== 通用响应 ====================

class HealthResponse(BaseModel):
    """健康检查响应"""
    status: str = Field("ok")
    version: str = Field("4.0.0")


class SimpleResponse(BaseModel):
    """简单操作响应"""
    success: bool = Field(True)
    message: str = Field("")


# ==================== 游戏（沟通训练）相关模型 ====================


class GameCharacter(BaseModel):
    """游戏角色描述"""
    id: str = Field(..., description="角色ID")
    name: str = Field(..., description="角色名称")
    avatar: str = Field("👤", description="表情图标")
    personality_type: str = Field(..., description="性格类型标签")
    personality_desc: str = Field(..., description="性格详细描述")
    personality_traits: List[str] = Field(default_factory=list, description="性格特点列表")
    core_needs: List[int] = Field(default_factory=list, description="核心需求ID列表（0-11）")
    what_activates: List[str] = Field(default_factory=list, description="能让她软化/接受的事情")
    what_suppresses: List[str] = Field(default_factory=list, description="会让她更生气/防御的事情")


class GameRequest(BaseModel):
    """游戏对话请求"""
    user_input: str = Field(..., description="用户最新回复", min_length=1, max_length=2000)
    scene: str = Field(..., description="场景名称")
    character: GameCharacter = Field(..., description="对话对象的角色描述")
    needs_state: List[float] = Field(..., description="当前对方12维需求激活状态")
    round_number: int = Field(1, description="当前对话轮次", ge=1, le=10)
    history: List[str] = Field(default_factory=list, description="对话历史（之前双方说过的话，时间序）")


class NeedChange(BaseModel):
    """单个需求的变化"""
    need_id: int
    need_name: str
    change: float = Field(..., description="变化值（正=激活上升，负=压制）")
    reason: str = Field("", description="变化原因")


class GameResponse(BaseModel):
    """游戏对话响应"""
    success: bool = Field(True, description="是否成功")
    reply: str = Field("", description="对方的回复")
    new_needs_state: List[float] = Field(default_factory=list, description="对话后的新需求状态")
    activated_needs: List[int] = Field(default_factory=list, description="本次被激活的需求ID")
    suppressed_needs: List[int] = Field(default_factory=list, description="本次被压制的需求ID")
    changes: List[NeedChange] = Field(default_factory=list, description="每个需求的变化详情")
    mood: str = Field("", description="对方现在的情绪")
    dpu_comment: str = Field("", description="DPU对用户这句话的分析点评")
    error: Optional[str] = Field(None, description="错误信息")


class GameReportRequest(BaseModel):
    """生成综合报告请求"""
    character: GameCharacter = Field(..., description="对话对象")
    rounds_chat: List[Dict[str, str]] = Field(default_factory=list, description="多轮对话记录 [{role, text, mood}]")
    needs_history: List[List[float]] = Field(default_factory=list, description="每一轮对话后的需求状态历史")


class GameReportResponse(BaseModel):
    """综合沟通画像报告"""
    success: bool = Field(True)
    portrait: str = Field("", description="用户的沟通画像描述")
    top_strengths: List[str] = Field(default_factory=list, description="优势点")
    improvement: List[str] = Field(default_factory=list, description="可改进点")
    score: int = Field(0, description="综合得分（0-100）")


# ==================== 数字分身（Avatar）相关模型 ====================

class AvatarPersona(BaseModel):
    """角色人设基础信息（用户输入的信息）"""
    name: str = Field(..., description="对方的名字", min_length=1, max_length=50)
    avatar_emoji: str = Field("🧑", description="表情图标")
    relationship: str = Field("", description="与你的关系（朋友/恋人/家人/同事/其他）")
    gender_hint: str = Field("", description="性别倾向（用于 LLM 回复语气，可选）")
    age_hint: str = Field("", description="年龄段倾向（可选）")
    raw_description: str = Field("", description="用户对他的自由文字描述（越详细越好）")
    speech_notes: str = Field("", description="他说话的特点、口头禅、表达方式（越详细越好）")
    custom_tags: List[str] = Field(default_factory=list, description="自定义标签")


class AvatarRawMessage(BaseModel):
    """一条原始聊天记录"""
    text: str = Field(..., description="说话内容")
    is_me: bool = Field(False, description="true=是用户说的，false=是对方说的")
    timestamp_ms: int = Field(0, description="时间戳（毫秒），可选")


class AvatarDPUSnapshot(BaseModel):
    """单条消息的 DPU 分析快照（L2 原子事实层）"""
    text: str
    is_me: bool
    timestamp_ms: int
    need_state: List[float] = Field(default_factory=list, description="12 维需求激活值")
    top_need_ids: List[int] = Field(default_factory=list, description="Top N 被激活的需求 ID")
    suppressed_need_ids: List[int] = Field(default_factory=list, description="被压制的需求 ID")
    emotional_tone: str = Field("", description="情绪基调（由 DPU 分析推断）")
    has_conflict: bool = Field(False, description="是否存在需求冲突")
    conflict_pair: List[int] = Field(default_factory=list, description="冲突需求对（最多 2 个）")


class AvatarProfileStats(BaseModel):
    """L3 身份画像 + L5 心智模型：长期累积的统计"""
    total_messages_analyzed: int = Field(0)
    total_their_messages: int = Field(0)
    needs_12d_weights: List[float] = Field(default_factory=list, description="12 维长期权重（0-1）")
    activation_counts: List[int] = Field(default_factory=list, description="各需求被激活次数")
    suppressed_counts: List[int] = Field(default_factory=list, description="各需求被压制次数")
    co_occurrence_matrix: List[List[float]] = Field(default_factory=list, description="12×12 需求共现矩阵")
    core_needs: List[int] = Field(default_factory=list, description="他最核心的需求 Top N（ID 列表）")
    most_suppressed_needs: List[int] = Field(default_factory=list, description="最常被压制的需求")
    dominant_emotional_tones: List[str] = Field(default_factory=list, description="最常见的情绪基调")
    generated_persona_description: str = Field("", description="系统基于 DPU 自动生成的人物描述")
    speech_style_signature: Dict[str, Any] = Field(default_factory=dict, description="说话风格特征（句长、标点偏好、情绪词）")
    avg_sentence_len: float = Field(0)
    exclamation_ratio: float = Field(0)
    question_ratio: float = Field(0)
    ellipsis_ratio: float = Field(0)


class AvatarMemoryFile(BaseModel):
    """完整的分身档案（用于磁盘存储）—— 一个独立的 JSON 文件"""
    avatar_id: str = Field(..., description="分身唯一 ID")
    persona: AvatarPersona
    created_at: int = Field(0)
    updated_at: int = Field(0)
    dpu_snapshots: List[AvatarDPUSnapshot] = Field(default_factory=list, description="所有已分析消息的 DPU 快照")
    profile_stats: AvatarProfileStats = Field(default_factory=AvatarProfileStats)
    current_need_state: List[float] = Field(default_factory=list, description="对方当前的心理状态（用于下次对话开始）")
    conversation_history: List[Dict[str, Any]] = Field(default_factory=list, description="和分身的对话历史（含情绪标记）")


# ==================== Avatar API 请求/响应模型 ====================

class AvatarCreateRequest(BaseModel):
    """创建新分身"""
    persona: AvatarPersona
    messages: List[AvatarRawMessage] = Field(default_factory=list, description="初始导入的聊天记录（可以为空，之后再追加）")


class AvatarCreateResponse(BaseModel):
    """创建响应"""
    success: bool = Field(True)
    avatar_id: str = Field("")
    message: str = Field("")
    profile_stats: Optional[AvatarProfileStats] = Field(None, description="如果立即完成了分析，则返回画像统计")


class AvatarAppendMessagesRequest(BaseModel):
    """追加更多聊天记录进行分析"""
    avatar_id: str
    messages: List[AvatarRawMessage]


class AvatarListResponse(BaseModel):
    """列出所有分身"""
    success: bool = Field(True)
    avatars: List[Dict[str, Any]] = Field(default_factory=list)


class AvatarDetailResponse(BaseModel):
    """单个分身详情"""
    success: bool = Field(True)
    avatar: Optional[AvatarMemoryFile] = Field(None)


class AvatarChatRequest(BaseModel):
    """和分身对话"""
    avatar_id: str
    user_input: str = Field(..., min_length=1, max_length=3000)
    needs_state: List[float] = Field(default_factory=list, description="当前对方心理状态（12 维浮点数，空则由后端恢复）")
    round_number: int = Field(1, ge=1, le=200)
    provider: str = Field("tongyi", description="LLM提供商（tongyi/deepseek/ollama/openclaw）")


class AvatarChatResponse(BaseModel):
    """对话响应"""
    success: bool = Field(True)
    reply: str = Field("", description="对方的回复（模拟他会怎么说）")
    new_needs_state: List[float] = Field(default_factory=list, description="对话后的新需求状态")
    activated_needs: List[int] = Field(default_factory=list, description="本次被激活的需求 ID")
    suppressed_needs: List[int] = Field(default_factory=list, description="本次被压制的需求 ID")
    mood: str = Field("", description="他现在的情绪标签")
    dpu_comment: str = Field("", description="DPU 对用户这句话的点评")
    reply_source: str = Field("unknown", description="回复来源（llm / fallback / unknown）")
    error: Optional[str] = Field(None)


class AvatarInsightResponse(BaseModel):
    """深度分析响应"""
    success: bool = Field(True)
    profile: AvatarProfileStats
    need_names: List[str] = Field(default_factory=list)
    timeline: List[Dict[str, Any]] = Field(default_factory=list, description="情绪/激活时间线")
    top_quotes: List[Dict[str, Any]] = Field(default_factory=list, description="最能代表他的典型句子（按激活强度排序）")


class AvatarSimpleResponse(BaseModel):
    """简单操作响应"""
    success: bool = Field(True)
    message: str = Field("")


# ============================================================
# DPU 大脑 + LLM 嘴 架构的新数据结构
# ============================================================

class TierConfig(BaseModel):
    """人设的档位配置——描述这个人各维度的敏感程度"""
    # 12维各维度的敏感权重（>1 表示比普通人敏感，<1 表示迟钝）
    # 默认全1.0，即和普通人一样
    need_sensitivities: List[float] = Field(
        default_factory=lambda: [1.0] * 12,
        description="12个需求维度对这个人的敏感程度，范围0.3~3.0"
    )
    # 这个人在各档位下的基础激活阈值
    tier_activation_threshold: float = Field(
        0.35, ge=0.1, le=1.0,
        description="进入某档位所需的最低激活总量"
    )
    # 炸毛档的触发条件：核心需求被压制超过此值就炸毛
    explode_threshold: float = Field(0.6, ge=0.1, le=1.0)
    # 她的性格类型标签（用于RAG检索时匹配）
    personality_tags: List[str] = Field(
        default_factory=list,
        description="如：傲娇、控制型、回避型、安全型、敏感型"
    )
    # 默认性别（影响遣词造句）
    gender_hint: str = Field("中性", description="'女' / '男' / '中性'")


class TierUtterance(BaseModel):
    """档位话语库中的一句话"""
    text: str = Field(..., description="原始文本")
    tier: str = Field(..., description="所属档位：cold / cautious / softening / exploding / connecting")
    # DPU分析：这句话激活了哪些需求（0-11的索引）
    activates_needs: List[int] = Field(default_factory=list)
    # DPU分析：这句话压制了哪些需求
    suppresses_needs: List[int] = Field(default_factory=list)
    # 情绪强度（0-1）
    emotional_intensity: float = Field(0.5, ge=0.0, le=1.0)
    # 来源：'user_upload' / 'rag_retrieved' / 'manual'
    source: str = Field("manual")
    # 用于RAG的embedding向量（可选，list of float）
    embedding: Optional[List[float]] = Field(None)


class TierLibrary(BaseModel):
    """档位话语库——这个人（或这类人）说过的话，按档位分类"""
    utterances: List[TierUtterance] = Field(default_factory=list)
    cold: List[str] = Field(default_factory=list, description="冷淡档的原始文本列表")
    cautious: List[str] = Field(default_factory=list, description="观望档的原始文本列表")
    softening: List[str] = Field(default_factory=list, description="软化档的原始文本列表")
    exploding: List[str] = Field(default_factory=list, description="炸毛档的原始文本列表")
    connecting: List[str] = Field(default_factory=list, description="连接档的原始文本列表")

    def get_tier_texts(self, tier: str) -> List[str]:
        mapping = {
            "cold": self.cold,
            "cautious": self.cautious,
            "softening": self.softening,
            "exploding": self.exploding,
            "connecting": self.connecting,
        }
        return mapping.get(tier, [])


class LLMSemanticOutput(BaseModel):
    """第1层：LLM语义理解输出"""
    situation: str = Field(..., description="场景描述，如'道歉但无证据'")
    intent: str = Field(..., description="用户这句话的意图")
    has_evidence: bool = Field(False, description="是否有具体证据/内容")
    is_empty_talk: bool = Field(False, description="是否为空话/敷衍话")
    tone: str = Field("中性", description="语气：试探性/陈述性/质问性/挑衅性")
    key_phrases: List[str] = Field(default_factory=list, description="关键词列表")
    category: str = Field("普通", description="分类：空话/具体话/质问/情感表达")


class DPUDemandState(BaseModel):
    """第2层：DPU需求标注 + 第3层：状态更新"""
    demands: List[float] = Field(default_factory=list, description="12维需求激活值 [0,1]")
    suppressed: List[int] = Field(default_factory=list, description="被压制的需求维度ID列表")
    activated: List[int] = Field(default_factory=list, description="被激活的需求维度ID列表")
    total_activation: float = Field(0.0, description="总激活量")


class TierDecision(BaseModel):
    """第4层：档位决策输出"""
    tier: str = Field(..., description="当前档位：cold/cautious/softening/exploding/connecting")
    tier_cn: str = Field(..., description="档位中文名")
    reason: str = Field(..., description="决策理由")
    candidates: List[str] = Field(default_factory=list, description="候选回复句（3个）")
    selected_index: int = Field(0, description="最终选中的候选序号（0-2）")


class TierEngineResponse(BaseModel):
    """Tier Engine 的完整输出"""
    success: bool = Field(True)
    # 第1层
    semantic: Optional[LLMSemanticOutput] = Field(None)
    # 第2-3层
    demand_state: Optional[DPUDemandState] = Field(None)
    # 第4层
    decision: Optional[TierDecision] = Field(None)
    # 第5层：最终输出
    reply: str = Field("", description="最终回复（给用户看）")
    reply_source: str = Field("tier_engine", description="来源：tier_engine / llm_polish / fallback")
    # 可解释性
    analysis: str = Field("", description="DPU分析理由（展示给用户）")
    tier: str = Field("cautious", description="当前档位")
    # 雷达图数据
    new_needs_state: List[float] = Field(default_factory=list, description="更新后的12维状态")
    # 诊断信息
    round_number: int = Field(1)
    error: Optional[str] = Field(None)


class TierChatRequest(BaseModel):
    """新版对话请求（DPU大脑+LLM嘴架构）"""
    avatar_id: str
    user_input: str = Field(..., min_length=1, max_length=3000)
    # 当前12维心理状态（指数衰减后的）
    needs_state: List[float] = Field(default_factory=list)
    # 对话轮次
    round_number: int = Field(1, ge=1, le=200)
    # 档位库（如果用户上传了聊天记录，传这里）
    tier_library: Optional[TierLibrary] = Field(None, description="档位话语库（可选）")
    # 人设配置（必填）
    tier_config: Optional[TierConfig] = Field(None, description="档位配置（可选，不传则用默认值）")


class DiagnosisReport(BaseModel):
    """对话结束后的诊断报告"""
    total_rounds: int = Field(0)
    # 需求激活曲线：每轮的12维状态快照
    needs_history: List[List[float]] = Field(default_factory=list)
    # 每轮的情绪档位
    tier_history: List[str] = Field(default_factory=list)
    # 踩雷轮次（触发炸毛档的轮次）
    boom_rounds: List[int] = Field(default_factory=list)
    # 最佳轮次（触发连接档的轮次）
    best_rounds: List[int] = Field(default_factory=list)
    # 综合评分（0-100）
    overall_score: int = Field(0, ge=0, le=100)
    # 总结
    summary: str = Field("")
    # 建议
    suggestions: List[str] = Field(default_factory=list)

