"""
需求势能 v4.2 - 核心算法层
DPU (Demand Processing Unit) Core Engine
"""

from .demands import NeedMeta, Demand, DemandSet
from .demands import parse_demands_by_keywords, parse_demands_by_embedding

# 黑盒模块通过 dpu_core 导入（避免循环导入）
from dpu_core.config import DPUConfig
from dpu_core.matrix import AssociationMatrix
from dpu_core.potential import PotentialCalculator
from dpu_core.suppression import LayerSuppression
from dpu_core.conflict import ConflictArbiter

from .engine import DemandPotentialEngine, DPUOutput

# v4.2 新增
from .demand_descriptions import get_all_descriptions, get_description
from .embedding_matcher import DemandEmbeddingMatcher, EmbeddingConfig

__version__ = "4.2.0"
__all__ = [
    "NeedMeta",
    "Demand",
    "DemandSet",
    "AssociationMatrix",
    "DPUConfig",
    "PotentialCalculator",
    "LayerSuppression",
    "ConflictArbiter",
    "DemandPotentialEngine",
    "DPUOutput",
    # v4.2
    "parse_demands_by_keywords",
    "parse_demands_by_embedding",
    "get_all_descriptions",
    "get_description",
    "DemandEmbeddingMatcher",
    "EmbeddingConfig",
]
