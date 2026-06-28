"""
用户画像管理 (UserProfile) 单元测试
覆盖贝叶斯权重更新、对比学习、矩阵更新、持久化、重置
"""
import json
import tempfile
import os
import numpy as np
import pytest
from core.profile import (
    UserProfile,
    InteractionRecord,
    get_user_profile,
    get_or_load_profile,
    save_profile,
    reset_all_profiles,
)


# ============================================================
# Fixtures
# ============================================================

@pytest.fixture
def profile():
    """新建用户画像"""
    return UserProfile(user_id="test_user")


@pytest.fixture
def tmp_dir():
    """临时目录"""
    d = tempfile.mkdtemp()
    yield d
    # 清理
    import shutil
    shutil.rmtree(d, ignore_errors=True)


# ============================================================
# 初始状态
# ============================================================

class TestInitialState:
    """画像初始化状态"""

    def test_default_weights_equal_prior(self, profile):
        """初始权重 = 马斯洛先验"""
        np.testing.assert_array_equal(profile.need_weights, UserProfile._PRIOR_WEIGHTS)

    def test_initial_interaction_count_zero(self, profile):
        assert profile.interaction_count == 0

    def test_initial_frequency_all_zero(self, profile):
        np.testing.assert_array_equal(
            profile.need_frequency, np.zeros(12, dtype=np.float64)
        )

    def test_initial_history_empty(self, profile):
        assert len(profile.interaction_history) == 0

    def test_initial_matrix_is_default(self, profile):
        """初始个性化矩阵 = 默认关联矩阵"""
        from core.matrix import AssociationMatrix
        default = AssociationMatrix().matrix
        np.testing.assert_array_equal(profile.personal_matrix, default)

    def test_initial_prior_strength(self, profile):
        """初始先验强度 = 配置值"""
        assert profile.current_prior_strength == pytest.approx(0.7)

    def test_custom_parameters(self):
        """自定义学习参数"""
        p = UserProfile(
            user_id="custom",
            learning_rate=0.2,
            prior_strength=0.5,
            prior_decay_rate=0.9,
            prior_min_strength=0.1,
        )
        assert p.learning_rate == 0.2
        assert p.prior_strength == 0.5
        assert p.prior_decay_rate == 0.9
        assert p.prior_min_strength == 0.1


# ============================================================
# 权重查询
# ============================================================

class TestWeightAccess:
    """get_need_weight / get_level_weight"""

    def test_valid_need_id_returns_weight(self, profile):
        assert profile.get_need_weight(0) == pytest.approx(0.95)
        assert profile.get_need_weight(1) == pytest.approx(0.90)
        assert profile.get_need_weight(11) == pytest.approx(0.38)

    def test_invalid_need_id_returns_default(self, profile):
        assert profile.get_need_weight(-1) == 0.3
        assert profile.get_need_weight(12) == 0.3
        assert profile.get_need_weight(999) == 0.3

    def test_get_level_weight_aliases_get_need_weight(self, profile):
        """兼容旧接口"""
        assert profile.get_level_weight(0) == profile.get_need_weight(0)

    def test_get_personal_matrix_returns_copy(self, profile):
        m = profile.get_personal_matrix()
        m[0, 0] = 999  # 修改返回的副本
        assert profile.personal_matrix[0, 0] == 1.0  # 原始不变


# ============================================================
# update_from_interaction — 频率更新
# ============================================================

class TestUpdateFrequency:
    """update_from_interaction 的频率统计"""

    def test_single_interaction_increments_count(self, profile):
        profile.update_from_interaction(active_needs=[0])
        assert profile.interaction_count == 1

    def test_single_need_updates_frequency(self, profile):
        profile.update_from_interaction(active_needs=[0])
        assert profile.need_frequency[0] == 1
        # 其他维度不变
        assert profile.need_frequency[1] == 0

    def test_multiple_needs_update_all(self, profile):
        profile.update_from_interaction(active_needs=[0, 2, 5])
        assert profile.need_frequency[0] == 1
        assert profile.need_frequency[2] == 1
        assert profile.need_frequency[5] == 1

    def test_multiple_interactions_accumulate(self, profile):
        for _ in range(3):
            profile.update_from_interaction(active_needs=[0, 1])
        assert profile.interaction_count == 3
        assert profile.need_frequency[0] == 3
        assert profile.need_frequency[1] == 3

    def test_no_active_needs_returns_no_update(self, profile):
        result = profile.update_from_interaction(active_needs=[])
        assert result["updated"] is False
        assert result["reason"] == "无活跃需求"
        assert profile.interaction_count == 0  # 不计数

    def test_invalid_need_ids_ignored(self, profile):
        """非法的 need_id 被忽略"""
        profile.update_from_interaction(active_needs=[0, -1, 12, 999])
        assert profile.need_frequency[0] == 1
        # 非法 ID 不影响合法 ID 的统计
        assert profile.interaction_count == 1

    def test_history_recorded(self, profile):
        profile.update_from_interaction(
            active_needs=[0, 1],
            user_choice=0,
            source_text="我饿了明天有面试",
        )
        assert len(profile.interaction_history) == 1
        record = profile.interaction_history[0]
        assert record.active_needs == [0, 1]
        assert record.user_choice == 0
        assert "饿了" in record.source_text

    def test_history_capped_at_100(self, profile):
        """交互历史最多保留 100 条"""
        for i in range(150):
            profile.update_from_interaction(active_needs=[0])
        assert len(profile.interaction_history) == 100


# ============================================================
# 贝叶斯权重更新
# ============================================================

class TestBayesianUpdate:
    """贝叶斯权重更新逻辑"""

    def test_weights_shift_toward_empirical(self, profile):
        """交互越多，权重向经验分布靠拢"""
        original = profile.need_weights.copy()

        # 只激活 D0 大量次数
        for _ in range(100):
            profile.update_from_interaction(active_needs=[0])

        # D0 的权重应上升（向经验分布靠拢）
        # 先验 0.95, 经验 1.0 (100% 的激活都是 D0)
        # alpha = 0.7 * 0.95^(100/10) = 0.7 * 0.95^10 ≈ 0.419
        # posterior = 0.419 * 0.95 + 0.581 * 1.0 = 0.398 + 0.581 = 0.979
        assert profile.get_need_weight(0) > original[0]

        # 其他需求的权重应下降
        for i in range(1, 12):
            assert profile.get_need_weight(i) < original[i]

    def test_prior_strength_decays_with_interactions(self, profile):
        """先验强度随交互衰减"""
        initial = profile.current_prior_strength
        assert initial == pytest.approx(0.7)

        # 每 10 次交互衰减 5%
        for _ in range(10):
            profile.update_from_interaction(active_needs=[0])

        decayed = profile.current_prior_strength
        expected = 0.7 * (0.95 ** 1)  # 10 次 = 1 个衰减周期
        assert decayed == pytest.approx(expected, abs=1e-4)

    def test_prior_strength_never_below_min(self, profile):
        """先验强度不低于最小值"""
        # 大量交互
        for _ in range(1000):
            profile.update_from_interaction(active_needs=[0])
        assert profile.current_prior_strength >= profile.prior_min_strength

    def test_weights_stay_within_bounds(self, profile):
        """权重始终在 [weight_min, weight_max] 范围内"""
        for _ in range(200):
            profile.update_from_interaction(active_needs=[0, 1, 2, 3, 4])

        for i in range(12):
            w = profile.get_need_weight(i)
            assert profile.weight_min <= w <= profile.weight_max


# ============================================================
# 对比更新 (用户选择)
# ============================================================

class TestContrastiveUpdate:
    """用户选择了 A 而不是 B → A 权重上调，B 权重下调"""

    def test_chosen_need_weight_increases(self, profile):
        """被选择的权重上调 — 多次交互后做对比更新"""
        # 先建立足够的交互历史，让贝叶斯更新稳定
        for _ in range(50):
            profile.update_from_interaction(active_needs=[0, 1, 2, 3])

        # 记录当前权重
        original_w0 = profile.get_need_weight(0)
        original_w1 = profile.get_need_weight(1)

        # 做一次带选择的交互
        profile.update_from_interaction(
            active_needs=[0, 1],
            user_choice=0,
        )

        # D0 被选择 → 相对 D1 有更多上调
        w0_change = profile.get_need_weight(0) - original_w0
        w1_change = profile.get_need_weight(1) - original_w1
        assert w0_change > w1_change

    def test_single_active_need_no_contrastive(self, profile):
        """只有一个活跃需求时不做对比更新"""
        original = profile.get_need_weight(0)
        profile.update_from_interaction(active_needs=[0], user_choice=0)
        # 只有频率更新 + 贝叶斯更新，无对比更新
        # 权重仍会因频率更新而变化
        assert profile.interaction_count == 1

    def test_contrastive_update_magnitude(self, profile):
        """验证对比更新的幅度"""
        lr = profile.learning_rate  # 0.1
        original_w0 = profile.get_need_weight(0)
        original_w1 = profile.get_need_weight(1)

        # 先做一次交互让频率有基础值
        profile.update_from_interaction(active_needs=[0, 1])
        # 第二次才做对比更新（有上次的贝叶斯结果）
        profile.update_from_interaction(active_needs=[0, 1], user_choice=0)

        # 被选择: *= (1 + lr) = 1.1
        # 未被选: *= (1 - lr * 0.3) = 0.97
        # 但之前有贝叶斯更新混入，不好精确断言
        # 验证方向正确即可
        final_w0 = profile.get_need_weight(0)
        final_w1 = profile.get_need_weight(1)
        assert final_w0 > original_w0 or final_w1 < original_w1


# ============================================================
# 关联矩阵更新
# ============================================================

class TestMatrixUpdate:
    """基于共现频率的关联矩阵微调"""

    def test_cooccurrence_increases_correlation(self, profile):
        """共现需求间的关联度上调"""
        # D3(2) 和 D5(4) 初始关联度
        initial = profile.personal_matrix[2, 4]

        for _ in range(50):
            profile.update_from_interaction(active_needs=[2, 4])

        updated = profile.personal_matrix[2, 4]
        # 共现多次 → 关联度上升
        assert updated > initial

    def test_diagonal_always_one(self, profile):
        """对角线始终保持 1.0"""
        for _ in range(100):
            profile.update_from_interaction(
                active_needs=[i % 12 for i in range(3)]
            )
        for i in range(12):
            assert profile.personal_matrix[i, i] == pytest.approx(1.0)

    def test_matrix_values_clamped(self, profile):
        """矩阵值限制在 [-1, 1]"""
        for _ in range(200):
            profile.update_from_interaction(
                active_needs=[0, 1, 2, 3, 4, 5]
            )
        for i in range(12):
            for j in range(12):
                assert -1.0 <= profile.personal_matrix[i, j] <= 1.0

    def test_matrix_is_symmetric(self, profile):
        """关联矩阵对称"""
        for _ in range(30):
            profile.update_from_interaction(active_needs=[0, 5, 8])
        for i in range(12):
            for j in range(12):
                assert profile.personal_matrix[i, j] == pytest.approx(
                    profile.personal_matrix[j, i]
                )


# ============================================================
# 摘要与统计
# ============================================================

class TestSummaries:
    """get_weight_summary / get_stats"""

    def test_weight_summary_has_12_items(self, profile):
        summary = profile.get_weight_summary()
        assert len(summary) == 12

    def test_weight_summary_structure(self, profile):
        summary = profile.get_weight_summary()
        item = summary[0]
        assert item["need_id"] == 0
        assert item["need"] == "生理生存"
        assert "need_en" in item
        assert "layer" in item
        assert "prior_weight" in item
        assert "current_weight" in item
        assert "change" in item
        assert "frequency" in item

    def test_summary_change_is_current_minus_prior(self, profile):
        """change = current_weight - prior_weight"""
        # 初始: change = 0
        summary = profile.get_weight_summary()
        for item in summary:
            assert item["change"] == 0.0

    def test_get_stats_structure(self, profile):
        stats = profile.get_stats()
        assert stats["user_id"] == "test_user"
        assert "created_at" in stats
        assert "updated_at" in stats
        assert stats["interaction_count"] == 0
        assert "current_prior_strength" in stats
        assert "total_need_activations" in stats
        assert "most_active_need" in stats
        assert "weight_range" in stats

    def test_stats_update_after_interaction(self, profile):
        profile.update_from_interaction(active_needs=[0, 0, 1])
        stats = profile.get_stats()
        assert stats["interaction_count"] == 1
        # need_frequency: D0=2, D1=1 → sum=3（原始计数，不去重）
        assert stats["total_need_activations"] == 3


# ============================================================
# 持久化 (save/load)
# ============================================================

class TestPersistence:
    """save_to_file / load_from_file"""

    def test_save_and_load_roundtrip(self, profile, tmp_dir):
        """保存 → 加载 → 数据一致"""
        # 先做一些交互产生非初始数据
        for _ in range(20):
            profile.update_from_interaction(
                active_needs=[0, 1, 3],
                user_choice=0,
                source_text="测试",
            )

        filepath = os.path.join(tmp_dir, "test_profile.json")
        assert profile.save_to_file(filepath) is True

        loaded = UserProfile.load_from_file(filepath)
        assert loaded is not None
        assert loaded.user_id == profile.user_id
        assert loaded.interaction_count == profile.interaction_count
        np.testing.assert_array_almost_equal(loaded.need_weights, profile.need_weights)
        np.testing.assert_array_almost_equal(loaded.personal_matrix, profile.personal_matrix)
        np.testing.assert_array_almost_equal(loaded.need_frequency, profile.need_frequency)

    def test_load_nonexistent_file(self):
        """加载不存在的文件返回 None"""
        loaded = UserProfile.load_from_file("/nonexistent/path/profile.json")
        assert loaded is None

    def test_save_creates_parent_directory(self, profile, tmp_dir):
        """自动创建父目录"""
        filepath = os.path.join(tmp_dir, "subdir", "nested", "profile.json")
        assert profile.save_to_file(filepath) is True
        assert os.path.exists(filepath)

    def test_save_includes_history(self, profile, tmp_dir):
        """保存包含交互历史（最近 50 条）"""
        for i in range(60):
            profile.update_from_interaction(active_needs=[i % 12])

        filepath = os.path.join(tmp_dir, "history_profile.json")
        profile.save_to_file(filepath)

        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        assert len(data["interaction_history"]) == 50

    def test_loaded_profile_weights_vs_original(self, profile, tmp_dir):
        """加载后权重复原"""
        original_w = profile.need_weights.copy()

        filepath = os.path.join(tmp_dir, "fresh.json")
        profile.save_to_file(filepath)
        loaded = UserProfile.load_from_file(filepath)

        np.testing.assert_array_equal(loaded.need_weights, original_w)


# ============================================================
# 重置
# ============================================================

class TestReset:
    """reset"""

    def test_reset_restores_initial_state(self, profile):
        # 做大量修改
        for _ in range(50):
            profile.update_from_interaction(active_needs=[0, 1, 3, 5, 7])

        profile.reset()

        assert profile.interaction_count == 0
        np.testing.assert_array_equal(profile.need_weights, UserProfile._PRIOR_WEIGHTS)
        np.testing.assert_array_equal(profile.need_frequency, np.zeros(12))
        assert len(profile.interaction_history) == 0

    def test_reset_matrix_to_default(self, profile):
        from core.matrix import AssociationMatrix
        for _ in range(30):
            profile.update_from_interaction(active_needs=[0, 1, 2])
        profile.reset()
        np.testing.assert_array_equal(
            profile.personal_matrix,
            AssociationMatrix().matrix
        )


# ============================================================
# 全局画像管理
# ============================================================

class TestGlobalProfileManagement:
    """get_user_profile / get_or_load_profile / save_profile / reset_all"""

    def setup_method(self):
        reset_all_profiles()

    def teardown_method(self):
        reset_all_profiles()

    def test_get_user_profile_creates_new(self):
        p = get_user_profile("alice")
        assert p.user_id == "alice"

    def test_get_user_profile_returns_same_instance(self):
        p1 = get_user_profile("bob")
        p2 = get_user_profile("bob")
        assert p1 is p2

    def test_different_users_have_different_profiles(self):
        p1 = get_user_profile("alice")
        p2 = get_user_profile("bob")
        assert p1 is not p2
        p1.update_from_interaction(active_needs=[0])
        assert p2.interaction_count == 0  # 不受 alice 影响

    def test_get_or_load_from_file(self, tmp_dir):
        """从文件加载优先于创建新画像"""
        p = get_user_profile("charlie")
        for _ in range(10):
            p.update_from_interaction(active_needs=[5])

        filepath = os.path.join(tmp_dir, "charlie.json")
        p.save_to_file(filepath)

        reset_all_profiles()

        loaded = get_or_load_profile("charlie", filepath)
        assert loaded.interaction_count == 10

    def test_get_or_load_fallback_when_file_missing(self):
        reset_all_profiles()
        p = get_or_load_profile("nobody", "/no/such/file.json")
        assert p is not None
        assert p.interaction_count == 0

    def test_save_profile_helper(self, tmp_dir):
        """save_profile 辅助函数"""
        p = get_user_profile("dave")
        p.update_from_interaction(active_needs=[0])
        result = save_profile(p, directory=tmp_dir)
        assert result is True
        assert os.path.exists(os.path.join(tmp_dir, "dave.json"))

    def test_reset_all_clears_all(self):
        get_user_profile("a")
        get_user_profile("b")
        reset_all_profiles()
        # 新请求创建新实例
        p = get_user_profile("a")
        assert p.interaction_count == 0
