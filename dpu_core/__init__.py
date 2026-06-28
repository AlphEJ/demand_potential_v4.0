"""
DPU Core - 编译黑盒包
核心算法已编译为二进制，不可反编译。
"""
from .config import DPUConfig, default_config
from .demands import NeedMeta, Demand, DemandSet, MaslowLayer
from .demands import parse_demands_by_keywords, parse_demands_by_embedding
from .matrix import AssociationMatrix
from .potential import PotentialCalculator
from .suppression import LayerSuppression
from .conflict import ConflictArbiter
from .profile import (
    UserProfile, InteractionRecord,
    get_user_profile, get_or_load_profile,
    save_profile, reset_all_profiles,
)

__version__ = "4.2.0"
__all__ = [
    "DPUConfig", "default_config",
    "NeedMeta", "Demand", "DemandSet", "MaslowLayer",
    "parse_demands_by_keywords", "parse_demands_by_embedding",
    "AssociationMatrix",
    "PotentialCalculator",
    "ConflictArbiter",
    "LayerSuppression",
    "UserProfile", "InteractionRecord",
    "get_user_profile", "get_or_load_profile",
    "save_profile", "reset_all_profiles",
]
