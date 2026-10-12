"""
需求势能3.0 - 12×12关联矩阵
基于心理学先验知识预设
"""

import numpy as np
from typing import List, Tuple, Dict, Optional
from pathlib import Path
import json


class AssociationMatrix:
    """
    12×12需求关联矩阵
    行/列顺序: D1-D12 (生理生存到秩序规整)
    """
    
    # 预设矩阵（基于心理学先验）
    _PRESET_MATRIX = np.array([
        # D1    D2    D3    D4    D5    D6    D7    D8    D9    D10   D11   D12
        [1.00, 0.85, 0.05, 0.10, 0.05, 0.10, -0.10, -0.15, 0.20, 0.30, 0.10, 0.15],   # D1 生理
        [0.85, 1.00, 0.15, 0.20, 0.10, 0.15, 0.00, -0.10, 0.30, 0.40, 0.20, 0.25],   # D2 安全
        [0.05, 0.15, 1.00, 0.80, 0.60, 0.40, 0.30, 0.25, 0.10, 0.20, 0.40, 0.35],   # D3 社交
        [0.10, 0.20, 0.80, 1.00, 0.70, 0.35, 0.40, 0.30, 0.05, 0.15, 0.35, 0.30],   # D4 情感
        [0.05, 0.10, 0.60, 0.70, 1.00, 0.75, 0.50, 0.60, 0.30, 0.40, 0.70, 0.45],   # D5 尊重
        [0.10, 0.15, 0.40, 0.35, 0.75, 1.00, 0.60, 0.80, 0.40, 0.35, 0.80, 0.60],   # D6 认知
        [-0.10, 0.00, 0.30, 0.40, 0.50, 0.60, 1.00, 0.90, 0.20, 0.30, 0.60, 0.50],  # D7 审美
        [-0.15, -0.10, 0.25, 0.30, 0.60, 0.80, 0.90, 1.00, 0.50, 0.40, 0.70, 0.45],  # D8 自我实现
        [0.20, 0.30, 0.10, 0.05, 0.30, 0.40, 0.20, 0.50, 1.00, 0.60, 0.30, -0.70],  # D9 自由
        [0.30, 0.40, 0.20, 0.15, 0.40, 0.35, 0.30, 0.40, 0.60, 1.00, 0.50, 0.20],   # D10 公平
        [0.10, 0.20, 0.40, 0.35, 0.70, 0.80, 0.60, 0.70, 0.30, 0.50, 1.00, 0.40],   # D11 成长
        [0.15, 0.25, 0.35, 0.30, 0.45, 0.60, 0.50, 0.45, -0.70, 0.20, 0.40, 1.00],  # D12 秩序
    ])
    
    def __init__(self, custom_matrix: Optional[np.ndarray] = None, 
                 validate: bool = True, auto_fix: bool = True):
        """
        初始化关联矩阵
        
        Args:
            custom_matrix: 自定义矩阵，None则使用预设矩阵
            validate: 是否验证矩阵有效性
            auto_fix: 是否自动修复问题
        """
        if custom_matrix is not None:
            self.matrix = custom_matrix.copy()
        else:
            self.matrix = self._PRESET_MATRIX.copy()

        # 保存原始预设快照（用于回滚）
        self._preset_snapshot = self._PRESET_MATRIX.copy()
        # 备份历史
        self._backups: List[np.ndarray] = []

        if validate:
            issues = self.validate()
            if issues and auto_fix:
                self._fix_issues(issues)
    
    def validate(self) -> List[str]:
        """
        验证矩阵有效性
        
        Returns:
            问题列表，空列表表示验证通过
        """
        issues = []
        
        # 检查形状
        if self.matrix.shape != (12, 12):
            issues.append(f"矩阵形状错误: {self.matrix.shape}, 应为 (12, 12)")
            return issues  # 形状错误，后续检查无意义
        
        # 检查对角线
        for i in range(12):
            if abs(self.matrix[i, i] - 1.0) > 1e-6:
                issues.append(f"对角线值错误: matrix[{i},{i}] = {self.matrix[i, i]}, 应为 1.0")
        
        # 检查对称性
        asymmetry_count = 0
        max_asymmetry = 0.0
        for i in range(12):
            for j in range(i + 1, 12):
                diff = abs(self.matrix[i, j] - self.matrix[j, i])
                if diff > 1e-6:
                    asymmetry_count += 1
                    max_asymmetry = max(max_asymmetry, diff)
        
        if asymmetry_count > 0:
            issues.append(f"矩阵不对称: {asymmetry_count} 处不对称, 最大差异 {max_asymmetry:.4f}")
        
        # 检查值范围
        out_of_range_count = 0
        for i in range(12):
            for j in range(12):
                if self.matrix[i, j] < -1.0 or self.matrix[i, j] > 1.0:
                    out_of_range_count += 1
        
        if out_of_range_count > 0:
            issues.append(f"值超出范围: {out_of_range_count} 处值不在 [-1, 1] 范围内")
        
        return issues
    
    def _fix_issues(self, issues: List[str]) -> None:
        """
        自动修复矩阵问题
        
        Args:
            issues: 问题列表
        """
        for issue in issues:
            if "对角线值错误" in issue:
                # 修复对角线
                np.fill_diagonal(self.matrix, 1.0)
            
            elif "矩阵不对称" in issue:
                # 对称化矩阵
                self.matrix = (self.matrix + self.matrix.T) / 2
            
            elif "值超出范围" in issue:
                # 裁剪到 [-1, 1]
                self.matrix = np.clip(self.matrix, -1.0, 1.0)
    
    def is_valid(self) -> bool:
        """检查矩阵是否有效"""
        return len(self.validate()) == 0
    
    def save_to_file(self, filepath: str) -> bool:
        """
        保存矩阵到文件
        
        Args:
            filepath: 文件路径
        
        Returns:
            是否成功
        """
        try:
            path = Path(filepath)
            path.parent.mkdir(parents=True, exist_ok=True)
            
            data = {
                "matrix": self.matrix.tolist(),
                "description": "12x12 需求关联矩阵",
                "needs": [
                    "D1_生理生存", "D2_安全", "D3_社交归属", "D4_情感联结",
                    "D5_尊重认可", "D6_认知理解", "D7_审美体验", "D8_自我实现",
                    "D9_自由掌控", "D10_公平正义", "D11_成长进步", "D12_秩序规整"
                ]
            }
            
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            return True
        except Exception:
            return False
    
    @classmethod
    def load_from_file(cls, filepath: str) -> "AssociationMatrix":
        """
        从文件加载矩阵
        
        Args:
            filepath: 文件路径
        
        Returns:
            AssociationMatrix 实例
        """
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            matrix = np.array(data["matrix"])
            return cls(custom_matrix=matrix, validate=True, auto_fix=True)
        except Exception:
            # 加载失败，返回默认矩阵
            return cls()
    
    def get_correlation(self, need_a: int, need_b: int) -> float:
        """获取两个需求的关联度"""
        if 0 <= need_a < 12 and 0 <= need_b < 12:
            return float(self.matrix[need_a, need_b])
        return 0.0

    def get_attention_correlation(
        self,
        need_a: int,
        need_b: int,
        activations: Optional[List[float]] = None,
        alpha: float = 0.5,
    ) -> float:
        """
        v4.2 注意力加权关联度

        基础关联度 × 注意力增强因子。
        当两个需求维度同时被激活时，它们之间的关联度会被动态增强。

        Formula:
          C_attn(i,j) = C_base(i,j) × (1 + α × sqrt(a_i × a_j))

        - a_i, a_j: 需求 i/j 的激活值 [0,1]
        - α: 注意力强度 (default 0.5)
        - sqrt(a_i × a_j): 两个需求共激活的几何平均值
          → 两者都高时增强显著（如 a_i=0.9, a_j=0.8 → +40%）
          → 一高一低时增强微弱（如 a_i=0.9, a_j=0.2 → +11%）
          → 两者都低时几乎不增强

        Args:
            need_a, need_b: 需求ID (0-11)
            activations: 12维激活值数组，None则退化为原始关联度
            alpha: 注意力强度系数

        Returns:
            float: 注意力加权后的关联度 [0, 1]
        """
        if 0 > need_a or need_a >= 12 or 0 > need_b or need_b >= 12:
            return 0.0
        base = float(self.matrix[need_a, need_b])
        if activations is None:
            return base
        a_i = max(0.0, min(1.0, activations[need_a]))
        a_j = max(0.0, min(1.0, activations[need_b]))
        overlap = (a_i * a_j) ** 0.5  # geometric mean
        boost = 1.0 + alpha * overlap
        return float(max(0.0, min(1.0, base * boost)))

    def get_attention_matrix(
        self,
        activations: List[float],
        alpha: float = 0.5,
    ) -> np.ndarray:
        """
        计算完整的12×12注意力加权矩阵

        Returns:
            shape (12,12) 的注意力加权关联矩阵
        """
        attn = np.zeros((12, 12), dtype=np.float64)
        for i in range(12):
            for j in range(12):
                attn[i, j] = self.get_attention_correlation(i, j, activations, alpha)
        return attn
    
    def calc_corr_avg(
        self,
        need_id: int,
        active_needs: List[int],
        activations: Optional[List[float]] = None,
        alpha: float = 0.5,
    ) -> float:
        """计算某需求与所有活跃需求的平均关联度（支持注意力加权）"""
        if not active_needs or need_id not in active_needs:
            return 0.0

        total = 0.0
        count = 0
        for other_id in active_needs:
            if other_id != need_id:
                if activations is not None:
                    total += self.get_attention_correlation(need_id, other_id, activations, alpha)
                else:
                    total += self.get_correlation(need_id, other_id)
                count += 1

        return total / count if count > 0 else 0.0

    def calc_excl_max(
        self,
        need_id: int,
        active_needs: List[int],
        activations: Optional[List[float]] = None,
        alpha: float = 0.5,
    ) -> float:
        """计算某需求与活跃需求的最大互斥度（支持注意力加权）"""
        if not active_needs or need_id not in active_needs:
            return 0.0

        min_corr = 0.0
        for other_id in active_needs:
            if other_id != need_id:
                if activations is not None:
                    corr = self.get_attention_correlation(need_id, other_id, activations, alpha)
                else:
                    corr = self.get_correlation(need_id, other_id)
                if corr < min_corr:
                    min_corr = corr

        return min_corr  # 返回负数或0
    
    def get_conflict_pairs(self, active_needs: List[int], threshold: float = -0.5) -> List[Tuple[int, int, float]]:
        """获取冲突需求对（关联度 < threshold）"""
        conflicts = []
        for i, need_a in enumerate(active_needs):
            for need_b in active_needs[i+1:]:
                corr = self.get_correlation(need_a, need_b)
                if corr < threshold:
                    conflicts.append((need_a, need_b, corr))
        return conflicts
    
    def get_association_pairs(self, active_needs: List[int], threshold: float = 0.7) -> List[Tuple[int, int, float]]:
        """获取强关联需求对（关联度 > threshold）"""
        associations = []
        for i, need_a in enumerate(active_needs):
            for need_b in active_needs[i+1:]:
                corr = self.get_correlation(need_a, need_b)
                if corr > threshold:
                    associations.append((need_a, need_b, corr))
        return associations
    
    def get_matrix_data(self) -> np.ndarray:
        """获取完整矩阵数据（用于可视化）"""
        return self.matrix.copy()

    # ============================================================
    # v4.2 新增：动态自适应更新
    # ============================================================

    def update_cell(self, i: int, j: int, new_value: float) -> None:
        """
        更新单个矩阵单元，保持对称性和值域约束。

        Args:
            i, j: 行列索引 (0-11)
            new_value: 新的关联值
        """
        clamped = max(0.0, min(1.0, new_value))
        self.matrix[i, j] = clamped
        self.matrix[j, i] = clamped
        np.fill_diagonal(self.matrix, 1.0)

    def update_from_cooccurrence(
        self,
        data_matrix: np.ndarray,
        learning_rate: float = 0.05,
    ) -> Dict:
        """
        从共现数据批量更新矩阵（EWMA滑动平均）。

        公式：M_new = (1 - lr) * M_current + lr * M_data
        然后 clamp 到 [0,1]，对称化，对角线恢复 1.0。

        Args:
            data_matrix: shape (12,12) 的归一化共现矩阵
            learning_rate: 学习率

        Returns:
            更新报告 dict
        """
        if data_matrix.shape != (12, 12):
            return {"updated": False, "reason": f"shape mismatch: {data_matrix.shape}"}

        old_matrix = self.matrix.copy()

        # EWMA 更新
        self.matrix = (1 - learning_rate) * self.matrix + learning_rate * data_matrix

        # 保持约束
        self.matrix = np.clip(self.matrix, 0.0, 1.0)
        self.matrix = (self.matrix + self.matrix.T) / 2  # 对称化
        np.fill_diagonal(self.matrix, 1.0)

        # 计算变化
        delta = np.abs(self.matrix - old_matrix)
        max_change = float(delta.max())
        avg_change = float(delta.mean())

        return {
            "updated": True,
            "max_change": round(max_change, 6),
            "avg_change": round(avg_change, 6),
            "learning_rate": learning_rate,
        }

    def clamp_values(self) -> None:
        """将所有矩阵值限制在 [0, 1] 范围，对角线 = 1.0"""
        self.matrix = np.clip(self.matrix, 0.0, 1.0)
        np.fill_diagonal(self.matrix, 1.0)

    def snapshot(self) -> np.ndarray:
        """获取当前矩阵的深拷贝快照。

        Returns:
            shape (12,12) 的矩阵副本
        """
        return self.matrix.copy()

    def rollback(self, snapshot: np.ndarray) -> bool:
        """回滚到指定快照。

        Args:
            snapshot: 之前通过 snapshot() 获取的矩阵

        Returns:
            是否成功
        """
        if snapshot.shape != (12, 12):
            return False
        self.matrix = snapshot.copy()
        return True

    def rollback_to_preset(self) -> bool:
        """回滚到原始预设矩阵。

        Returns:
            是否成功
        """
        self.matrix = self._preset_snapshot.copy()
        self._backups.clear()
        return True

    def backup(self) -> int:
        """备份当前矩阵到内部历史。

        Returns:
            备份索引
        """
        self._backups.append(self.matrix.copy())
        # 最多保留 50 个备份
        if len(self._backups) > 50:
            self._backups = self._backups[-50:]
        return len(self._backups) - 1

    def rollback_to_backup(self, index: int) -> bool:
        """回滚到指定索引的内部备份。

        Args:
            index: 备份索引（0-based）

        Returns:
            是否成功
        """
        if 0 <= index < len(self._backups):
            self.matrix = self._backups[index].copy()
            return True
        return False

    def diff(self, other: np.ndarray) -> np.ndarray:
        """计算当前矩阵与另一个矩阵的逐元素差异。

        Returns:
            shape (12,12) 的差异矩阵
        """
        return self.matrix - other

    def self_check(self) -> List[str]:
        """
        综合自检：运行 validate() + 额外合理性检查。

        Returns:
            问题列表，空列表 = 全部通过
        """
        issues = self.validate()

        # 额外检查：对角线必须为 1.0
        for i in range(12):
            if abs(self.matrix[i, i] - 1.0) > 1e-6:
                issues.append(f"self_check: matrix[{i},{i}] = {self.matrix[i,i]} != 1.0")

        # 检查 NaN/Inf
        if np.any(np.isnan(self.matrix)):
            issues.append("self_check: matrix contains NaN values")
        if np.any(np.isinf(self.matrix)):
            issues.append("self_check: matrix contains Inf values")

        return issues

    def export_to_json(self, filepath: str) -> bool:
        """导出为矩阵专用的紧凑JSON（保留原 save_to_file 接口）。

        Args:
            filepath: 输出路径

        Returns:
            是否成功
        """
        import json
        from pathlib import Path
        try:
            path = Path(filepath)
            path.parent.mkdir(parents=True, exist_ok=True)
            data = {
                "matrix": self.matrix.tolist(),
                "shape": list(self.matrix.shape),
                "needs": [f"D{i+1}_{NeedMeta.get_name(i)}" for i in range(12)],
                "is_preset": bool(np.allclose(self.matrix, self._preset_snapshot)),
            }
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            return True
        except Exception:
            return False

    def export_heatmap_json(self) -> Dict:
        """
        导出为前端热力图可视化用的 JSON。

        Returns:
            {needs: [...], matrix: [[float]]}
        """
        return {
            "needs": [NeedMeta.get_name(i) for i in range(12)],
            "needs_en": [NeedMeta.get_name_en(i) for i in range(12)],
            "matrix": self.matrix.tolist(),
        }
