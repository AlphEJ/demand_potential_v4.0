"""
需求势能 v4.0 - 势能计算器
4步势能计算流程（支持动态用户画像权重）
"""

import random
import numpy as np
from typing import List, Dict, Optional, TYPE_CHECKING
from .demands import Demand, DemandSet, MaslowLayer
from .matrix import AssociationMatrix
from .config import DPUConfig

if TYPE_CHECKING:
    from .profile import UserProfile


class PotentialCalculator:
    """
    势能计算器
    
    4步计算流程：
    1. 意图门控 (Intent Gate)
    2. 基础势能 P_base = Level_factor × (w2×(E×I) + w3×(1-R) + w4×Intent_Gate) + w1×Level
    3. 耦合势能 P_couple = P_base × max(0.1, 1 + Corr_avg - |Excl_max|)
    4. 最终势能 P_final = max(0, P_couple × (1-Decay) × (1-0.5×Load) + T×ΔP)
    """
    
    def __init__(self, config: DPUConfig, matrix: AssociationMatrix,
                 random_seed: Optional[int] = None,
                 attention_alpha: float = 0.0):
        self.config = config
        self.matrix = matrix
        # v4.2 注意力矩阵参数（0=关闭，0.5=默认注意力强度）
        self.attention_alpha = attention_alpha

        # 初始化随机数生成器（支持可重现性）
        self._rng = random.Random(random_seed) if random_seed is not None else random
        self._random_seed = random_seed
    
    def set_random_seed(self, seed: Optional[int]) -> None:
        """
        设置随机种子（用于测试可重现性）
        
        Args:
            seed: 随机种子，None则使用系统随机
        """
        self._random_seed = seed
        self._rng = random.Random(seed) if seed is not None else random
    
    def step1_intent_gate(self, demand: Demand) -> bool:
        """
        第1步：意图门控
        Intent < 0.3 的需求被过滤
        """
        if demand.intent < self.config.intent_threshold:
            return False
        # 通过门控，记录有效意图值
        return True
    
    def step2_calculate_p_base(self, demand: Demand, profile: Optional["UserProfile"] = None) -> float:
        """
        第2步：计算基础势能 P_base
        
        v4.0: 如果提供了 profile，使用个性化权重替代固定层级权重
        """
        level_factor = demand.layer.level_factor
        if profile is not None:
            level_weight = profile.get_level_weight(demand.id)
        else:
            level_weight = demand.level_weight
        
        w1 = self.config.w1_level
        w2 = self.config.w2_composite
        w3 = self.config.w3_resource
        w4 = self.config.w4_intent
        
        # 计算复合项
        composite = w2 * (demand.urgency * demand.importance)  # 紧急×重要耦合
        risk = w3 * (1 - demand.resource_dep)                   # 资源依赖反向
        intent = w4 * demand.intent_gate                        # 意图门控
        
        # P_base = Level_factor × 加权复合项 + w1×Level（独立加法项）
        p_base = level_factor * (composite + risk + intent) + w1 * level_weight
        
        demand.potential_base = round(max(0.0, p_base), 4)
        return demand.potential_base
    
    def step3_calculate_p_couple(self, demand: Demand, active_needs: List[int],
                                  activations: Optional[List[float]] = None) -> float:
        """
        第3步：计算耦合势能 P_couple

        公式：P_couple = P_base × max(0.1, 1 + Corr_avg - |Excl_max|)

        - Corr_avg: 与活跃需求的平均关联度（正向促进）
        - Excl_max: 最大互斥度（负向抑制）
        - max(0.1, ...): 保底机制，防止耦合过度衰减
        - activations: 12维激活值（用于注意力加权矩阵，None则用原始矩阵）
        """
        if demand.id not in active_needs:
            demand.potential_couple = demand.potential_base
            return demand.potential_couple

        # 计算平均关联度和最大互斥度
        alpha = self.attention_alpha
        corr_avg = self.matrix.calc_corr_avg(demand.id, active_needs, activations, alpha)
        excl_max = self.matrix.calc_excl_max(demand.id, active_needs, activations, alpha)
        
        # 耦合系数 = max(0.1, 1 + 平均关联 - |最大互斥|)
        couple_factor = max(
            self.config.couple_min_reserve,
            1 + corr_avg - abs(excl_max)
        )
        
        p_couple = demand.potential_base * couple_factor
        
        demand.potential_couple = round(max(0.0, p_couple), 4)
        return demand.potential_couple
    
    def step4_calculate_p_final(self, demand: Demand) -> float:
        """
        第4步：计算最终势能 P_final
        
        公式：P_final = max(0, P_couple × (1-Decay) × (1-0.5×Load) + T×ΔP)
        
        - (1-Decay): 自然衰减（时间越久越弱）
        - (1-0.5×Load): 负载影响（系统越忙越弱）
        - T×ΔP: 老化增益（等待越久优先级补偿）
        """
        decay = self.config.decay_rate
        load = demand.system_load
        wait_time = demand.wait_time
        aging_delta = self.config.aging_delta
        
        # 衰减项和负载项（乘法）
        decay_factor = 1 - decay
        load_factor = 1 - 0.5 * load
        
        # 老化增益（加法）
        aging_gain = wait_time * aging_delta
        
        p_final = demand.potential_couple * decay_factor * load_factor + aging_gain
        
        # 可控混沌（±5%随机扰动）
        if self.config.enable_chaos:
            chaos = self._rng.uniform(-self.config.chaos_range, self.config.chaos_range)
            p_final *= (1 + chaos)
        
        demand.potential_final = round(max(0.0, p_final), 4)
        return demand.potential_final
    
    def calculate_all(self, demand_set: DemandSet, profile: Optional["UserProfile"] = None) -> DemandSet:
        """
        完整计算流程
        v4.0: 支持传入 UserProfile 使用个性化权重
        """
        # 第1步：意图门控，筛选有效需求
        valid_demands = []
        for demand in demand_set.demands.values():
            if self.step1_intent_gate(demand):
                valid_demands.append(demand.id)
        
        if not valid_demands:
            return demand_set
        
        # 第2步：计算基础势能（传入 profile）
        for did in valid_demands:
            self.step2_calculate_p_base(demand_set.demands[did], profile=profile)
        
        # v4.2 注意力加权：从 P_base 构建伪激活向量
        _activations: Optional[List[float]] = None
        if self.attention_alpha > 0:
            p_base_vals = np.array([demand_set.demands[d].potential_base for d in range(12) if d in demand_set.demands])
            max_pb = p_base_vals.max()
            if max_pb > 0:
                _act = np.zeros(12, dtype=np.float64)
                for did in range(12):
                    if did in demand_set.demands:
                        _act[did] = demand_set.demands[did].potential_base / max_pb
                _activations = _act.tolist()

        # 第3步：计算耦合势能（传入注意力激活值）
        for did in valid_demands:
            self.step3_calculate_p_couple(demand_set.demands[did], valid_demands, activations=_activations)
        
        # 第4步：计算最终势能
        for did in valid_demands:
            self.step4_calculate_p_final(demand_set.demands[did])
        
        return demand_set
