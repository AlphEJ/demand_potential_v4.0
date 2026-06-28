"""
需求势能引擎 - 层级压制模块（黑盒代理）
核心算法已编译为二进制，通过 dpu_core 包导入。
"""
from dpu_core.suppression import LayerSuppression

__all__ = ["LayerSuppression"]
