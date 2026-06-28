"""
需求势能引擎 - 势能计算模块（黑盒代理）
核心算法已编译为二进制，通过 dpu_core 包导入。
"""
from dpu_core.potential import PotentialCalculator

__all__ = ["PotentialCalculator"]
