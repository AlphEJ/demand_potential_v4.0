"""
层级压制机制 (LayerSuppression) 单元测试
覆盖压制的触发条件、系数计算和应用逻辑
"""
import pytest
from core.demands import Demand, DemandSet, MaslowLayer
from core.config import DPUConfig
from core.suppression import LayerSuppression


# ============================================================
# Fixtures
# ============================================================

@pytest.fixture
def config():
    """默认配置（suppression_trigger=0.7, suppression_base=0.6）"""
    return DPUConfig()


@pytest.fixture
def suppressor(config):
    return LayerSuppression(config)


def make_demand(
    need_id: int = 0,
    intent: float = 0.5,
    potential_couple: float = 1.0,
    potential_final: float = 1.0,
) -> Demand:
    """快速构造需求（含势能预设值）"""
    d = Demand(id=need_id, intent=intent)
    # 如果 intent < 0.3，is_valid 为 False，但 demand 仍然存在
    d.potential_couple = potential_couple
    d.potential_final = potential_final
    return d


def make_demand_set(*demands: Demand) -> DemandSet:
    ds = DemandSet(source_text="压测", timestamp=0.0)
    for d in demands:
        ds.add(d)
    return ds


# ============================================================
# 层平均激活度计算
# ============================================================

class TestLayerAverage:
    """calculate_layer_avg"""

    def test_single_demand_avg_equals_its_intent(self, suppressor):
        """单需求层 → 平均激活度 = 该需求的 intent_gate"""
        d = make_demand(0, intent=0.8)  # D0 生理层
        ds = make_demand_set(d)
        avgs = suppressor.calculate_layer_avg(ds)
        assert avgs["生理层"] == pytest.approx(0.8)

    def test_multiple_demands_same_layer_avg(self, suppressor):
        """同层多个需求 → 算术平均"""
        d1 = make_demand(0, intent=0.8)    # D0 生理
        # D0 只有一个 — 生理层没有其他 demand
        # 使用两个同在社交层的需求
        d2 = make_demand(2, intent=0.4)    # D3 社交归属
        d3 = make_demand(3, intent=0.8)    # D4 情感陪伴
        ds = make_demand_set(d2, d3)
        avgs = suppressor.calculate_layer_avg(ds)
        # 社交归属层 avg = (0.4 + 0.8) / 2 = 0.6
        assert avgs["社交归属层"] == pytest.approx(0.6)

    def test_invalid_demands_excluded(self, suppressor):
        """intent < 0.3 的无效需求不参与平均"""
        d_valid = make_demand(0, intent=0.8)
        d_invalid = make_demand(1, intent=0.2)  # is_valid=False, intent=0.2
        ds = make_demand_set(d_valid, d_invalid)
        avgs = suppressor.calculate_layer_avg(ds)

        # 生理层只有 d_valid, avg = 0.8
        assert avgs["生理层"] == pytest.approx(0.8)
        # 安全层 d_invalid 无效 → avg = 0.0
        assert avgs["安全层"] == 0.0

    def test_empty_layer_avg_zero(self, suppressor):
        """空需求集 → 返回空字典（无需求即无层级统计）"""
        avgs = suppressor.calculate_layer_avg(make_demand_set())
        assert len(avgs) == 0

    def test_all_five_layers_present(self, suppressor):
        """返回所有 5 层的值"""
        # 每层放入一个需求
        ds = make_demand_set(
            make_demand(0, intent=0.5),   # 生理
            make_demand(1, intent=0.6),   # 安全
            make_demand(2, intent=0.7),   # 社交
            make_demand(4, intent=0.8),   # 尊重
            make_demand(7, intent=0.9),   # 自我实现
        )
        avgs = suppressor.calculate_layer_avg(ds)
        assert len(avgs) == 5
        assert avgs["生理层"] == pytest.approx(0.5)
        assert avgs["自我实现层"] == pytest.approx(0.9)


# ============================================================
# 压制上限计算
# ============================================================

class TestSuppressionCaps:
    """calculate_suppression_caps"""

    def test_no_suppression_when_below_threshold(self, suppressor):
        """所有层平均激活度 < 0.7 → 所有层的 cap = 1.0（不压制）"""
        avgs = {
            "生理层": 0.3,
            "安全层": 0.2,
            "社交归属层": 0.1,
            "尊重层": 0.0,
            "自我实现层": 0.0,
        }
        caps = suppressor.calculate_suppression_caps(avgs)
        for cap in caps.values():
            assert cap == 1.0

    def test_single_layer_triggers_suppression(self, suppressor):
        """L0 生理层 avg > 0.7 → 以上各层被压制"""
        avgs = {
            "生理层": 0.9,   # > 0.7 → 触发压制
            "安全层": 0.3,
            "社交归属层": 0.2,
            "尊重层": 0.1,
            "自我实现层": 0.1,
        }
        caps = suppressor.calculate_suppression_caps(avgs)

        # 生理层自己不受压制
        assert caps["生理层"] == 1.0
        # 安全层: n=1 → 0.6^1 = 0.6
        assert caps["安全层"] == pytest.approx(0.6)
        # 社交层: n=2 → 0.6^2 = 0.36
        assert caps["社交归属层"] == pytest.approx(0.36)
        # 尊重层: n=3 → 0.6^3 = 0.216
        assert caps["尊重层"] == pytest.approx(0.216)
        # 自我实现层: n=4 → 0.6^4 = 0.1296
        assert caps["自我实现层"] == pytest.approx(0.1296)

    def test_exactly_at_threshold_no_trigger(self, suppressor):
        """avg == 0.7 不触发压制（严格大于才触发）"""
        avgs = {
            "生理层": 0.7,
            "安全层": 0.1,
            "社交归属层": 0.0,
            "尊重层": 0.0,
            "自我实现层": 0.0,
        }
        caps = suppressor.calculate_suppression_caps(avgs)
        assert caps["安全层"] == 1.0  # 未被压制

    def test_just_above_threshold_triggers(self, suppressor):
        """avg == 0.71 触发压制"""
        avgs = {
            "生理层": 0.71,
            "安全层": 0.1,
            "社交归属层": 0.0,
            "尊重层": 0.0,
            "自我实现层": 0.0,
        }
        caps = suppressor.calculate_suppression_caps(avgs)
        assert caps["安全层"] == pytest.approx(0.6)

    def test_multiple_triggers_strictest_wins(self, suppressor):
        """多层触发 → 取最严格的 cap（min 值）"""
        avgs = {
            "生理层": 0.9,   # 触发 → 压制上层
            "安全层": 0.8,   # 也触发 → 压制更上层
            "社交归属层": 0.3,
            "尊重层": 0.1,
            "自我实现层": 0.1,
        }
        caps = suppressor.calculate_suppression_caps(avgs)

        # 社交归属层：
        # 从 L0: n=2 → 0.6^2 = 0.36
        # 从 L1: n=1 → 0.6^1 = 0.60
        # 取 min → 0.36
        assert caps["社交归属层"] == pytest.approx(0.36)

    def test_top_layer_not_triggering(self, suppressor):
        """自我实现层触发 → 不影响任何层（没有更上层）"""
        avgs = {
            "生理层": 0.3,
            "安全层": 0.3,
            "社交归属层": 0.3,
            "尊重层": 0.3,
            "自我实现层": 0.9,  # 触发但无上层可压制
        }
        caps = suppressor.calculate_suppression_caps(avgs)
        for cap in caps.values():
            assert cap == 1.0


# ============================================================
# 应用压制
# ============================================================

class TestApplySuppression:
    """apply_suppression"""

    def test_no_suppression_when_below_threshold(self, suppressor):
        """低激活度 → 所有需求势能不变，suppressed=False"""
        d0 = make_demand(0, intent=0.5, potential_final=0.8)
        d1 = make_demand(1, intent=0.5, potential_final=0.7)
        ds = make_demand_set(d0, d1)
        suppressor.apply_suppression(ds)

        assert d0.potential_final == 0.8
        assert d0.suppressed is False
        assert d1.potential_final == 0.7
        assert d1.suppressed is False

    def test_suppression_reduces_higher_layer_potentials(self, suppressor):
        """底层激活度高 → 高层需求势能被削"""
        d_low = make_demand(0, intent=0.9, potential_final=0.8)    # 生理
        d_high = make_demand(7, intent=0.5, potential_final=0.5)   # 自我实现
        ds = make_demand_set(d_low, d_high)
        suppressor.apply_suppression(ds)

        # 生理层: cap=1.0, 不变
        assert d_low.potential_final == 0.8
        assert d_low.suppressed is False

        # 自我实现层: n=4 → cap=0.6^4=0.1296
        expected = round(0.5 * 0.1296, 4)
        assert d_high.potential_final == pytest.approx(expected)
        assert d_high.suppressed is True

    def test_suppression_marks_suppressed_flag(self, suppressor):
        """被压制的需求 marked as suppressed=True"""
        d_low = make_demand(0, intent=0.85, potential_final=1.0)
        d_mid = make_demand(4, intent=0.5, potential_final=0.6)
        ds = make_demand_set(d_low, d_mid)
        suppressor.apply_suppression(ds)

        assert d_low.suppressed is False
        assert d_mid.suppressed is True

    def test_invalid_demands_not_processed(self, suppressor):
        """无效需求 (intent < 0.3) 跳过"""
        d_low = make_demand(0, intent=0.85, potential_final=1.0)
        d_invalid = make_demand(7, intent=0.2, potential_final=0.5)
        ds = make_demand_set(d_low, d_invalid)
        suppressor.apply_suppression(ds)

        # 无效需求 ignored in suppression loop
        assert d_invalid.suppressed is False
        assert d_invalid.potential_final == 0.5  # unchanged

    def test_mid_layer_trigger(self, suppressor):
        """中层触发 → 只压制更高层"""
        d_social = make_demand(2, intent=0.85, potential_final=0.5)  # L2 社交
        d_esteem = make_demand(4, intent=0.5, potential_final=0.5)    # L3 尊重
        d_self = make_demand(7, intent=0.5, potential_final=0.5)      # L4 自我实现
        ds = make_demand_set(d_social, d_esteem, d_self)
        suppressor.apply_suppression(ds)

        # D3 (L2) 不压制自己也不压制更低层（没有）
        assert d_social.suppressed is False

        # D5 (L3) 从 L2 压制: n=1 → cap=0.6
        assert d_esteem.suppressed is True
        assert d_esteem.potential_final == pytest.approx(round(0.5 * 0.6, 4))

        # D8 (L4) 从 L2 压制: n=2 → cap=0.36
        assert d_self.suppressed is True
        assert d_self.potential_final == pytest.approx(round(0.5 * 0.36, 4))


# ============================================================
# 压制报告
# ============================================================

class TestSuppressionReport:
    """get_suppression_report"""

    def test_report_structure(self, suppressor):
        """报告包含 layer_averages, layer_caps, suppressed_needs"""
        d0 = make_demand(0, intent=0.85, potential_final=0.8)
        d7 = make_demand(7, intent=0.5, potential_final=0.5)
        ds = make_demand_set(d0, d7)
        suppressor.apply_suppression(ds)
        report = suppressor.get_suppression_report(ds)

        assert "layer_averages" in report
        assert "layer_caps" in report
        assert "suppressed_needs" in report
        assert isinstance(report["layer_averages"], dict)
        assert isinstance(report["layer_caps"], dict)
        assert isinstance(report["suppressed_needs"], list)

    def test_suppressed_needs_detail(self, suppressor):
        """被压制需求详情包含名称、层级、原始值和压制值"""
        d0 = make_demand(0, intent=0.85, potential_final=0.8)
        d7 = make_demand(7, intent=0.5, potential_couple=0.5, potential_final=0.5)
        ds = make_demand_set(d0, d7)
        suppressor.apply_suppression(ds)
        report = suppressor.get_suppression_report(ds)

        suppressed = report["suppressed_needs"]
        assert len(suppressed) == 1
        assert suppressed[0]["need"] == "自我实现"
        assert suppressed[0]["layer"] == "自我实现层"
        assert "original_potential" in suppressed[0]
        assert "capped_potential" in suppressed[0]

    def test_empty_demand_set_report(self, suppressor):
        """空需求集的压制报告"""
        report = suppressor.get_suppression_report(make_demand_set())
        assert len(report["suppressed_needs"]) == 0


# ============================================================
# 配置敏感性
# ============================================================

class TestConfigSensitivity:
    """不同配置参数下的行为"""

    def test_custom_suppression_base(self):
        """自定义压制基数"""
        cfg = DPUConfig(suppression_trigger=0.5, suppression_base=0.5)
        sup = LayerSuppression(cfg)

        avgs = {"生理层": 0.6, "安全层": 0.0, "社交归属层": 0.0, "尊重层": 0.0, "自我实现层": 0.0}
        caps = sup.calculate_suppression_caps(avgs)

        # 0.5^1 = 0.5
        assert caps["安全层"] == pytest.approx(0.5)
        # 0.5^2 = 0.25
        assert caps["社交归属层"] == pytest.approx(0.25)
        # 0.5^3 = 0.125
        assert caps["尊重层"] == pytest.approx(0.125)
        # 0.5^4 = 0.0625
        assert caps["自我实现层"] == pytest.approx(0.0625)

    def test_custom_trigger_threshold(self):
        """自定义触发阈值"""
        cfg = DPUConfig(suppression_trigger=0.3)
        sup = LayerSuppression(cfg)

        # avg=0.4 在默认配置不会触发（0.7），但这里阈值降到 0.3
        avgs = {"生理层": 0.4, "安全层": 0.2, "社交归属层": 0.0, "尊重层": 0.0, "自我实现层": 0.0}
        caps = sup.calculate_suppression_caps(avgs)

        assert caps["安全层"] == pytest.approx(0.6)  # 触发了


# ============================================================
# 数学性质验证
# ============================================================

class TestMathProperties:
    """验证压制机制的数学性质"""

    def test_higher_layers_suppressed_more(self, suppressor):
        """越高的层被压制越厉害（cap 递减）"""
        avgs = {"生理层": 0.9, "安全层": 0.1, "社交归属层": 0.1, "尊重层": 0.1, "自我实现层": 0.1}
        caps = suppressor.calculate_suppression_caps(avgs)

        values = [caps["安全层"], caps["社交归属层"], caps["尊重层"], caps["自我实现层"]]
        # 严格递减
        for i in range(len(values) - 1):
            assert values[i] > values[i + 1]

    def test_suppression_never_increases_potential(self, suppressor):
        """压制只会降低势能，不会提升"""
        d_low = make_demand(0, intent=0.85, potential_final=0.5)
        d_high = make_demand(7, intent=0.5, potential_final=0.3)
        ds = make_demand_set(d_low, d_high)

        original = {did: d.potential_final for did, d in ds.demands.items()}
        suppressor.apply_suppression(ds)

        for did, d in ds.demands.items():
            assert d.potential_final <= original[did]

    def test_potential_never_negative_after_suppression(self, suppressor):
        """无论压制多强，势能不会变负"""
        d_low = make_demand(0, intent=0.99, potential_final=0.01)
        d_high = make_demand(7, intent=0.5, potential_final=0.01)
        ds = make_demand_set(d_low, d_high)
        suppressor.apply_suppression(ds)
        assert d_high.potential_final >= 0.0
