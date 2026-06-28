"""
需求势能引擎 - 用户画像模块（黑盒代理）
核心算法已编译为二进制，通过 dpu_core 包导入。
"""
from dpu_core.profile import (
    UserProfile,
    InteractionRecord,
    get_user_profile,
    get_or_load_profile,
    save_profile,
    reset_all_profiles,
)

__all__ = [
    "UserProfile",
    "InteractionRecord",
    "get_user_profile",
    "get_or_load_profile",
    "save_profile",
    "reset_all_profiles",
]
