"""
需求势能引擎 - 配置模块（黑盒代理）
核心算法已编译为二进制，通过 dpu_core 包导入。
"""
from dpu_core.config import DPUConfig, default_config

__all__ = ["DPUConfig", "default_config"]
