"""
需求势能3.0 - 层级压制机制
基于马斯洛需求层次的数学实现
"""

from typing import Dict, List
from .demands import Demand, DemandSet, MaslowLayer
from .config import DPUConfig


class LayerSuppression:
    """
    层级压制机制
    
    核心逻辑：
    - 当底层需求（L0生理、L1安全）的平均激活度 > 0.7 时
    - 高层需求（L2社交、L3尊重、L4自我实现）的势能会被压制
    - 压制系数 = 0.6^n，n为层数差
    """
    
    def __init__(self, config: DPUConfig):
        self.config = config
    
    def calculate_layer_avg(self, demand_set: DemandSet) -> Dict[str, float]:
        """
        计算每层需求的平均激活度
        """
        layer_sums = {}
        layer_counts = {}
        
        for demand in demand_set.demands.values():
            layer_name = demand.layer.name_cn
            if layer_name not in layer_sums:
                layer_sums[layer_name] = 0.0
                layer_counts[layer_name] = 0
            
            # 使用意图门控后的有效值
            if demand.is_valid:
                layer_sums[layer_name] += demand.intent_gate
                layer_counts[layer_name] += 1
        
        layer_avgs = {}
        for layer_name in layer_sums:
            if layer_counts[layer_name] > 0:
                layer_avgs[layer_name] = layer_sums[layer_name] / layer_counts[layer_name]
            else:
                layer_avgs[layer_name] = 0.0
        
        return layer_avgs
    
    def calculate_suppression_caps(self, layer_avgs: Dict[str, float], survival_only: bool = False) -> Dict[str, float]:
        """
        计算每层的需求势能上限（压制上限）

        Args:
            survival_only: True=仅D0生理/D1安全触发压制（LLM模式）
                          社交/情感的高激活不再压制尊重/认知

        规则：
        - 如果某层平均激活度 > 0.7，则该层以上的所有层被压制
        - 压制系数 = 0.6^n，n为与触发层的距离
        """
        caps = {
            "生理层": 1.0,
            "安全层": 1.0,
            "社交归属层": 1.0,
            "尊重层": 1.0,
            "自我实现层": 1.0,
        }

        trigger_threshold = self.config.suppression_trigger
        base = self.config.suppression_base  # 0.6

        # 检查每层是否触发压制
        layer_order = ["生理层", "安全层", "社交归属层", "尊重层", "自我实现层"]

        for i, layer_name in enumerate(layer_order):
            # LLM 模式：仅 D0 生理层 和 D1 安全层可触发压制
            if survival_only and i >= 2:  # 社交归属层(i=2)及以上不触发
                continue

            avg_activation = layer_avgs.get(layer_name, 0.0)

            if avg_activation > trigger_threshold:
                # 该层以上的所有层被压制
                for j in range(i + 1, len(layer_order)):
                    upper_layer = layer_order[j]
                    distance = j - i  # 层数差
                    suppression_factor = base ** distance
                    # 取最小值（多个压制源时，取最严格的）
                    caps[upper_layer] = min(caps[upper_layer], suppression_factor)

        return caps
    
    def apply_suppression(self, demand_set: DemandSet, survival_only: bool = False) -> DemandSet:
        """
        应用层级压制到需求集合

        Args:
            survival_only: True=仅D0生理/D1安全触发压制（LLM模式）
                          False=所有层级均可触发压制（传统DPU模式）
        """
        # 计算每层平均激活度
        layer_avgs = self.calculate_layer_avg(demand_set)

        # 计算压制上限
        caps = self.calculate_suppression_caps(layer_avgs, survival_only=survival_only)

        # 应用压制
        for demand in demand_set.demands.values():
            if not demand.is_valid:
                continue

            layer_name = demand.layer.name_cn
            cap = caps.get(layer_name, 1.0)

            original_potential = demand.potential_final
            suppressed_potential = original_potential * cap

            if cap < 1.0 and original_potential > 0:
                demand.suppressed = True
                demand.potential_final = round(suppressed_potential, 4)

        return demand_set
    
    def get_suppression_report(self, demand_set: DemandSet) -> Dict:
        """
        生成压制报告（用于展示）
        """
        layer_avgs = self.calculate_layer_avg(demand_set)
        caps = self.calculate_suppression_caps(layer_avgs)
        
        suppressed_needs = []
        for demand in demand_set.demands.values():
            if demand.suppressed:
                suppressed_needs.append({
                    "need": demand.name,
                    "layer": demand.layer.name_cn,
                    "original_potential": demand.potential_couple,  # 压制前的值
                    "capped_potential": demand.potential_final,
                })
        
        return {
            "layer_averages": layer_avgs,
            "layer_caps": caps,
            "suppressed_needs": suppressed_needs,
        }
