"""
需求势能 v4.0 - 主引擎
DPU (Demand Processing Unit) 核心入口
支持动态用户画像（贝叶斯权重更新）
"""

import time
import logging
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field, asdict

from .demands import Demand, DemandSet, NeedMeta
from .demands import parse_demands_by_keywords, parse_demands_by_embedding
from .matrix import AssociationMatrix
from .config import DPUConfig, default_config
from .potential import PotentialCalculator
from .suppression import LayerSuppression
from .conflict import ConflictArbiter
from .profile import UserProfile, get_user_profile
from .path_tracer import PathTracer, ReasoningPath
from llm_client.factory import LLMFactory

logger = logging.getLogger("dpu_engine")


@dataclass
class DPUOutput:
    """DPU 输出结构"""
    source_text: str = ""
    demand_ranking: List[Dict] = field(default_factory=list)
    suppressed: List[str] = field(default_factory=list)
    conflicts: List[Dict] = field(default_factory=list)
    action_order: List[str] = field(default_factory=list)
    suppression_report: Dict = field(default_factory=dict)
    total_active_needs: int = 0
    timestamp: float = 0.0
    # v4.0 新增：用户画像更新报告
    profile_update: Dict = field(default_factory=dict)
    # v4.0 新增：语义理解结果
    semantic_understanding: Dict = field(default_factory=dict)
    
    def to_prompt_context(self) -> str:
        """转换为可注入 LLM Prompt 的文本"""
        lines = [
            "【需求势能分析结果】",
            f"用户输入：{self.source_text}",
            f"活跃需求数量：{self.total_active_needs}",
            "",
            "需求优先级排序："
        ]
        for item in self.demand_ranking:
            lines.append(f"  {item['rank']}. {item['need']} - 势能: {item['potential']} | 层级: {item['layer']} | 原因: {item['reason']}")
        
        if self.suppressed:
            lines.append("")
            lines.append(f"被层级压制的需求：{', '.join(self.suppressed)}")
        
        if self.conflicts:
            lines.append("")
            lines.append("需求冲突：")
            for c in self.conflicts:
                if c["type"] == "strong":
                    lines.append(f"  ⚡ {c['need_a']} vs {c['need_b']} → {c['winner']} 优先，{c['action']}")
        
        return "\n".join(lines)
    
    def to_dict(self) -> Dict:
        return asdict(self)


class DemandPotentialEngine:
    """
    需求势能引擎（DPU）- 主入口

    完整处理流水线：
    用户输入 → LLM需求解析/规则匹配 → 势能计算 → 层级压制 → 冲突仲裁 → 优先级排序 → 输出
    """

    def __init__(self, config: DPUConfig = None, llm_provider: str = "ollama", llm_config: Dict = None, user_id: str = "default", embedding_config: "EmbeddingConfig" = None):
        self.config = config or default_config
        self.user_id = user_id
        self.user_profile = get_user_profile(user_id)
        self.matrix = AssociationMatrix()
        self.calculator = PotentialCalculator(
            self.config, self.matrix,
            attention_alpha=0.5,  # v4.2 注意力加权矩阵（0=关闭）
        )
        self.suppressor = LayerSuppression(self.config)
        self.arbiter = ConflictArbiter(self.config, self.matrix)
        self._llm_client = None
        self._llm_provider = llm_provider
        self._llm_config = llm_config or {}
        self._init_llm_client()

        # v4.1 新增：路径追踪器（"那根线"）
        self.path_tracer = PathTracer(self.matrix)

        # v4.2 新增：向量语义匹配器（可选）
        self._embedding_matcher = None
        if embedding_config and embedding_config.provider != "none":
            try:
                from .embedding_matcher import DemandEmbeddingMatcher
                self._embedding_matcher = DemandEmbeddingMatcher(embedding_config)
                # 延迟构建基准向量（首次使用时）
            except ImportError:
                pass

    def _init_llm_client(self):
        """初始化LLM客户端"""
        try:
            # 传递配置参数（包括api_key）创建客户端
            self._llm_client = LLMFactory.create_client(self._llm_provider, **self._llm_config)
        except Exception:
            self._llm_client = None

    def set_llm_provider(self, provider: str, **config):
        """动态切换LLM提供商"""
        self._llm_provider = provider
        self._llm_config = config
        self._init_llm_client()
    
    def process(self, user_input: str, parsed_demands: Optional[DemandSet] = None, use_semantic: bool = False, use_direct_llm: bool = False) -> DPUOutput:
        """
        完整处理流水线（主入口）

        Args:
            user_input: 用户自然语言输入
            parsed_demands: 已解析的需求集合（可选）
            use_semantic: 是否使用LLM语义理解层
            use_direct_llm: 【v4.2新增】是否直接用LLM做需求解析
                            设为True时，LLM直接根据12维需求定义判断激活值
                            跳过信号词提取→关键词匹配的中间步骤

        Returns:
            DPUOutput 结构化输出
        """
        self._llm_signals = []
        self._llm_context = None
        # v4.2: LLM 直出模式下，动态降低层级固定权重，
        # 让 LLM 的 urgency/importance 判断主导势能计算
        # 否则 D0 即使被 LLM 判定为"只是场景"也会因固定加成排到前面
        _llm_mode_adjusted = False
        if use_direct_llm and self._llm_client:
            self.config.w1_level = 0.12
            self.config.w2_composite = 0.42
            self.config.w4_intent = 0.26
            # w3_resource 不变 (0.20)，总和保持 1.0
            _llm_mode_adjusted = True

        if parsed_demands is None:
            # ============================================================
            # 路径A：use_direct_llm=True —— LLM 直接用12维框架解析
            # LLM 获得完整的12维需求定义 + 描述，直接输出激活判断
            # 这是 LLM+DPU 真正的联动方式：LLM做语义理解，DPU做数学计算
            # ============================================================
            if use_direct_llm and self._llm_client:
                demand_set = self._parse_demands_llm(user_input)
                # 同时提取信号词（给前端展示用）
                try:
                    signal_result = self._llm_client.extract_demand_signals(user_input)
                    self._llm_signals = signal_result.get("extracted_signals", [])
                    self._llm_context = signal_result.get("context")
                except Exception:
                    pass
                # LLM 解析失败 → 降级
                if not demand_set.get_valid_demands():
                    demand_set = parse_demands_by_keywords(user_input)
            elif self._llm_client:
                # ============================================================
                # 路径B：传统三段式 —— LLM提取信号 → 向量/关键词匹配
                # LLM 只做语义翻译，不做需求判断
                # ============================================================
                signal_result = self._llm_client.extract_demand_signals(user_input)
                signals = signal_result.get("extracted_signals", [])
                self._llm_signals = signals
                self._llm_context = signal_result.get("context")

                if self._embedding_matcher is not None and self.config.use_embedding:
                    signal_texts = [s.get("text", "") for s in signals if s.get("text")]
                    if signal_texts:
                        demand_set = parse_demands_by_embedding(
                            user_input=user_input,
                            signal_texts=signal_texts,
                            matcher=self._embedding_matcher,
                            similarity_threshold=self.config.embedding_similarity_threshold,
                        )
                    else:
                        demand_set = DemandSet(source_text=user_input, timestamp=time.time())
                    if not demand_set.get_valid_demands():
                        if self.config.embedding_fallback_to_keywords:
                            signal_text_str = " ".join(s.get("text", "") for s in signals)
                            if signal_text_str.strip():
                                demand_set = parse_demands_by_keywords(signal_text_str)
                    if not demand_set.get_valid_demands():
                        demand_set = self._parse_demands_llm(user_input)
                else:
                    signal_text = " ".join(s.get("text", "") for s in signals)
                    if signal_text.strip():
                        demand_set = parse_demands_by_keywords(signal_text)
                        if not demand_set.get_valid_demands():
                            demand_set = self._parse_demands_llm(user_input)
                    else:
                        demand_set = parse_demands_by_keywords(user_input)
            else:
                # ============================================================
                # 路径C：纯关键词（无LLM可用）
                # ============================================================
                demand_set = parse_demands_by_keywords(user_input)
        else:
            demand_set = parsed_demands
            demand_set.source_text = user_input
        
        # 2. 势能计算（使用个性化权重）
        demand_set = self.calculator.calculate_all(demand_set, profile=self.user_profile)
        
        # 3. 层级压制
        # LLM直出模式 → 仅生存层(D0/D1)可触发压制（生存无忧时社交不压制尊重）
        demand_set = self.suppressor.apply_suppression(demand_set, survival_only=use_direct_llm)

        # v4.2 LLM直出 → 上层需求主动增益
        if use_direct_llm and _llm_mode_adjusted:
            d0, d1 = demand_set.get(0), demand_set.get(1)
            base_intent = (d0.intent_gate if d0 else 0) + (d1.intent_gate if d1 else 0)
            if base_intent < 0.45:
                for d in demand_set.demands.values():
                    if d.is_valid and d.layer.value >= 2:
                        d.potential_final = round(min(1.0, d.potential_final * 1.12), 4)
                for did in [0, 1]:
                    d = demand_set.get(did)
                    if d and d.is_valid and d.intent < 0.4:
                        d.potential_final = round(d.potential_final * 0.85, 4)

        # 4. 冲突仲裁 + 排序
        # v4.2: LLM直出模式 → 势能优先（LLM已考虑语境）
        #       传统管道 → 层级优先（遵循马斯洛结构）
        layer_priority = not use_direct_llm
        action_order = self.arbiter.generate_action_order(demand_set, layer_priority=layer_priority)
        conflicts = self.arbiter.get_conflicts(demand_set)
        
        # 5. 更新用户画像（v4.0 核心）
        active_need_ids = [d.id for d in demand_set.get_valid_demands()]
        top_need_id = action_order[0]["need_id"] if action_order else None
        profile_update = self.user_profile.update_from_interaction(
            active_needs=active_need_ids,
            user_choice=top_need_id,
            source_text=user_input,
        )
        
        # 6. 构建输出
        output = DPUOutput(
            source_text=user_input,
            demand_ranking=action_order,
            suppressed=[d.name for d in demand_set.get_suppressed()],
            conflicts=conflicts,
            action_order=[item["need"] + "：" + item["reason"] for item in action_order if item.get("reason")],
            suppression_report=self.suppressor.get_suppression_report(demand_set),
            total_active_needs=len(demand_set.get_valid_demands()),
            timestamp=time.time(),
            profile_update=profile_update,
            semantic_understanding={},
        )
        
        return output
    
    def trace_path(self, output: DPUOutput) -> ReasoningPath:
        """
        追踪推理路径（"那根线"）
        
        把 DPU 的打分结果变成可见的传导路径
        
        Args:
            output: DPU 分析结果
            
        Returns:
            ReasoningPath 对象，包含完整的节点和边
        """
        return self.path_tracer.trace(
            demand_ranking=output.demand_ranking,
            source_text=output.source_text
        )
    
    def mark_path_wrong(self, from_id: int, to_id: int) -> bool:
        """用户标记'这条路径不对' → 降低该边权重 20%"""
        return self.path_tracer.mark_path_wrong(from_id, to_id)
    
    def mark_path_right(self, from_id: int, to_id: int) -> bool:
        """用户标记'这条路径对' → 提升该边权重 10%"""
        return self.path_tracer.mark_path_right(from_id, to_id)
    
    def reset_path_modifications(self):
        """重置所有路径修改"""
        self.path_tracer.reset_modifications()
    

    def _parse_demands_llm(self, user_input: str) -> DemandSet:
        """
        LLM语义需求解析 - 统一使用大模型理解
        不再使用关键词匹配，完全依赖LLM的语义理解能力
        """
        demand_set = DemandSet(source_text=user_input, timestamp=time.time())

        if not self._llm_client:
            # 没有LLM客户端时返回空需求集
            logger.warning("未配置大模型API，关键词匹配也无结果，返回空需求集")
            return demand_set

        try:
            # 使用大模型分析需求
            result = self._llm_client.analyze_demand(user_input)

            if "error" in result:
                logger.warning(f"LLM分析失败: {result.get('error', '未知错误')}")
                return demand_set

            # 解析LLM返回的需求
            for need_data in result.get("needs", []):
                need_id = need_data.get("id")
                if need_id is None or not (0 <= need_id <= 11):
                    continue

                demand = Demand(
                    id=need_id,
                    urgency=min(1.0, max(0.0, need_data.get("urgency", 0.5))),
                    importance=min(1.0, max(0.0, need_data.get("importance", 0.5))),
                    resource_dep=min(1.0, max(0.0, need_data.get("resource_dep", 0.3))),
                    intent=min(1.0, max(0.0, need_data.get("intent", 0.5))),
                    reason=need_data.get("reason", ""),
                )
                demand_set.add(demand)

        except Exception as e:
            logger.warning(f"LLM解析异常: {str(e)}")

        return demand_set

    def _parse_from_semantic_result(self, user_input: str, semantic_result: Dict) -> DemandSet:
        """
        v4.0: 从语义理解结果构建需求集合
        这个方法能更好地处理需求转化（如生理→尊重）
        """
        demand_set = DemandSet(source_text=user_input, timestamp=time.time())
        
        active_needs = semantic_result.get("active_needs", [])
        need_transitions = semantic_result.get("need_transitions", [])
        
        # 构建转化映射（用于识别被压制的需求）
        transition_map = {}
        for trans in need_transitions:
            from_id = trans.get("from_id")
            to_id = trans.get("to_id")
            if from_id is not None and to_id is not None:
                transition_map[from_id] = {
                    "to_id": to_id,
                    "trigger": trans.get("trigger", ""),
                    "explanation": trans.get("explanation", "")
                }
        
        for need_data in active_needs:
            need_id = need_data.get("id")
            if need_id is None or not (0 <= need_id <= 11):
                continue
            
            # 检查这个需求是否被转化（压制）
            is_suppressed = need_id in transition_map
            
            # 构建原因说明
            reason = need_data.get("reason", "")
            if is_suppressed:
                trans_info = transition_map[need_id]
                reason = f"[被压制] {reason} → 转化为{NeedMeta.get_name(trans_info['to_id'])}"
            
            demand = Demand(
                id=need_id,
                urgency=min(1.0, max(0.0, need_data.get("urgency", 0.5))),
                importance=min(1.0, max(0.0, need_data.get("importance", 0.5))),
                resource_dep=min(1.0, max(0.0, need_data.get("resource_dep", 0.3))),
                intent=min(1.0, max(0.0, need_data.get("intent", 0.5))),
                reason=reason,
            )
            
            # 如果是深层需求（is_deep=true），提升其重要性
            if need_data.get("is_deep", False):
                demand.importance = min(1.0, demand.importance * 1.2)
                demand.intent = min(1.0, demand.intent * 1.1)
            
            demand_set.add(demand)
        
        return demand_set

    def quick_analyze(self, user_input: str) -> Dict[str, Any]:
        """
        快速分析接口（简化版输出）
        """
        output = self.process(user_input)
        return {
            "输入": output.source_text,
            "活跃需求数": output.total_active_needs,
            "优先级排序": [f"{item['rank']}. {item['need']}({item['potential']})" for item in output.demand_ranking[:5]],
            "被压制": output.suppressed,
            "冲突": [(c['need_a'], c['need_b'], c['action']) for c in output.conflicts[:3]],
        }
