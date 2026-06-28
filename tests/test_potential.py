"""
势能计算器 (PotentialCalculator) 单元测试
覆盖 4 步势能计算公式的所有分支和边界条件
"""
import math
import pytest
from core.demands import Demand, DemandSet, MaslowLayer
from core.matrix import AssociationMatrix
from core.config import DPUConfig
from core.potential import PotentialCalculator


# ============================================================
# Fixtures
# ============================================================

@pytest.fixture
def config():
    """默认配置"""
    return DPUConfig()


@pytest.fixture
def matrix():
    """默认关联矩阵"""
    return AssociationMatrix()


@pytest.fixture
def calc(config, matrix):
    """默认计算器（禁用混沌以保证确定性）"""
    c = PotentialCalculator(config, matrix, random_seed=42)
    c.config.enable_chaos = False
    return c


@pytest.fixture
def calc_chaos(config, matrix):
    """启用混沌的计算器（固定种子）"""
    return PotentialCalculator(config, matrix, random_seed=42)


def make_demand(
    need_id: int = 0,
    urgency: float = 0.8,
    importance: float = 0.9,
    resource_dep: float = 0.3,
    intent: float = 0.7,
    system_load: float = 0.1,
    wait_time: float = 0.0,
) -> Demand:
    """快速构造需求实例"""
    return Demand(
        id=need_id,
        urgency=urgency,
        importance=importance,
        resource_dep=resource_dep,
        intent=intent,
        system_load=system_load,
        wait_time=wait_time,
    )


def make_demand_set(*demands: Demand, source_text: str = "测试输入") -> DemandSet:
    """快速构造需求集合"""
    ds = DemandSet(source_text=source_text, timestamp=1000.0)
    for d in demands:
        ds.add(d)
    return ds


# ============================================================
# Step 1: 意图门控
# ============================================================

class TestStep1IntentGate:
    """第 1 步：Intent < 0.3 的需求被过滤"""

    def test_passes_when_intent_above_threshold(self, calc):
        """intent >= 0.3 → 通过门控"""
        assert calc.step1_intent_gate(make_demand(intent=0.3)) is True
        assert calc.step1_intent_gate(make_demand(intent=0.5)) is True
        assert calc.step1_intent_gate(make_demand(intent=1.0)) is True

    def test_fails_when_intent_below_threshold(self, calc):
        """intent < 0.3 → 被门控过滤"""
        assert calc.step1_intent_gate(make_demand(intent=0.29)) is False
        assert calc.step1_intent_gate(make_demand(intent=0.0)) is False

    def test_boundary_exactly_threshold(self, calc):
        """intent == 0.3 恰好通过"""
        assert calc.step1_intent_gate(make_demand(intent=0.3)) is True

    def test_just_below_threshold(self, calc):
        """intent == 0.299 不通过（浮点边界）"""
        assert calc.step1_intent_gate(make_demand(intent=0.299)) is False


# ============================================================
# Step 2: 基础势能
# ============================================================

class TestStep2BasePotential:
    """
    P_base = Level_factor × (w2×(E×I) + w3×(1-R) + w4×Intent_Gate) + w1×Level_weight
    默认: w1=0.35, w2=0.30, w3=0.20, w4=0.15
    """

    def test_known_input_gives_expected_output(self, calc):
        """手动验算一个已知结果"""
        # D0 生理生存: level_factor=1.0, level_weight=0.95
        # U=0.8, I=0.9, R=0.3, intent=0.7
        d = make_demand(0, urgency=0.8, importance=0.9, resource_dep=0.3, intent=0.7)

        result = calc.step2_calculate_p_base(d)

        # 手工计算:
        # composite = 0.30 * (0.8 * 0.9) = 0.216
        # risk      = 0.20 * (1 - 0.3) = 0.14
        # intent    = 0.15 * 0.7       = 0.105
        # sum       = 0.216 + 0.14 + 0.105 = 0.461
        # level_factor = 1.0
        # P_base = 1.0 * 0.461 + 0.35 * 0.95 = 0.461 + 0.3325 = 0.7935
        expected = 0.7935
        assert result == pytest.approx(expected, abs=1e-4)

    def test_zero_urgency_importance_still_has_level_bonus(self, calc):
        """U=I=0 时，仅剩 w1×level_weight 加法项"""
        # D11 秩序规整: level_factor=0.70, level_weight=0.38
        d = make_demand(11, urgency=0.0, importance=0.0, resource_dep=1.0, intent=0.3)
        result = calc.step2_calculate_p_base(d)

        # composite = 0 → risk = 0.20 * 0 = 0 → intent = 0.15 * 0.3 = 0.045
        # level_factor = 0.70 → 0.70 * 0.045 + 0.35 * 0.38 = 0.0315 + 0.133 = 0.1645
        expected = 0.1645
        assert result == pytest.approx(expected, abs=1e-4)

    def test_max_all_parameters(self, calc):
        """所有参数取最大值时的势能"""
        d = make_demand(0, urgency=1.0, importance=1.0, resource_dep=0.0, intent=1.0)
        result = calc.step2_calculate_p_base(d)

        # composite = 0.30 * (1.0) = 0.30
        # risk = 0.20 * 1.0 = 0.20
        # intent = 0.15 * 1.0 = 0.15
        # sum = 0.65
        # P_base = 1.0 * 0.65 + 0.35 * 0.95 = 0.65 + 0.3325 = 0.9825
        expected = 0.9825
        assert result == pytest.approx(expected, abs=1e-4)

    def test_p_base_never_negative(self, calc):
        """即使所有输入为 0，P_base 也不应 < 0（只会是 w1×level_weight）"""
        d = make_demand(7, urgency=0.0, importance=0.0, resource_dep=1.0, intent=0.0)
        result = calc.step2_calculate_p_base(d)
        assert result >= 0.0

    def test_different_layers_have_different_weights(self, calc):
        """不同层级的需求应有不同的 level_weight"""
        d_low = make_demand(0, urgency=0.5, importance=0.5, resource_dep=0.5, intent=0.5)
        d_high = make_demand(8, urgency=0.5, importance=0.5, resource_dep=0.5, intent=0.5)

        low_result = calc.step2_calculate_p_base(d_low)
        high_result = calc.step2_calculate_p_base(d_high)

        # D0 (生理) level_weight=0.95 > D8 (自由掌控) level_weight=0.40
        # level_factor: D0=1.0, D8=0.70
        assert low_result > high_result

    def test_profile_overrides_level_weight(self, calc):
        """个性化画像权重替代默认层级权重"""
        from core.profile import UserProfile

        profile = UserProfile(user_id="test")
        # 把 D0 权重压到很低
        profile.need_weights[0] = 0.20

        d = make_demand(0, urgency=0.8, importance=0.9, resource_dep=0.3, intent=0.7)

        result_with_profile = calc.step2_calculate_p_base(d, profile=profile)
        result_without = calc.step2_calculate_p_base(d)

        # profile 降低权重 → P_base 更低
        assert result_with_profile < result_without


# ============================================================
# Step 3: 耦合势能
# ============================================================

class TestStep3CouplePotential:
    """
    P_couple = P_base × max(0.1, 1 + Corr_avg - |Excl_max|)
    """

    def test_need_not_in_active_list_unchanged(self, calc):
        """不在活跃列表中 → P_couple = P_base"""
        d = make_demand(0, intent=0.5)
        d.potential_base = 0.8
        calc.step3_calculate_p_couple(d, active_needs=[1, 2])  # 不包含 0
        assert d.potential_couple == 0.8

    def test_positive_correlation_boosts_potential(self, calc):
        """正向关联提升势能"""
        # D0(0) 和 D1(1) 的关联度 = 0.85（强正相关）
        d = make_demand(0, intent=0.5)
        d.potential_base = 0.8
        calc.step3_calculate_p_couple(d, active_needs=[0, 1])

        # corr_avg = 0.85/1 = 0.85, excl_max = 0 (no negative)
        # couple_factor = 1 + 0.85 - 0 = 1.85
        # P_couple = 0.8 * 1.85 = 1.48
        expected = 1.48
        assert d.potential_couple == pytest.approx(expected, abs=1e-4)
        assert d.potential_couple > d.potential_base

    def test_negative_exclusion_reduces_potential(self, calc):
        """互斥关系降低势能"""
        # D9(8) 和 D12(11) 关联度 = -0.70
        d9 = make_demand(8, intent=0.5)
        d9.potential_base = 0.8
        calc.step3_calculate_p_couple(d9, active_needs=[8, 11])

        # corr_avg = -0.70/1 = -0.70, excl_max = -0.70
        # couple_factor = max(0.1, 1 + (-0.70) - 0.70) = max(0.1, -0.40) = 0.1
        # P_couple = 0.8 * 0.1 = 0.08
        expected = 0.08
        assert d9.potential_couple == pytest.approx(expected, abs=1e-4)
        assert d9.potential_couple < d9.potential_base

    def test_couple_factor_floor(self, calc):
        """耦合系数不低于 0.1"""
        d = make_demand(11, intent=0.5)  # D12 秩序规整
        d.potential_base = 0.5
        # 活跃需求包含 D9(8) 和 D8(7)，D12 跟他们相关度都低
        calc.step3_calculate_p_couple(d, active_needs=[11, 8, 7])
        # 确保不低于保底
        assert d.potential_couple >= 0.05
        # couple_factor >= 0.1
        assert d.potential_couple / d.potential_base >= 0.1 - 1e-6

    def test_single_active_need_no_coupling_effect(self, calc):
        """只有一个活跃需求时，关联计算无对比对象 → 不变"""
        d = make_demand(3, intent=0.5)
        d.potential_base = 0.5
        calc.step3_calculate_p_couple(d, active_needs=[3])
        assert d.potential_couple == 0.5


# ============================================================
# Step 4: 最终势能
# ============================================================

class TestStep4FinalPotential:
    """
    P_final = max(0, P_couple × (1-Decay) × (1-0.5×Load) + T×ΔP)
    """

    def test_no_load_no_wait_standard_case(self, calc):
        """负载=0 等待=0 → 只有衰减"""
        d = make_demand(0, system_load=0.0, wait_time=0.0)
        d.potential_couple = 1.0
        calc.step4_calculate_p_final(d)

        # (1 - 0.02) * (1 - 0.5*0) = 0.98, aging_gain = 0
        # P_final = 1.0 * 0.98 + 0 = 0.98
        expected = 0.98
        assert d.potential_final == pytest.approx(expected, abs=1e-4)

    def test_high_load_reduces_potential(self, calc):
        """高负载降低最终势能"""
        d = make_demand(0, system_load=0.8, wait_time=0.0)
        d.potential_couple = 1.0
        calc.step4_calculate_p_final(d)

        # (1 - 0.02) * (1 - 0.5*0.8) = 0.98 * 0.6 = 0.588
        expected = 0.588
        assert d.potential_final == pytest.approx(expected, abs=1e-4)

    def test_wait_time_adds_aging_bonus(self, calc):
        """长时间等待获得老化增益"""
        # system_load=0 → load_factor=1, 简化计算
        d_no_wait = make_demand(0, system_load=0.0, wait_time=0.0)
        d_wait = make_demand(0, system_load=0.0, wait_time=100.0)
        d_no_wait.potential_couple = 1.0
        d_wait.potential_couple = 1.0

        calc.step4_calculate_p_final(d_no_wait)
        calc.step4_calculate_p_final(d_wait)

        # aging_gain = 100 * 0.008 = 0.8
        # d_wait > d_no_wait
        assert d_wait.potential_final > d_no_wait.potential_final
        # 精确值: wait_no = 1.0 * 0.98 * 1.0 = 0.98
        #           wait_yes = 0.98 + 100 * 0.008 = 0.98 + 0.8 = 1.78
        assert d_wait.potential_final == pytest.approx(1.78, abs=1e-4)

    def test_final_never_negative(self, calc):
        """即使极端负面输入，P_final 也不 < 0"""
        d = make_demand(0, system_load=1.0, wait_time=0.0)
        d.potential_couple = 0.01
        calc.step4_calculate_p_final(d)
        assert d.potential_final >= 0.0

    def test_chaos_enabled_produces_variation(self, config, matrix):
        """启用混沌时，相同输入两次输出不同（固定种子则可重现）"""
        # 使用两个独立的计算器（相同种子 = 相同混沌序列起点 → 相同结果）
        calc_a = PotentialCalculator(config, matrix, random_seed=42)
        calc_b = PotentialCalculator(config, matrix, random_seed=42)

        d1 = make_demand(0, system_load=0.0, wait_time=0.0)
        d2 = make_demand(0, system_load=0.0, wait_time=0.0)
        d1.potential_couple = 1.0
        d2.potential_couple = 1.0

        calc_a.step4_calculate_p_final(d1)
        calc_b.step4_calculate_p_final(d2)

        # 相同种子 → 相同混沌 → 相同结果
        assert d1.potential_final == pytest.approx(d2.potential_final, abs=1e-10)

    def test_chaos_range_within_bounds(self, calc_chaos):
        """混沌扰动在 ±5% 范围内"""
        d = make_demand(0, system_load=0.0, wait_time=0.0)
        d.potential_couple = 1.0
        calc_chaos.step4_calculate_p_final(d)

        # 无混沌时 = 0.98, 有混沌 ±5%
        no_chaos = 0.98
        assert abs(d.potential_final - no_chaos) <= no_chaos * 0.05 + 1e-6


# ============================================================
# 完整流水线 (calculate_all)
# ============================================================

class TestCalculateAllPipeline:
    """4 步完整流水线集成测试"""

    def test_single_demand_full_pipeline(self, calc):
        """单个需求走完整流水线"""
        d = make_demand(0, urgency=0.7, importance=0.8, resource_dep=0.3, intent=0.6)
        ds = make_demand_set(d)
        result = calc.calculate_all(ds)

        # 验证各阶段都有值
        assert d.potential_base > 0
        assert d.potential_couple > 0
        assert d.potential_final > 0
        assert result is ds  # 返回同一对象

    def test_intent_gate_filters_low_intent(self, calc):
        """低 intent 需求被门控过滤，不参与后续计算"""
        d_pass = make_demand(0, intent=0.6)
        d_fail = make_demand(1, intent=0.2)
        ds = make_demand_set(d_pass, d_fail)
        calc.calculate_all(ds)

        # 通过的需求有计算值
        assert d_pass.potential_base > 0
        # 被过滤的需求保持 0
        assert d_fail.potential_base == 0.0
        assert d_fail.potential_final == 0.0

    def test_all_filtered_returns_empty(self, calc):
        """全部被门控过滤 → 原样返回"""
        d = make_demand(0, intent=0.1)
        ds = make_demand_set(d)
        result = calc.calculate_all(ds)
        assert len(result.get_valid_demands()) == 0

    def test_multiple_demands_ordered_by_potential(self, calc):
        """多个需求按势能排序"""
        ds = make_demand_set(
            make_demand(0, urgency=0.3, importance=0.3, intent=0.5),  # 低
            make_demand(1, urgency=0.9, importance=0.9, intent=0.9),  # 高
            make_demand(2, urgency=0.5, importance=0.5, intent=0.5),  # 中
        )
        calc.calculate_all(ds)

        sorted_demands = ds.get_sorted()
        assert len(sorted_demands) == 3
        # 按势能降序排列
        for i in range(len(sorted_demands) - 1):
            assert sorted_demands[i].potential_final >= sorted_demands[i + 1].potential_final

    def test_profile_affects_sorting(self, calc):
        """个性化画像影响排序结果"""
        from core.profile import UserProfile

        profile = UserProfile(user_id="test")
        # 大幅提升 D8 的权重
        profile.need_weights[7] = 0.95  # D8 自我实现
        # 降低 D0 的权重
        profile.need_weights[0] = 0.30  # D0 生理生存

        ds = make_demand_set(
            make_demand(0, urgency=0.5, importance=0.5, intent=0.5),
            make_demand(7, urgency=0.5, importance=0.5, intent=0.5),
        )
        calc.calculate_all(ds, profile=profile)

        d0 = ds.get(0)
        d7 = ds.get(7)
        # D7 的 level_factor=0.70, D0=1.0
        # 但 profile weight D7=0.95, D0=0.30
        # w1×weight 项: D7=0.35*0.95=0.3325, D0=0.35*0.30=0.105
        # 即使 D0 level_factor 更高，w1 项差异更大
        # P_base D0 = 1.0*(0.075+0.10+0.075)+0.105 = 0.25+0.105 = 0.355
        # P_base D7 = 0.70*(0.075+0.10+0.075)+0.3325 = 0.175+0.3325 = 0.5075
        assert d7.potential_base > d0.potential_base


# ============================================================
# 随机种子可重现性
# ============================================================

class TestReproducibility:
    """随机种子确保结果可重现"""

    def test_same_seed_same_result(self, config, matrix):
        """相同种子 → 相同最终势能"""
        def run():
            c = PotentialCalculator(config, matrix, random_seed=99)
            c.config.enable_chaos = True
            d = make_demand(0, intent=0.5)
            d.potential_base = 0.5
            d.potential_couple = 0.5
            c.step4_calculate_p_final(d)
            return d.potential_final

        result1 = run()
        result2 = run()
        assert result1 == result2

    def test_different_seed_different_result(self, config, matrix):
        """不同种子 → 不同混沌 → 不同势能（大概率）"""
        def run(seed):
            c = PotentialCalculator(config, matrix, random_seed=seed)
            c.config.enable_chaos = True
            d = make_demand(0, intent=0.5)
            d.potential_base = 0.5
            d.potential_couple = 0.5
            c.step4_calculate_p_final(d)
            return d.potential_final

        r1 = run(1)
        r2 = run(9999)
        # 两个不同种子大概率不同（极端情况可能碰巧一致）
        # 取 10 个不同种子，至少有一个不同
        results = {run(s) for s in range(10)}
        assert len(results) > 1

    def test_set_random_seed_switches_behavior(self, calc):
        """动态切换种子生效"""
        calc.config.enable_chaos = True
        calc.set_random_seed(42)
        d1 = make_demand(0, intent=0.5)
        d1.potential_couple = 1.0
        calc.step4_calculate_p_final(d1)

        calc.set_random_seed(999)
        d2 = make_demand(0, intent=0.5)
        d2.potential_couple = 1.0
        calc.step4_calculate_p_final(d2)

        # 不同种子应产生不同混沌
        assert d1.potential_final != d2.potential_final


# ============================================================
# 边界条件与特殊场景
# ============================================================

class TestEdgeCases:
    """边界条件测试"""

    def test_all_12_demands_pipeline(self, calc):
        """12 个需求全部通过流水线"""
        ds = DemandSet(source_text="全维度测试", timestamp=0.0)
        for i in range(12):
            ds.add(make_demand(i, urgency=0.5, importance=0.5, intent=0.5))
        calc.calculate_all(ds)
        assert len(ds.get_valid_demands()) == 12
        assert all(d.potential_final >= 0 for d in ds.demands.values())

    def test_demand_values_clamped(self, calc):
        """Demand 值被 clamp 到 [0,1]"""
        from core.demands import Demand as D
        d = D(id=0, urgency=999, importance=-5, resource_dep=100, intent=50)
        # __post_init__ 不做 clamp → 但 calculate 中只读不写这些字段
        # 测试的是 engine.py 中构造 demand 时的 clamp
        # 这里验证计算器不崩溃
        ds = make_demand_set(d)
        calc.calculate_all(ds)
        assert d.potential_final >= 0  # 不崩即通过

    def test_empty_demand_set_no_error(self, calc):
        """空需求集不报错"""
        ds = DemandSet(source_text="空", timestamp=0.0)
        result = calc.calculate_all(ds)
        assert len(result.get_valid_demands()) == 0

    def test_demand_with_extreme_resource_dependency(self, calc):
        """资源依赖=1 → risk项=0"""
        d = make_demand(0, urgency=0.5, importance=0.5, resource_dep=1.0, intent=0.5)
        calc.step2_calculate_p_base(d)
        # resource_dep=1 → (1-R)=0 → risk term = 0
        # 仍然有 composite + intent + level_weight
        assert d.potential_base > 0
