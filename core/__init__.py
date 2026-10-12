"""
需求势能 v4.2 - 核心算法层
DPU (Demand Processing Unit) Core Engine
"""

from .demands import NeedMeta, Demand, DemandSet
from .demands import parse_demands_by_keywords, parse_demands_by_embedding
from .matrix import AssociationMatrix
from .config import DPUConfig
from .potential import PotentialCalculator
from .suppression import LayerSuppression
from .conflict import ConflictArbiter
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
