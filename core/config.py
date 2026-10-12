"""
需求势能3.0 - 全局配置
"""

from dataclasses import dataclass
from typing import Dict


@dataclass
class DPUConfig:
    """DPU引擎配置"""
    
    # ===== 势能计算权重 (w1+w2+w3+w4=1.0) =====
    # P_base = Level_factor × (w2×(E×I) + w3×(1-R) + w4×Intent_Gate) + w1×Level
    w1_level: float = 0.35           # 层级权重（独立加法项，防止层级倒置）
    w2_composite: float = 0.30       # 紧急×重要耦合
    w3_resource: float = 0.20        # 资源依赖（反向）
    w4_intent: float = 0.15          # 意图门控
    
    # ===== 阈值 =====
    intent_threshold: float = 0.3    # 意图门控阈值
    couple_min_reserve: float = 0.1  # P_couple最低保留系数
    
    # ===== 衰减与老化 =====
    decay_rate: float = 0.02         # 自然衰减系数
    aging_delta: float = 0.008       # 老化增量系数
    load_factor: float = 0.5         # 负载衰减系数
    
    # ===== 层级压制 =====
    suppression_trigger: float = 0.7  # 触发压制的层级平均激活阈值
    suppression_base: float = 0.6     # 压制基数（0.6^n）
    
    # ===== 冲突仲裁 =====
    strong_exclusion_threshold: float = 0.7  # 强互斥阈值
    
    # ===== 混沌控制 =====
    chaos_range: float = 0.05         # 随机扰动范围（±5%）
    enable_chaos: bool = True         # 是否启用混沌扰动

    # ===== 向量语义匹配 =====
    use_embedding: bool = True                # 是否优先使用向量语义匹配
    embedding_similarity_threshold: float = 0.40  # 语义匹配激活阈值
    embedding_fallback_to_keywords: bool = True    # 向量匹配无结果时降级到关键词
    embedding_language: str = "auto"                # 语言："zh"/"en"/"auto"

    # ===== 关联矩阵自适应 =====
    matrix_learning_rate: float = 0.05       # 批量数据矩阵学习率
    matrix_momentum: float = 0.9              # 矩阵更新动量
    matrix_auto_backup: bool = True           # 是否自动备份矩阵快照
    
    def validate(self) -> bool:
        """验证配置合法性"""
        total = self.w1_level + self.w2_composite + self.w3_resource + self.w4_intent
        assert abs(total - 1.0) < 0.01, f"权重之和必须为1.0，当前为{total}"
        assert 0 < self.intent_threshold <= 1
        assert 0 < self.suppression_base <= 1
        return True
    
    @property
    def weights(self) -> Dict[str, float]:
        """获取权重字典"""
        return {
            "w1_level": self.w1_level,
            "w2_composite": self.w2_composite,
            "w3_resource": self.w3_resource,
            "w4_intent": self.w4_intent,
        }


# 全局默认配置
default_config = DPUConfig()
