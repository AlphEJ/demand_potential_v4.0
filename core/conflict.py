"""
需求势能3.0 - 冲突仲裁机制
三层冲突仲裁系统
"""

from typing import Dict, List, Tuple
from .demands import Demand, DemandSet
from .matrix import AssociationMatrix
from .config import DPUConfig


class ConflictArbiter:
    """
    三层冲突仲裁
    
    仲裁优先级（从高到低）：
    1. 层级仲裁：底层需求优先
    2. 势能仲裁：P_final高者优先
    3. 等待仲裁：等待时间长者优先（防止饥饿）
    """
    
    def __init__(self, config: DPUConfig, matrix: AssociationMatrix):
        self.config = config
        self.matrix = matrix
    
    def get_conflicts(self, demand_set: DemandSet) -> List[Dict]:
        """
        检测需求冲突
        
        Returns:
            冲突列表，每个冲突包含：
            - need_a, need_b: 冲突的两个需求
            - strength: 冲突强度（互斥度）
            - type: "strong" (强互斥) 或 "weak" (弱互斥)
            - winner: 仲裁胜出的需求
            - action: 建议处理策略
        """
        valid_demands = demand_set.get_valid_demands()
        active_ids = [d.id for d in valid_demands]
        
        conflicts = []
        threshold = self.config.strong_exclusion_threshold
        
        # 获取所有冲突对
        conflict_pairs = self.matrix.get_conflict_pairs(active_ids, threshold=-0.3)
        
        for need_a, need_b, corr in conflict_pairs:
            demand_a = demand_set.get(need_a)
            demand_b = demand_set.get(need_b)
            
            if not demand_a or not demand_b:
                continue
            
            # 确定冲突类型
            conflict_type = "strong" if corr < -threshold else "weak"
            
            # 三层仲裁决定胜者
            winner = self._arbitrate(demand_a, demand_b)
            loser = demand_b if winner == demand_a else demand_a
            
            # 确定处理策略
            if conflict_type == "strong":
                action = f"{winner.name}优先执行，{loser.name}进入等待队列"
            else:
                action = "有限资源限流并行"
            
            conflicts.append({
                "need_a": demand_a.name,
                "need_b": demand_b.name,
                "strength": round(abs(corr), 2),
                "type": conflict_type,
                "winner": winner.name,
                "action": action,
            })
        
        return conflicts
    
    def _arbitrate(self, demand_a: Demand, demand_b: Demand) -> Demand:
        """
        三层仲裁核心逻辑
        """
        # 第1层：层级仲裁
        if demand_a.layer.value != demand_b.layer.value:
            # 底层优先
            return demand_a if demand_a.layer.value < demand_b.layer.value else demand_b
        
        # 第2层：势能仲裁
        if abs(demand_a.potential_final - demand_b.potential_final) > 0.05:
            return demand_a if demand_a.potential_final > demand_b.potential_final else demand_b
        
        # 第3层：等待仲裁（防止饥饿）
        return demand_a if demand_a.wait_time > demand_b.wait_time else demand_b
    
    def sort_demands(self, demand_set: DemandSet, layer_priority: bool = True) -> List[Demand]:
        """
        根据仲裁规则排序需求

        排序优先级：
        - layer_priority=True（默认/纯DPU模式）：
          1. 层级（低到高）→ 2. 最终势能（高到低）→ 3. 等待时间（长到短）
          适用于传统DPU管道（没有LLM介入，完全遵循马斯洛层级）
        - layer_priority=False（LLM直出模式）：
          1. 最终势能（高到低）→ 2. 层级（低到高）→ 3. 等待时间
          适用于LLM+DPU联动模式（LLM已经考虑了语境，势能反映真实优先）
        """
        valid_demands = demand_set.get_valid_demands()

        if layer_priority:
            def sort_key(demand: Demand):
                return (
                    demand.layer.value,           # 层级优先（低层级在前）
                    -demand.potential_final,       # 势能次之（高势能在前）
                    -demand.wait_time,             # 等待时间最后（长等待在前）
                )
        else:
            def sort_key(demand: Demand):
                return (
                    -demand.potential_final,       # 势能优先（LLM判断的最高需求在前）
                    demand.layer.value,            # 层级次之（同势能时底层在前）
                    -demand.wait_time,             # 等待时间最后
                )

        return sorted(valid_demands, key=sort_key)

    def generate_action_order(self, demand_set: DemandSet, layer_priority: bool = True) -> List[Dict]:
        """
        生成执行建议顺序

        Args:
            demand_set: 需求集合
            layer_priority: 是否让层级优先于势能（LLM+DPU模式设为False）
        """
        sorted_demands = self.sort_demands(demand_set, layer_priority=layer_priority)
        
        action_order = []
        for rank, demand in enumerate(sorted_demands, 1):
            action_order.append({
                "rank": rank,
                "need_id": demand.id,
                "need": demand.name,
                "need_en": demand.name,
                "potential": demand.potential_final,
                "layer": demand.layer.name_cn,
                "reason": demand.reason or f"势能值: {demand.potential_final}",
                "suppressed": demand.suppressed,
            })
        
        return action_order
