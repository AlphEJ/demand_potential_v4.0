"""
需求势能 v4.0 - 用户画像管理
基于贝叶斯更新的动态权重系统

核心思想：
- 将马斯洛的固定权重作为"先验概率"（Prior）
- 每次观察用户行为后，更新为"后验概率"（Posterior）
- 交互越多，后验越接近用户的真实需求结构
"""

import time
import json
import numpy as np
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Tuple
from pathlib import Path

from .demands import NeedMeta, MaslowLayer
from .matrix import AssociationMatrix


@dataclass
class InteractionRecord:
    """单次交互记录"""
    timestamp: float
    active_needs: List[int]           # 本次激活的需求 ID 列表
    user_choice: Optional[int] = None  # 用户最终选择的需求 ID（如有）
    source_text: str = ""              # 原始输入


class UserProfile:
    """
    用户画像 - 存储个性化需求权重

    核心功能：
    1. 维护 12 维个性化权重（初始值 = 马斯洛默认值）
    2. 维护 12×12 个性化关联矩阵（初始值 = 预设矩阵）
    3. 基于贝叶斯更新动态调整权重
    4. 持久化存储/加载
    """

    # 马斯洛默认权重（作为先验）
    _PRIOR_WEIGHTS = np.array([
        0.95,  # D1 生理生存
        0.90,  # D2 安全稳定
        0.75,  # D3 社交归属
        0.70,  # D4 情感陪伴
        0.80,  # D5 尊重认可
        0.85,  # D6 认知求知
        0.55,  # D7 审美价值
        0.60,  # D8 自我实现
        0.40,  # D9 自由掌控
        0.35,  # D10 公平公正
        0.45,  # D11 成长进阶
        0.38,  # D12 秩序规整
    ], dtype=np.float64)

    def __init__(
        self,
        user_id: str = "default",
        learning_rate: float = 0.1,
        prior_strength: float = 0.7,
        prior_decay_rate: float = 0.95,
        prior_min_strength: float = 0.3,
        matrix_learning_rate: float = 0.01,
        weight_min: float = 0.20,
        weight_max: float = 1.0,
    ):
        """
        初始化用户画像

        Args:
            user_id: 用户唯一标识
            learning_rate: 权重学习率（控制每次更新幅度）
            prior_strength: 先验强度初始值（0=完全数据驱动，1=完全不动）
            prior_decay_rate: 先验衰减速率（每10次交互衰减5%）
            prior_min_strength: 先验最低保留强度（永远不完全抛弃理论）
            matrix_learning_rate: 关联矩阵学习率
            weight_min: 权重最小值
            weight_max: 权重最大值
        """
        self.user_id = user_id
        self.created_at = time.time()
        self.updated_at = time.time()

        # 12维个性化权重（初始 = 马斯洛先验）
        self.need_weights: np.ndarray = self._PRIOR_WEIGHTS.copy()

        # 12×12 个性化关联矩阵（初始 = 预设矩阵）
        self.personal_matrix: np.ndarray = AssociationMatrix().matrix.copy()

        # 交互统计
        self.interaction_count: int = 0
        self.need_frequency: np.ndarray = np.zeros(12, dtype=np.float64)
        self.interaction_history: List[InteractionRecord] = []

        # 学习参数
        self.learning_rate = learning_rate
        self.prior_strength = prior_strength
        self.prior_decay_rate = prior_decay_rate
        self.prior_min_strength = prior_min_strength
        self.matrix_learning_rate = matrix_learning_rate
        self.weight_min = weight_min
        self.weight_max = weight_max

    @property
    def current_prior_strength(self) -> float:
        """当前先验强度（随交互次数衰减）"""
        decayed = self.prior_strength * (
            self.prior_decay_rate ** (self.interaction_count / 10)
        )
        return max(decayed, self.prior_min_strength)

    def get_need_weight(self, need_id: int) -> float:
        """获取某个需求的个性化权重"""
        if 0 <= need_id < 12:
            return float(self.need_weights[need_id])
        return 0.3

    def get_level_weight(self, need_id: int) -> float:
        """获取某个需求的层级权重（兼容旧接口）"""
        return self.get_need_weight(need_id)

    def get_personal_matrix(self) -> np.ndarray:
        """获取个性化关联矩阵"""
        return self.personal_matrix.copy()

    def update_from_interaction(
        self,
        active_needs: List[int],
        user_choice: Optional[int] = None,
        source_text: str = "",
    ) -> Dict:
        """
        基于一次交互更新用户画像

        Args:
            active_needs: 本次激活的需求 ID 列表
            user_choice: 用户最终选择的需求 ID（如有）
            source_text: 原始输入文本

        Returns:
            更新报告
        """
        if not active_needs:
            return {"updated": False, "reason": "无活跃需求"}

        self.interaction_count += 1

        # 记录交互
        record = InteractionRecord(
            timestamp=time.time(),
            active_needs=active_needs.copy(),
            user_choice=user_choice,
            source_text=source_text,
        )
        self.interaction_history.append(record)

        # 保留最近 100 条记录
        if len(self.interaction_history) > 100:
            self.interaction_history = self.interaction_history[-100:]

        # Step 1: 更新频率统计
        for need_id in active_needs:
            if 0 <= need_id < 12:
                self.need_frequency[need_id] += 1

        # Step 2: 基于频率的贝叶斯更新
        old_weights = self.need_weights.copy()
        self._bayesian_update_weights()

        # Step 3: 如果有用户选择，做对比更新
        if user_choice is not None and len(active_needs) > 1:
            self._contrastive_update(user_choice, active_needs)

        # Step 4: 更新关联矩阵
        self._update_matrix(active_needs)

        self.updated_at = time.time()

        # 生成更新报告
        weight_changes = self.need_weights - old_weights
        significant_changes = []
        for i in range(12):
            if abs(weight_changes[i]) > 0.01:
                significant_changes.append({
                    "need": NeedMeta.get_name(i),
                    "need_id": i,
                    "old_weight": round(float(old_weights[i]), 4),
                    "new_weight": round(float(self.need_weights[i]), 4),
                    "change": round(float(weight_changes[i]), 4),
                })

        return {
            "updated": True,
            "interaction_count": self.interaction_count,
            "current_prior_strength": round(self.current_prior_strength, 4),
            "significant_changes": significant_changes,
        }

    def _bayesian_update_weights(self):
        """
        贝叶斯权重更新

        后验 = α × 先验 + (1 - α) × 经验分布
        其中 α 随交互次数衰减
        """
        total = self.need_frequency.sum()
        if total == 0:
            return

        # 经验分布（从数据中观察到的概率）
        empirical = self.need_frequency / total

        # 当前先验强度
        alpha = self.current_prior_strength

        # 贝叶斯混合
        self.need_weights = alpha * self._PRIOR_WEIGHTS + (1 - alpha) * empirical

        # 裁剪到合法范围
        self.need_weights = np.clip(self.need_weights, self.weight_min, self.weight_max)

    def _contrastive_update(self, user_choice: int, active_needs: List[int]):
        """
        对比更新：用户选择了 A 而不是 B
        → A 的权重上调，B 的权重下调
        """
        lr = self.learning_rate

        for need_id in active_needs:
            if 0 <= need_id < 12:
                if need_id == user_choice:
                    # 被选择的需求：权重上调
                    self.need_weights[need_id] *= (1 + lr)
                else:
                    # 未被选择的需求：权重小幅下调
                    self.need_weights[need_id] *= (1 - lr * 0.3)

        # 归一化到合法范围
        self.need_weights = np.clip(self.need_weights, self.weight_min, self.weight_max)

    def _update_matrix(self, active_needs: List[int]):
        """
        基于共现频率微调关联矩阵

        如果 D3(社交) 和 D5(尊重) 经常同时出现
        → 它们之间的关联度应该上调
        """
        lr = self.matrix_learning_rate

        for i, need_a in enumerate(active_needs):
            for need_b in active_needs[i + 1:]:
                if 0 <= need_a < 12 and 0 <= need_b < 12:
                    self.personal_matrix[need_a, need_b] += lr
                    self.personal_matrix[need_b, need_a] += lr

        # 保持值域
        self.personal_matrix = np.clip(self.personal_matrix, -1.0, 1.0)

        # 保持对角线为 1
        np.fill_diagonal(self.personal_matrix, 1.0)

    def get_weight_summary(self) -> List[Dict]:
        """获取权重摘要（用于可视化）"""
        summary = []
        for i in range(12):
            prior = float(self._PRIOR_WEIGHTS[i])
            current = float(self.need_weights[i])
            freq = int(self.need_frequency[i])
            summary.append({
                "need_id": i,
                "need": NeedMeta.get_name(i),
                "need_en": NeedMeta.get_name_en(i),
                "layer": NeedMeta.get_layer(i).name_cn,
                "prior_weight": round(prior, 4),
                "current_weight": round(current, 4),
                "change": round(current - prior, 4),
                "frequency": freq,
            })
        return summary

    def get_stats(self) -> Dict:
        """获取用户画像统计信息"""
        return {
            "user_id": self.user_id,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "interaction_count": self.interaction_count,
            "current_prior_strength": round(self.current_prior_strength, 4),
            "total_need_activations": int(self.need_frequency.sum()),
            "most_active_need": NeedMeta.get_name(int(np.argmax(self.need_frequency))),
            "weight_range": [round(float(self.need_weights.min()), 4),
                             round(float(self.need_weights.max()), 4)],
        }

    def save_to_file(self, filepath: str) -> bool:
        """保存用户画像到文件"""
        try:
            path = Path(filepath)
            path.parent.mkdir(parents=True, exist_ok=True)

            data = {
                "user_id": self.user_id,
                "created_at": self.created_at,
                "updated_at": self.updated_at,
                "interaction_count": self.interaction_count,
                "need_weights": self.need_weights.tolist(),
                "personal_matrix": self.personal_matrix.tolist(),
                "need_frequency": self.need_frequency.tolist(),
                "learning_rate": self.learning_rate,
                "prior_strength": self.prior_strength,
                "prior_decay_rate": self.prior_decay_rate,
                "prior_min_strength": self.prior_min_strength,
                "matrix_learning_rate": self.matrix_learning_rate,
                "weight_min": self.weight_min,
                "weight_max": self.weight_max,
            }

            # 保存交互历史（最近50条）
            history_to_save = []
            for record in self.interaction_history[-50:]:
                history_to_save.append({
                    "timestamp": record.timestamp,
                    "active_needs": record.active_needs,
                    "user_choice": record.user_choice,
                    "source_text": record.source_text,
                })
            data["interaction_history"] = history_to_save

            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

            return True
        except Exception:
            return False

    @classmethod
    def load_from_file(cls, filepath: str) -> Optional["UserProfile"]:
        """从文件加载用户画像"""
        try:
            path = Path(filepath)
            if not path.exists():
                return None

            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)

            profile = cls(
                user_id=data.get("user_id", "default"),
                learning_rate=data.get("learning_rate", 0.1),
                prior_strength=data.get("prior_strength", 0.7),
                prior_decay_rate=data.get("prior_decay_rate", 0.95),
                prior_min_strength=data.get("prior_min_strength", 0.3),
                matrix_learning_rate=data.get("matrix_learning_rate", 0.01),
                weight_min=data.get("weight_min", 0.20),
                weight_max=data.get("weight_max", 1.0),
            )

            profile.created_at = data.get("created_at", time.time())
            profile.updated_at = data.get("updated_at", time.time())
            profile.interaction_count = data.get("interaction_count", 0)
            profile.need_weights = np.array(data.get("need_weights", profile._PRIOR_WEIGHTS.tolist()))
            profile.personal_matrix = np.array(data.get("personal_matrix", AssociationMatrix().matrix.tolist()))
            profile.need_frequency = np.array(data.get("need_frequency", np.zeros(12).tolist()))

            # 加载交互历史
            for h in data.get("interaction_history", []):
                record = InteractionRecord(
                    timestamp=h["timestamp"],
                    active_needs=h["active_needs"],
                    user_choice=h.get("user_choice"),
                    source_text=h.get("source_text", ""),
                )
                profile.interaction_history.append(record)

            return profile
        except Exception:
            return None

    def reset(self):
        """重置用户画像到初始状态"""
        self.need_weights = self._PRIOR_WEIGHTS.copy()
        self.personal_matrix = AssociationMatrix().matrix.copy()
        self.interaction_count = 0
        self.need_frequency = np.zeros(12, dtype=np.float64)
        self.interaction_history.clear()
        self.updated_at = time.time()


# ===== 全局用户画像管理 =====

_profiles: Dict[str, UserProfile] = {}


def get_user_profile(user_id: str = "default") -> UserProfile:
    """获取或创建用户画像"""
    global _profiles
    if user_id not in _profiles:
        _profiles[user_id] = UserProfile(user_id=user_id)
    return _profiles[user_id]


def get_or_load_profile(user_id: str = "default", filepath: Optional[str] = None) -> UserProfile:
    """获取用户画像，优先从文件加载"""
    global _profiles
    if user_id in _profiles:
        return _profiles[user_id]

    if filepath:
        profile = UserProfile.load_from_file(filepath)
        if profile:
            _profiles[user_id] = profile
            return profile

    _profiles[user_id] = UserProfile(user_id=user_id)
    return _profiles[user_id]


def save_profile(profile: UserProfile, directory: str = "profiles") -> bool:
    """保存用户画像"""
    filepath = f"{directory}/{profile.user_id}.json"
    return profile.save_to_file(filepath)


def reset_all_profiles():
    """重置所有用户画像"""
    global _profiles
    _profiles.clear()
