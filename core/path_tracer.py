"""
PathTracer - "那根线"的具体实现

核心能力：把 DPU 的黑盒打分变成可见的推理路径

输入：DPU 分析结果（哪些需求被直接激活了）
过程：沿着 12×12 关联矩阵追踪传导路径
输出：节点+边的图结构，可视化"激活是怎么传过去的"

传导规则：
  - L1（一级传导）：根势能 × 关联度 × 0.7
  - L2（二级传导）：L1值 × 关联度 × 0.7
  - 低于 0.15 阈值不传导（避免噪声）
  - 负关联度标记为"冲突对"

"切掉重连"机制：
  - 用户标记"这条路径不对" → 降低该边权重 20%
  - 用户标记"这条路径对" → 提升该边权重 10%
"""

import logging
from typing import List, Dict, Tuple, Optional, Any
from dataclasses import dataclass, field
from enum import Enum

import numpy as np

from .matrix import AssociationMatrix
from .demands import NeedMeta

logger = logging.getLogger("path_tracer")


class NodeType(Enum):
    """节点类型"""
    ROOT = "root"           # 直接激活（根节点）
    PROPAGATION_L1 = "l1"   # 一级传导
    PROPAGATION_L2 = "l2"   # 二级传导
    CONFLICT = "conflict"   # 冲突互斥


class EdgeType(Enum):
    """边类型"""
    ACTIVATION = "activation"      # 正向激活
    SUPPRESSION = "suppression"    # 负向压制
    CONFLICT = "conflict"          # 冲突互斥


@dataclass
class PathNode:
    """路径节点"""
    need_id: int                    # 需求ID (0-11)
    need_name: str                  # 需求名称
    value: float                    # 势能值
    node_type: NodeType             # 节点类型
    source: str                     # 来源说明
    layer: int = 0                  # 传导层级 (0=根, 1=L1, 2=L2)


@dataclass
class PathEdge:
    """路径边"""
    from_id: int                    # 起点需求ID
    to_id: int                      # 终点需求ID
    correlation: float              # 关联度（来自矩阵）
    propagated_value: float         # 传导后的值
    edge_type: EdgeType             # 边类型
    is_user_modified: bool = False  # 是否被用户修改过


@dataclass
class ReasoningPath:
    """推理路径（完整结果）"""
    source_text: str = ""           # 原始输入文本
    nodes: List[PathNode] = field(default_factory=list)
    edges: List[PathEdge] = field(default_factory=list)
    root_nodes: List[int] = field(default_factory=list)   # 根节点ID列表
    conflict_pairs: List[Tuple[int, int, float]] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典（用于JSON序列化）"""
        return {
            "source_text": self.source_text,
            "nodes": [
                {
                    "need_id": n.need_id,
                    "need_name": n.need_name,
                    "value": round(n.value, 3),
                    "node_type": n.node_type.value,
                    "source": n.source,
                    "layer": n.layer,
                }
                for n in self.nodes
            ],
            "edges": [
                {
                    "from_id": e.from_id,
                    "to_id": e.to_id,
                    "from_name": NeedMeta.NAMES.get(e.from_id, f"D{e.from_id}"),
                    "to_name": NeedMeta.NAMES.get(e.to_id, f"D{e.to_id}"),
                    "correlation": round(e.correlation, 3),
                    "propagated_value": round(e.propagated_value, 3),
                    "edge_type": e.edge_type.value,
                    "is_user_modified": e.is_user_modified,
                }
                for e in self.edges
            ],
            "root_nodes": self.root_nodes,
            "conflict_pairs": [
                {
                    "need_a": cp[0],
                    "need_b": cp[1],
                    "need_a_name": NeedMeta.NAMES.get(cp[0], f"D{cp[0]}"),
                    "need_b_name": NeedMeta.NAMES.get(cp[1], f"D{cp[1]}"),
                    "correlation": round(cp[2], 3),
                }
                for cp in self.conflict_pairs
            ],
        }


class PathTracer:
    """
    路径追踪器 - "那根线"的核心引擎
    
    把 DPU 的打分结果变成可见的传导路径
    """
    
    # 传导衰减系数
    DECAY_FACTOR = 0.7
    # 传导阈值（低于此值不传导）
    PROPAGATION_THRESHOLD = 0.15
    # 冲突阈值（关联度低于此值标记为冲突）
    CONFLICT_THRESHOLD = -0.5
    
    def __init__(self, matrix: Optional[AssociationMatrix] = None):
        """
        初始化路径追踪器
        
        Args:
            matrix: 关联矩阵，None则使用默认矩阵
        """
        self.matrix = matrix or AssociationMatrix()
        # 用户修改记录：{(from_id, to_id): modified_correlation}
        self.user_modifications: Dict[Tuple[int, int], float] = {}
    
    def trace(self, demand_ranking: List[Dict], source_text: str = "") -> ReasoningPath:
        """
        追踪推理路径（主入口）
        
        Args:
            demand_ranking: DPU 输出的 demand_ranking 列表
                            每个元素包含 need_id, potential 等字段
            source_text: 原始输入文本
            
        Returns:
            ReasoningPath 对象，包含完整的节点和边
        """
        path = ReasoningPath(source_text=source_text)
        
        # 1. 识别根节点（直接激活的需求）
        root_nodes = self._identify_roots(demand_ranking)
        path.root_nodes = [n.need_id for n in root_nodes]
        path.nodes.extend(root_nodes)
        
        # 2. 一级传导（从根节点出发）
        root_ids = {n.need_id for n in root_nodes}
        l1_nodes, l1_edges = self._propagate_level(root_nodes, level=1, all_existing_ids=root_ids)
        path.nodes.extend(l1_nodes)
        path.edges.extend(l1_edges)
        
        # 3. 二级传导（从 L1 节点出发）
        all_ids = root_ids | {n.need_id for n in l1_nodes}
        l2_nodes, l2_edges = self._propagate_level(l1_nodes, level=2, all_existing_ids=all_ids)
        path.nodes.extend(l2_nodes)
        path.edges.extend(l2_edges)
        
        # 4. 检测冲突对
        path.conflict_pairs = self._detect_conflicts(path.nodes)
        
        return path
    
    def _identify_roots(self, demand_ranking: List[Dict]) -> List[PathNode]:
        """
        识别根节点（直接激活的需求）
        
        从 DPU 的 demand_ranking 中提取有势能值的需求作为根
        """
        roots = []
        for item in demand_ranking:
            need_id = item.get("need_id")
            potential = item.get("potential", 0.0)
            
            if need_id is not None and potential > 0:
                node = PathNode(
                    need_id=need_id,
                    need_name=NeedMeta.NAMES.get(need_id, f"D{need_id}"),
                    value=potential,
                    node_type=NodeType.ROOT,
                    source=f"直接激活（势能 {potential:.3f}）",
                    layer=0,
                )
                roots.append(node)
        
        # 按势能值降序排列
        roots.sort(key=lambda n: n.value, reverse=True)
        return roots
    
    def _propagate_level(self, source_nodes: List[PathNode], level: int, 
                         all_existing_ids: set = None) -> Tuple[List[PathNode], List[PathEdge]]:
        """
        传导一层
        
        Args:
            source_nodes: 源节点列表
            level: 传导层级（1=L1, 2=L2）
            all_existing_ids: 全局已存在的节点ID集合（防止反向回边）
            
        Returns:
            (新节点列表, 新边列表)
        """
        new_nodes: List[PathNode] = []
        new_edges: List[PathEdge] = []
        
        # 已存在的节点ID集合（避免反向回边）
        existing_ids = set(all_existing_ids) if all_existing_ids else set()
        
        # 节点累加器：target_id -> 累计传导值
        node_accumulator: Dict[int, float] = {}
        # 边累加器：(from_id, to_id) -> 最大传导值（边不叠加，取最大）
        edge_accumulator: Dict[Tuple[int, int], PathEdge] = {}
        
        for src in source_nodes:
            # 遍历所有可能的目标需求
            for target_id in range(12):
                if target_id == src.need_id:
                    continue  # 跳过自己
                if target_id in existing_ids:
                    continue  # 跳过已存在的（包括根节点和之前层的节点）
                
                # 获取关联度（考虑用户修改）
                correlation = self._get_effective_correlation(src.need_id, target_id)
                
                # 计算传导值
                propagated_value = src.value * correlation * self.DECAY_FACTOR
                
                # 低于阈值不传导
                if abs(propagated_value) < self.PROPAGATION_THRESHOLD:
                    continue
                
                # 确定边类型
                if correlation < 0:
                    edge_type = EdgeType.SUPPRESSION
                else:
                    edge_type = EdgeType.ACTIVATION
                
                # 创建边
                edge_key = (src.need_id, target_id)
                edge = PathEdge(
                    from_id=src.need_id,
                    to_id=target_id,
                    correlation=correlation,
                    propagated_value=propagated_value,
                    edge_type=edge_type,
                    is_user_modified=(src.need_id, target_id) in self.user_modifications,
                )
                
                # 边：如果同一对(from, to)已有边，取传导值最大的
                if edge_key in edge_accumulator:
                    if abs(propagated_value) > abs(edge_accumulator[edge_key].propagated_value):
                        edge_accumulator[edge_key] = edge
                else:
                    edge_accumulator[edge_key] = edge
                
                # 节点：累加传导值
                if target_id in node_accumulator:
                    node_accumulator[target_id] += propagated_value
                else:
                    node_accumulator[target_id] = propagated_value
        
        # 构建最终节点列表
        for target_id, total_value in node_accumulator.items():
            # 重新检查阈值（累加后可能超过阈值）
            if abs(total_value) < self.PROPAGATION_THRESHOLD:
                continue
            
            node_type = NodeType.PROPAGATION_L1 if level == 1 else NodeType.PROPAGATION_L2
            node = PathNode(
                need_id=target_id,
                need_name=NeedMeta.NAMES.get(target_id, f"D{target_id}"),
                value=total_value,
                node_type=node_type,
                source=f"多层传导叠加（总值 {total_value:.3f}）",
                layer=level,
            )
            new_nodes.append(node)
        
        # 构建最终边列表
        new_edges = list(edge_accumulator.values())
        
        return new_nodes, new_edges
    
    def _get_effective_correlation(self, from_id: int, to_id: int) -> float:
        """
        获取有效关联度（考虑用户修改）
        """
        # 检查是否有用户修改
        if (from_id, to_id) in self.user_modifications:
            return self.user_modifications[(from_id, to_id)]
        
        # 使用矩阵原始值
        return self.matrix.get_correlation(from_id, to_id)
    
    def _detect_conflicts(self, nodes: List[PathNode]) -> List[Tuple[int, int, float]]:
        """
        检测冲突对（互斥需求）
        
        在所有节点之间检测负关联度超过阈值的配对
        """
        conflicts = []
        node_ids = [n.need_id for n in nodes]
        
        for i, need_a in enumerate(node_ids):
            for need_b in node_ids[i+1:]:
                corr = self._get_effective_correlation(need_a, need_b)
                if corr < self.CONFLICT_THRESHOLD:
                    conflicts.append((need_a, need_b, corr))
        
        return conflicts
    
    # ============================================================
    # "切掉重连"机制
    # ============================================================
    
    def mark_path_wrong(self, from_id: int, to_id: int) -> bool:
        """
        用户标记"这条路径不对" → 降低该边权重 20%
        
        Returns:
            是否成功修改
        """
        original = self.matrix.get_correlation(from_id, to_id)
        new_value = original * 0.8  # 降低 20%
        
        # 限制在 [-1, 1] 范围内
        new_value = max(-1.0, min(1.0, new_value))
        
        self.user_modifications[(from_id, to_id)] = new_value
        self.user_modifications[(to_id, from_id)] = new_value  # 对称修改
        
        logger.info(f"用户标记路径错误: {from_id}→{to_id}, 关联度 {original:.3f} → {new_value:.3f}")
        return True
    
    def mark_path_right(self, from_id: int, to_id: int) -> bool:
        """
        用户标记"这条路径对" → 提升该边权重 10%
        
        Returns:
            是否成功修改
        """
        original = self.matrix.get_correlation(from_id, to_id)
        new_value = original * 1.1  # 提升 10%
        
        # 限制在 [-1, 1] 范围内
        new_value = max(-1.0, min(1.0, new_value))
        
        self.user_modifications[(from_id, to_id)] = new_value
        self.user_modifications[(to_id, from_id)] = new_value  # 对称修改
        
        logger.info(f"用户标记路径正确: {from_id}→{to_id}, 关联度 {original:.3f} → {new_value:.3f}")
        return True
    
    def reset_modifications(self):
        """重置所有用户修改"""
        self.user_modifications.clear()
        logger.info("已重置所有用户修改")
    
    def get_modifications(self) -> Dict[Tuple[int, int], float]:
        """获取所有用户修改记录"""
        return self.user_modifications.copy()
