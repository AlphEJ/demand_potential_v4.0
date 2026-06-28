"""
记忆模型定义 - 6层记忆结构
L1: 原始痕迹 (Raw Trace)
L2: 原子事实 (Atomic Facts)
L3: 身份画像 (Identity Profile) - 对接DPU 12维需求
L4: 会话摘要 (Session Summary)
L5: 心智模型 (Mental Model)
L6: 前瞻意图 (Intention Prediction)
"""

from enum import IntEnum
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from datetime import datetime
import uuid


class MemoryLayer(IntEnum):
    """6层记忆层级"""
    L1_RAW = 1          # 原始对话痕迹
    L2_FACT = 2         # 原子事实
    L3_IDENTITY = 3     # 身份画像
    L4_SUMMARY = 4      # 会话摘要
    L5_MENTAL = 5       # 心智模型
    L6_INTENTION = 6    # 前瞻意图


@dataclass
class MemoryEntry:
    """记忆条目 - 通用结构"""
    # 基础字段
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    layer: MemoryLayer = MemoryLayer.L1_RAW
    content: str = ""                    # 记忆内容
    timestamp: float = field(default_factory=lambda: datetime.now().timestamp())
    
    # 溯源信息
    session_id: str = ""                 # 所属会话
    user_id: str = "default"             # 用户ID
    source_message_id: str = ""          # 来源消息ID
    
    # DPU关联 - 核心对接点
    dpu_demand_ids: List[int] = field(default_factory=list)  # 激活的需求ID
    dpu_potentials: Dict[int, float] = field(default_factory=dict)  # 需求势能值
    dpu_top_demand: Optional[int] = None  # 最高优先级需求
    
    # 演化链
    supersedes_id: Optional[str] = None   # 被本条记忆替代的旧记忆ID
    superseded_by_id: Optional[str] = None  # 替代本条的新记忆ID
    evolution_chain_id: Optional[str] = None  # 所属演化链ID
    
    # 元数据
    confidence: float = 0.8               # 置信度
    access_count: int = 0                 # 被访问次数
    last_accessed: Optional[float] = None  # 最后访问时间
    tags: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            'id': self.id,
            'layer': self.layer.value,
            'content': self.content,
            'timestamp': self.timestamp,
            'session_id': self.session_id,
            'user_id': self.user_id,
            'source_message_id': self.source_message_id,
            'dpu_demand_ids': self.dpu_demand_ids,
            'dpu_potentials': self.dpu_potentials,
            'dpu_top_demand': self.dpu_top_demand,
            'supersedes_id': self.supersedes_id,
            'superseded_by_id': self.superseded_by_id,
            'evolution_chain_id': self.evolution_chain_id,
            'confidence': self.confidence,
            'access_count': self.access_count,
            'last_accessed': self.last_accessed,
            'tags': self.tags,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'MemoryEntry':
        """从字典创建"""
        entry = cls()
        entry.id = data.get('id', str(uuid.uuid4()))
        entry.layer = MemoryLayer(data.get('layer', 1))
        entry.content = data.get('content', '')
        entry.timestamp = data.get('timestamp', datetime.now().timestamp())
        entry.session_id = data.get('session_id', '')
        entry.user_id = data.get('user_id', 'default')
        entry.source_message_id = data.get('source_message_id', '')
        entry.dpu_demand_ids = data.get('dpu_demand_ids', [])
        entry.dpu_potentials = data.get('dpu_potentials', {})
        entry.dpu_top_demand = data.get('dpu_top_demand')
        entry.supersedes_id = data.get('supersedes_id')
        entry.superseded_by_id = data.get('superseded_by_id')
        entry.evolution_chain_id = data.get('evolution_chain_id')
        entry.confidence = data.get('confidence', 0.8)
        entry.access_count = data.get('access_count', 0)
        entry.last_accessed = data.get('last_accessed')
        entry.tags = data.get('tags', [])
        return entry


@dataclass
class EvolutionChain:
    """演化链 - 记录需求/态度的完整演变过程"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    chain_type: str = ""                  # 演化类型: demand(需求), attitude(态度), preference(偏好)
    target_id: int = -1                   # 目标ID (如需求ID)
    target_name: str = ""                 # 目标名称
    
    # 链头(最新)和链尾(最初)
    head_id: Optional[str] = None         # 链头ID (最新记忆)
    tail_id: Optional[str] = None         # 链尾ID (最初记忆)
    
    # 链上所有节点
    node_ids: List[str] = field(default_factory=list)
    
    # 元数据
    created_at: float = field(default_factory=lambda: datetime.now().timestamp())
    updated_at: float = field(default_factory=lambda: datetime.now().timestamp())
    is_active: bool = True                # 是否仍在演化
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'chain_type': self.chain_type,
            'target_id': self.target_id,
            'target_name': self.target_name,
            'head_id': self.head_id,
            'tail_id': self.tail_id,
            'node_ids': self.node_ids,
            'created_at': self.created_at,
            'updated_at': self.updated_at,
            'is_active': self.is_active,
        }


@dataclass
class UserIdentity:
    """L3: 身份画像 - 对接DPU 12维需求体系"""
    user_id: str = "default"
    
    # 12维需求画像 - 每维度的长期偏好
    demand_profiles: Dict[int, Dict[str, Any]] = field(default_factory=dict)
    """
    {
        0: {  # 生理生存
            'preference': '规律饮食',
            'intensity': 0.8,  # 重视程度
            'trend': 'stable',  # stable/rising/falling
            'last_updated': timestamp,
        },
        ...
    }
    """
    
    # 全局画像
    decision_style: str = ""              # 决策风格: cautious/impulsive/balanced
    risk_tolerance: float = 0.5           # 风险承受度
    time_preference: str = ""             # 时间偏好: long_term/short_term
    
    # 统计
    total_interactions: int = 0
    first_seen: float = field(default_factory=lambda: datetime.now().timestamp())
    last_seen: float = field(default_factory=lambda: datetime.now().timestamp())
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'user_id': self.user_id,
            'demand_profiles': self.demand_profiles,
            'decision_style': self.decision_style,
            'risk_tolerance': self.risk_tolerance,
            'time_preference': self.time_preference,
            'total_interactions': self.total_interactions,
            'first_seen': self.first_seen,
            'last_seen': self.last_seen,
        }


@dataclass
class MentalModel:
    """L5: 心智模型 - 用户的认知框架"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = "default"
    
    model_type: str = ""                  # 类型: decision(决策), conflict(冲突处理), planning(规划)
    description: str = ""                 # 模型描述
    
    # 触发条件
    triggers: List[str] = field(default_factory=list)  # 什么场景会触发这个模型
    
    # 模型内容
    pattern: str = ""                     # 行为模式
    underlying_need: str = ""             # 底层需求
    typical_response: str = ""            # 典型反应
    
    # 验证记录
    evidence_count: int = 0               # 支持证据次数
    contradict_count: int = 0             # 矛盾次数
    confidence: float = 0.5               # 置信度
    
    created_at: float = field(default_factory=lambda: datetime.now().timestamp())
    updated_at: float = field(default_factory=lambda: datetime.now().timestamp())
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'user_id': self.user_id,
            'model_type': self.model_type,
            'description': self.description,
            'triggers': self.triggers,
            'pattern': self.pattern,
            'underlying_need': self.underlying_need,
            'typical_response': self.typical_response,
            'evidence_count': self.evidence_count,
            'contradict_count': self.contradict_count,
            'confidence': self.confidence,
            'created_at': self.created_at,
            'updated_at': self.updated_at,
        }


@dataclass
class IntentionPrediction:
    """L6: 前瞻意图 - 预测用户下一步可能的需求"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = "default"
    
    predicted_intention: str = ""         # 预测的意图
    related_demand_id: Optional[int] = None  # 关联的需求ID
    
    # 预测依据
    trigger_context: str = ""             # 触发上下文
    confidence: float = 0.5               # 置信度
    
    # 时间预测
    expected_timeframe: str = ""          # 预期时间: immediate/short/medium/long
    
    # 验证
    is_fulfilled: bool = False            # 是否被验证
    fulfilled_at: Optional[float] = None  # 验证时间
    
    created_at: float = field(default_factory=lambda: datetime.now().timestamp())
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'user_id': self.user_id,
            'predicted_intention': self.predicted_intention,
            'related_demand_id': self.related_demand_id,
            'trigger_context': self.trigger_context,
            'confidence': self.confidence,
            'expected_timeframe': self.expected_timeframe,
            'is_fulfilled': self.is_fulfilled,
            'fulfilled_at': self.fulfilled_at,
            'created_at': self.created_at,
        }
