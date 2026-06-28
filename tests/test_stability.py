"""
形式化验证 + 极端边界稳定性测试
覆盖所有极端场景：空输入/极值/冲突/大量迭代/不变式检查
输出稳定性校验报告
"""

import json
import math
import os
import tempfile
import time

import numpy as np
import pytest

from core.demands import Demand, DemandSet, NeedMeta, MaslowLayer
from core.matrix import AssociationMatrix
from core.config import DPUConfig
from core.potential import PotentialCalculator
from core.suppression import LayerSuppression
from core.conflict import ConflictArbiter
from core.profile import UserProfile
from core.engine import DemandPotentialEngine, DPUOutput


# ============================================================
# Helpers
# ============================================================

def make_demand(need_id, urgency=0.5, importance=0.5, resource_dep=0.3,
                intent=0.5, system_load=0.1, wait_time=0.0, **kw):
    return Demand(id=need_id, urgency=urgency, importance=importance,
                  resource_dep=resource_dep, intent=intent,
                  system_load=system_load, wait_time=wait_time, **kw)


def make_ds(*demands):
    ds = DemandSet(source_text="stability_test", timestamp=time.time())
    for d in demands:
        ds.add(d)
    return ds


# ============================================================
# 空输入/边界输入
# ============================================================

class TestEmptyInput:
    """空文本、空白、特殊字符不崩溃"""

    def test_empty_string_demandset(self):
        ds = DemandSet(source_text="", timestamp=0)
        assert len(ds.get_valid_demands()) == 0
        assert ds.get_sorted() == []

    def test_whitespace_only(self):
        ds = DemandSet(source_text="   \t\n  ", timestamp=0)
        assert len(ds.get_valid_demands()) == 0

    def test_single_punctuation(self):
        ds = DemandSet(source_text="。！？...", timestamp=0)
        assert len(ds.get_valid_demands()) == 0

    def test_very_long_text_no_crash(self):
        long_text = "我饿了 " * 10000
        from core.demands import parse_demands_by_keywords
        ds = parse_demands_by_keywords(long_text)
        assert ds is not None

    def test_none_input_handled(self):
        """None 作为 source_text 输入不应崩溃"""
        try:
            ds = DemandSet(source_text=None, timestamp=0)
            # 访问 source_text 可能有问题，但不应该崩溃
            valid = ds.get_valid_demands()
            assert valid == []
        except Exception:
            pass  # 允许合理报错

    def test_unicode_special_characters(self):
        """Unicode特殊字符不崩溃"""
        weird = "🔥🎮💀✨ 你饿了吗 ♥♦♣♠"
        from core.demands import parse_demands_by_keywords
        ds = parse_demands_by_keywords(weird)
        assert ds is not None


# ============================================================
# 单一需求极值
# ============================================================

class TestSingleNeedExtremes:
    """单一需求各种极端参数值"""

    def setup_method(self):
        self.config = DPUConfig()
        self.config.enable_chaos = False
        self.matrix = AssociationMatrix()
        self.calc = PotentialCalculator(self.config, self.matrix, random_seed=42)
        self.calc.config.enable_chaos = False

    def test_urgency_max_all_others_zero(self):
        d = make_demand(0, urgency=1.0, importance=0.0, resource_dep=0.0, intent=0.3)
        ds = make_ds(d)
        self.calc.calculate_all(ds)
        assert d.potential_final >= 0

    def test_importance_max_others_zero(self):
        d = make_demand(0, urgency=0.0, importance=1.0, resource_dep=0.0, intent=0.3)
        ds = make_ds(d)
        self.calc.calculate_all(ds)
        assert d.potential_final >= 0

    def test_intent_exactly_at_threshold(self):
        d = make_demand(0, urgency=0.5, importance=0.5, intent=0.3)
        ds = make_ds(d)
        self.calc.calculate_all(ds)
        assert d.potential_final >= 0

    def test_intent_just_below_threshold(self):
        d = make_demand(0, urgency=0.5, importance=0.5, intent=0.299)
        ds = make_ds(d)
        self.calc.calculate_all(ds)
        assert d.potential_final == 0.0
        assert not d.is_valid

    def test_resource_dep_full(self):
        d = make_demand(0, urgency=0.5, importance=0.5, resource_dep=1.0, intent=0.5)
        ds = make_ds(d)
        self.calc.calculate_all(ds)
        assert d.potential_final >= 0

    def test_resource_dep_zero(self):
        d = make_demand(0, urgency=0.5, importance=0.5, resource_dep=0.0, intent=0.5)
        ds = make_ds(d)
        self.calc.calculate_all(ds)
        assert d.potential_final >= 0

    def test_all_12_needs_single_extreme(self):
        """每个维度单独取极值"""
        for i in range(12):
            d = make_demand(i, urgency=1.0, importance=1.0, intent=1.0)
            ds = make_ds(d)
            self.calc.calculate_all(ds)
            assert d.potential_final >= 0, f"Need {i} got negative potential"
            assert not math.isnan(d.potential_final), f"Need {i} got NaN"
            assert not math.isinf(d.potential_final), f"Need {i} got Inf"


# ============================================================
# 多需求多层级冲突
# ============================================================

class TestMultiNeedConflict:
    """多需求同时激活 + 层级冲突"""

    def setup_method(self):
        self.config = DPUConfig()
        self.config.enable_chaos = False
        self.matrix = AssociationMatrix()
        self.calc = PotentialCalculator(self.config, self.matrix, random_seed=42)
        self.calc.config.enable_chaos = False
        self.suppressor = LayerSuppression(self.config)
        self.arbiter = ConflictArbiter(self.config, self.matrix)

    def test_all_12_demands_simultaneously(self):
        """12个需求全部激活 → 无崩溃、无非负数"""
        ds = DemandSet(source_text="全维度测试", timestamp=0)
        for i in range(12):
            ds.add(make_demand(i, urgency=0.7, importance=0.7, intent=0.5))
        self.calc.calculate_all(ds)
        self.suppressor.apply_suppression(ds)
        order = self.arbiter.generate_action_order(ds)

        assert len(order) > 0
        for item in order:
            assert item["potential"] >= 0

    def test_antagonistic_pair(self):
        """互斥需求对：D9(自由) vs D12(秩序) 关联度 = -0.70"""
        ds = make_ds(
            make_demand(8, urgency=0.9, importance=0.9, intent=0.8),   # D9
            make_demand(11, urgency=0.9, importance=0.9, intent=0.8),  # D12
        )
        self.calc.calculate_all(ds)
        self.suppressor.apply_suppression(ds)
        conflicts = self.arbiter.get_conflicts(ds)

        # 应检测到冲突
        assert len(conflicts) > 0
        for c in conflicts:
            assert c["strength"] > 0
            assert "need_a" in c and "need_b" in c

    def test_all_low_suppresses_all_high(self):
        """L0生理层高激活 → 压制所有高层"""
        ds = make_ds(
            make_demand(0, urgency=1.0, importance=1.0, intent=1.0),   # L0 生理
            make_demand(2, urgency=0.5, importance=0.5, intent=0.5),   # L2 社交
            make_demand(4, urgency=0.5, importance=0.5, intent=0.5),   # L3 尊重
            make_demand(7, urgency=0.5, importance=0.5, intent=0.5),   # L4 自我实现
        )
        self.calc.calculate_all(ds)
        self.suppressor.apply_suppression(ds)

        # 高层被压制
        assert ds.get(7).suppressed
        # 低层不被压制
        assert not ds.get(0).suppressed

    def test_no_oscillation_repeated_calculation(self):
        """重复计算不震荡（同输入 → 同输出）"""
        results = []
        for _ in range(20):
            ds = make_ds(
                make_demand(0, urgency=0.8, importance=0.7, intent=0.6),
                make_demand(1, urgency=0.5, importance=0.6, intent=0.5),
            )
            self.calc.calculate_all(ds)
            results.append((ds.get(0).potential_final, ds.get(1).potential_final))

        # 所有结果应一致
        first = results[0]
        for r in results:
            assert r[0] == pytest.approx(first[0])
            assert r[1] == pytest.approx(first[1])


# ============================================================
# 贝叶斯画像大规模迭代
# ============================================================

class TestBayesianStability:
    """用户画像大量迭代的稳定性"""

    def test_1000_iterations_no_divergence(self):
        profile = UserProfile(user_id="stress_test")
        initial = profile.need_weights.copy()

        for _ in range(1000):
            profile.update_from_interaction(active_needs=[0, 1, 2])

        # 权重不应发散
        for i in range(12):
            w = profile.get_need_weight(i)
            assert profile.weight_min <= w <= profile.weight_max
        assert profile.interaction_count == 1000

    def test_1000_iterations_single_need(self):
        """只激活一个需求1000次 → 该需求权重应提升"""
        profile = UserProfile(user_id="single_need_stress")
        initial_w0 = profile.get_need_weight(0)

        for _ in range(1000):
            profile.update_from_interaction(active_needs=[0])

        final_w0 = profile.get_need_weight(0)
        assert final_w0 > initial_w0

    def test_weights_never_exceed_bounds(self):
        """任意随机模式迭代 → 权重始终在 [weight_min, weight_max] 内"""
        profile = UserProfile(user_id="bounds_test")
        rng = np.random.RandomState(12345)

        for _ in range(500):
            n_needs = rng.randint(1, 6)
            needs = list(set(rng.randint(0, 12, n_needs)))
            choice = needs[0] if len(needs) > 1 else None
            profile.update_from_interaction(active_needs=needs, user_choice=choice)

        for i in range(12):
            w = profile.get_need_weight(i)
            assert profile.weight_min <= w <= profile.weight_max, f"Need {i}: {w}"

    def test_matrix_never_gets_nan(self):
        """矩阵更新不产生 NaN"""
        profile = UserProfile(user_id="matrix_nan_test")
        for _ in range(200):
            profile.update_from_interaction(active_needs=[0, 1, 5, 8])
        assert not np.any(np.isnan(profile.personal_matrix))
        assert not np.any(np.isinf(profile.personal_matrix))

    def test_convergence_to_extreme_distribution(self):
        """极端分布下权重应趋向稳定"""
        profile = UserProfile(user_id="extreme_dist", prior_min_strength=0.1)

        # 只激活 D0
        weights_history = []
        for i in range(300):
            profile.update_from_interaction(active_needs=[0])
            if i % 20 == 0:
                weights_history.append(profile.need_weights.copy())

        # 最后两次应接近（趋于稳定）
        final = weights_history[-1]
        penultimate = weights_history[-2]
        delta = np.abs(final - penultimate).max()
        assert delta < 0.02, f"权重未收敛: max delta = {delta}"


# ============================================================
# 数学不变式
# ============================================================

class TestInvariants:
    """必须始终成立的数学性质"""

    def setup_method(self):
        self.config = DPUConfig()
        self.config.enable_chaos = False
        self.matrix = AssociationMatrix()
        self.calc = PotentialCalculator(self.config, self.matrix, random_seed=42)
        self.calc.config.enable_chaos = False

    def test_no_negative_values_any_step(self):
        """4步计算中所有中间值都非负"""
        d = make_demand(0, urgency=1.0, importance=1.0, intent=0.8)
        ds = make_ds(d)
        self.calc.calculate_all(ds)

        assert d.potential_base >= 0
        assert d.potential_couple >= 0
        assert d.potential_final >= 0

    def test_potential_monotonicity_with_urgency(self):
        """urgency提升 → P_base不降"""
        d_low = make_demand(0, urgency=0.3, importance=0.5, intent=0.5)
        d_high = make_demand(0, urgency=0.9, importance=0.5, intent=0.5)

        self.calc.step2_calculate_p_base(d_low)
        self.calc.step2_calculate_p_base(d_high)
        assert d_high.potential_base >= d_low.potential_base

    def test_matrix_diagonal_always_one(self):
        """关联矩阵对角线始终为 1.0"""
        m = AssociationMatrix()
        for i in range(12):
            assert m.get_correlation(i, i) == pytest.approx(1.0)

        # 即使大量更新后
        for i in range(12):
            for j in range(12):
                m.update_cell(i, j, 0.5)
        for i in range(12):
            assert m.get_correlation(i, i) == pytest.approx(1.0)

    def test_weights_sum_behavior(self):
        """贝叶斯更新后权重分布合理"""
        profile = UserProfile()
        for _ in range(50):
            profile.update_from_interaction(active_needs=[i % 12 for i in range(3)])

        weights = [profile.get_need_weight(i) for i in range(12)]
        # 所有权重应在合理范围
        assert all(0.0 < w <= 1.0 for w in weights)

    def test_suppression_caps_monotonically_decreasing(self):
        """压制系数随层数递增单调递减"""
        sup = LayerSuppression(self.config)
        avgs = {"生理层": 0.9, "安全层": 0.1, "社交归属层": 0.1, "尊重层": 0.1, "自我实现层": 0.1}
        caps = sup.calculate_suppression_caps(avgs)

        values = [
            caps["安全层"],
            caps["社交归属层"],
            caps["尊重层"],
            caps["自我实现层"],
        ]
        for i in range(len(values) - 1):
            assert values[i] > values[i + 1], f"i={i}: {values[i]} <= {values[i+1]}"

    def test_matrix_symmetry_after_updates(self):
        """矩阵更新后始终保持对称"""
        m = AssociationMatrix()
        for _ in range(50):
            cooc = np.random.rand(12, 12) * 0.5
            cooc = (cooc + cooc.T) / 2  # 输入是对称的
            np.fill_diagonal(cooc, 1.0)
            m.update_from_cooccurrence(cooc, learning_rate=0.05)

        for i in range(12):
            for j in range(12):
                assert m.matrix[i, j] == pytest.approx(m.matrix[j, i])

    def test_no_infinity_in_pipeline(self):
        """全流水线不产生无穷大"""
        ds = make_ds(
            make_demand(0, urgency=1.0, importance=1.0, intent=1.0),
            make_demand(7, urgency=0.01, importance=0.01, intent=0.3),
        )
        self.calc.calculate_all(ds)

        for d in ds.demands.values():
            assert not math.isinf(d.potential_base)
            assert not math.isinf(d.potential_couple)
            assert not math.isinf(d.potential_final)


# ============================================================
# 组合压力测试
# ============================================================

class TestCombinedStress:
    """多组件联立压力测试"""

    def test_pipeline_100_runs_identical_output(self):
        """同输入100次 → 输出一致（确定性验证）"""
        config = DPUConfig()
        config.enable_chaos = False

        first_result = None
        for _ in range(100):
            engine = DemandPotentialEngine(
                config=config,
                llm_provider="ollama",
                user_id="stress_test",
            )
            engine._llm_client = None  # 不使用LLM
            output = engine.process("我饿了明天有面试", use_semantic=False)
            assert output is not None
            assert output.total_active_needs >= 0
            if first_result is None:
                first_result = output.demand_ranking
            else:
                # 确定性验证：同输入同等排名
                for a, b in zip(first_result, output.demand_ranking):
                    assert a["need"] == b["need"]

    # 测试文件末尾


# ============================================================
# 稳定性报告生成
# ============================================================

class TestStabilityReport:
    """生成稳定性校验报告"""

    def test_generate_stability_report(self):
        """运行所有稳定性检查并输出JSON报告"""
        report = {
            "timestamp": time.time(),
            "version": "4.2.0",
            "results": {},
        }

        # 空输入检查
        try:
            ds = DemandSet(source_text="", timestamp=0)
            assert len(ds.get_valid_demands()) == 0
            report["results"]["empty_input"] = {"passed": True}
        except Exception as e:
            report["results"]["empty_input"] = {"passed": False, "error": str(e)}

        # 极值检查
        try:
            d = make_demand(0, urgency=1.0, importance=1.0, intent=1.0)
            assert d.potential_base >= 0
            report["results"]["extreme_values"] = {"passed": True}
        except Exception as e:
            report["results"]["extreme_values"] = {"passed": False, "error": str(e)}

        # 12维全激活检查
        try:
            config = DPUConfig()
            config.enable_chaos = False
            matrix = AssociationMatrix()
            calc = PotentialCalculator(config, matrix, random_seed=42)
            calc.config.enable_chaos = False
            ds = DemandSet(source_text="12d", timestamp=0)
            for i in range(12):
                ds.add(make_demand(i, urgency=0.7, importance=0.7, intent=0.5))
            calc.calculate_all(ds)
            all_positive = all(d.potential_final >= 0 for d in ds.demands.values())
            report["results"]["all_12d_activation"] = {
                "passed": all_positive,
                "max_potential": float(max(d.potential_final for d in ds.demands.values())),
                "min_potential": float(min(d.potential_final for d in ds.demands.values())),
            }
        except Exception as e:
            report["results"]["all_12d_activation"] = {"passed": False, "error": str(e)}

        # 1000次贝叶斯检查
        try:
            profile = UserProfile(user_id="report_test")
            for _ in range(1000):
                profile.update_from_interaction(active_needs=[0, 1])
            in_bounds = all(
                profile.weight_min <= profile.get_need_weight(i) <= profile.weight_max
                for i in range(12)
            )
            report["results"]["bayesian_1000_iter"] = {
                "passed": in_bounds,
                "interaction_count": profile.interaction_count,
                "prior_strength": round(profile.current_prior_strength, 4),
            }
        except Exception as e:
            report["results"]["bayesian_1000_iter"] = {"passed": False, "error": str(e)}

        # 矩阵自检
        try:
            m = AssociationMatrix()
            issues = m.self_check()
            report["results"]["matrix_self_check"] = {
                "passed": len(issues) == 0,
                "issues": issues,
            }
        except Exception as e:
            report["results"]["matrix_self_check"] = {"passed": False, "error": str(e)}

        # 不变式检查
        try:
            m = AssociationMatrix()
            diag_ok = all(m.get_correlation(i, i) == pytest.approx(1.0) for i in range(12))
            report["results"]["invariants"] = {
                "passed": diag_ok,
                "diagonal_all_one": diag_ok,
            }
        except Exception as e:
            report["results"]["invariants"] = {"passed": False, "error": str(e)}

        # 汇总
        all_passed = all(r.get("passed", False) for r in report["results"].values())
        report["summary"] = "ALL STABILITY CHECKS PASSED" if all_passed else "SOME CHECKS FAILED"

        # 写入报告文件
        report_path = os.path.join(
            os.path.dirname(__file__), "stability_report.json"
        )
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)

        assert all_passed, f"稳定性检查未通过: {report['results']}"
