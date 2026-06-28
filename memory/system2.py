"""
System2 处理器 - 后台异步记忆整理
职责：
- 异步沉淀 L5 心智模型
- 生成 L6 前瞻意图
- 维护演化链
- 整理和去重记忆

特点：秒到分钟级，后台运行，不阻塞主链路
"""

import time
from typing import Dict, List, Optional, Any, Tuple
from collections import Counter

from .models import MemoryEntry, MemoryLayer, MentalModel, IntentionPrediction, EvolutionChain
from .persistence import MemoryStore


class System2Processor:
    """System2: 后台慢整理 - 异步处理"""

    def __init__(self, store: MemoryStore, llm_client=None):
        self.store = store
        self.llm_client = llm_client

    def process_background(self, user_id: str):
        """
        后台处理入口
        由定时任务或空闲时触发
        """
        # 1. 生成/更新 L5 心智模型
        self._update_mental_models(user_id)

        # 2. 生成 L6 前瞻意图
        self._generate_intentions(user_id)

        # 3. 维护演化链
        self._maintain_evolution_chains(user_id)

        # 4. 记忆去重和合并
        self._deduplicate_memories(user_id)

    def _update_mental_models(self, user_id: str):
        """更新心智模型 (L5) - 从 L2 原子事实中抽取行为模式"""
        # 获取用户的所有原子事实
        facts = self.store.get_entries_by_layer(user_id, MemoryLayer.L2_FACT, limit=100)

        if len(facts) < 5:  # 数据不足时不生成
            return

        # 分析事实内容，识别行为模式
        # 简化版：基于 DPU 需求分布识别决策风格
        identity = self.store.get_identity(user_id)
        if not identity or not identity.demand_profiles:
            return

        # 分析需求强度分布
        intensities = {k: v.get('intensity', 0) for k, v in identity.demand_profiles.items()}
        if not intensities:
            return

        # 识别决策风格
        high_demands = [k for k, v in intensities.items() if v > 0.7]
        low_demands = [k for k, v in intensities.items() if v < 0.3]

        # 生成心智模型描述
        decision_style = self._infer_decision_style(high_demands, low_demands)
        risk_tolerance = self._calculate_risk_tolerance(identity)

        # 创建或更新心智模型
        existing_models = self._get_existing_mental_models(user_id)

        # 决策风格模型
        if decision_style:
            self._create_or_update_model(
                user_id=user_id,
                model_type="decision",
                description=f"用户表现出{decision_style}的决策特征",
                pattern=decision_style,
                underlying_need=self._identify_underlying_need(high_demands),
                typical_response=self._infer_typical_response(decision_style),
                evidence_count=len(facts)
            )

        # 冲突处理模型
        conflict_pattern = self._analyze_conflict_pattern(facts)
        if conflict_pattern:
            self._create_or_update_model(
                user_id=user_id,
                model_type="conflict",
                description=f"面对需求冲突时倾向于{conflict_pattern}",
                pattern=conflict_pattern,
                underlying_need="需求平衡",
                typical_response=conflict_pattern,
                evidence_count=len([f for f in facts if "冲突" in f.content or "纠结" in f.content])
            )

    def _infer_decision_style(self, high_demands: List[int], low_demands: List[int]) -> str:
        """推断决策风格"""
        # 基于马斯洛层级判断
        survival_focus = 0 in high_demands or 1 in high_demands  # 生理、安全
        social_focus = 2 in high_demands or 3 in high_demands    # 社交、情感
        growth_focus = 7 in high_demands or 10 in high_demands   # 自我实现、成长

        if survival_focus and not growth_focus:
            return "谨慎保守型"
        elif growth_focus and not survival_focus:
            return "冒险进取型"
        elif social_focus:
            return "社交导向型"
        else:
            return "平衡型"

    def _calculate_risk_tolerance(self, identity) -> float:
        """计算风险承受度"""
        if not identity.demand_profiles:
            return 0.5

        # 安全需求低 + 成长需求高 = 高风险承受
        safety = identity.demand_profiles.get(1, {}).get('intensity', 0.5)
        growth = identity.demand_profiles.get(7, {}).get('intensity', 0.5)

        # 简单公式：风险承受度 = 0.5 + (成长 - 安全) * 0.5
        tolerance = 0.5 + (growth - safety) * 0.5
        return max(0.0, min(1.0, tolerance))

    def _identify_underlying_need(self, high_demands: List[int]) -> str:
        """识别底层需求"""
        if not high_demands:
            return "未明确"

        # 取最高强度的需求
        demand_names = [
            "生理生存", "安全稳定", "社交归属", "情感陪伴",
            "尊重认可", "认知求知", "审美价值", "自我实现",
            "自由掌控", "公平公正", "成长进阶", "秩序规整"
        ]

        primary = high_demands[0]
        if primary < len(demand_names):
            return demand_names[primary]
        return "未明确"

    def _infer_typical_response(self, decision_style: str) -> str:
        """推断典型反应"""
        responses = {
            "谨慎保守型": "优先考虑安全性和稳定性",
            "冒险进取型": "愿意尝试新事物，追求成长",
            "社交导向型": "重视他人意见和关系和谐",
            "平衡型": "综合考虑各方面因素"
        }
        return responses.get(decision_style, "根据具体情况决定")

    def _analyze_conflict_pattern(self, facts: List[MemoryEntry]) -> Optional[str]:
        """分析冲突处理模式"""
        # 简化版：统计关键词
        conflict_keywords = ["纠结", "矛盾", "两难", "权衡", "取舍", "冲突"]
        count = sum(1 for f in facts if any(kw in f.content for kw in conflict_keywords))

        if count < 3:
            return None

        # 基于数量判断模式
        if count > len(facts) * 0.3:
            return "深度权衡后决策"
        else:
            return "快速决策"

    def _get_existing_mental_models(self, user_id: str) -> List[MentalModel]:
        """获取现有心智模型"""
        # 从存储中查询 L5 层记忆
        entries = self.store.get_entries_by_layer(user_id, MemoryLayer.L5_MENTAL, limit=10)
        models = []
        for entry in entries:
            # 解析 entry.content 恢复 MentalModel
            # 简化版：直接返回空列表，实际实现需要更复杂的序列化
            pass
        return models

    def _create_or_update_model(self, user_id: str, model_type: str,
                                 description: str, pattern: str,
                                 underlying_need: str, typical_response: str,
                                 evidence_count: int):
        """创建或更新心智模型"""
        model = MentalModel(
            user_id=user_id,
            model_type=model_type,
            description=description,
            pattern=pattern,
            underlying_need=underlying_need,
            typical_response=typical_response,
            evidence_count=evidence_count,
            confidence=min(0.9, 0.5 + evidence_count * 0.05)  # 证据越多置信度越高
        )

        # 存储为 L5 记忆
        entry = MemoryEntry(
            layer=MemoryLayer.L5_MENTAL,
            content=f"[{model_type}] {description}\n模式: {pattern}\n典型反应: {typical_response}",
            user_id=user_id,
            tags=["mental_model", model_type]
        )
        self.store.save_entry(entry)

    def _generate_intentions(self, user_id: str):
        """生成前瞻意图 (L6) - 基于历史模式预测未来需求"""
        # 获取最近的需求趋势
        identity = self.store.get_identity(user_id)
        if not identity or not identity.demand_profiles:
            return

        # 分析需求变化趋势
        rising_demands = []
        for demand_id, profile in identity.demand_profiles.items():
            trend = profile.get('trend', 'stable')
            if trend == 'rising':
                rising_demands.append(demand_id)

        if not rising_demands:
            return

        # 为上升的需求生成意图预测
        demand_names = [
            "生理生存", "安全稳定", "社交归属", "情感陪伴",
            "尊重认可", "认知求知", "审美价值", "自我实现",
            "自由掌控", "公平公正", "成长进阶", "秩序规整"
        ]

        for demand_id in rising_demands[:2]:  # 最多预测2个
            if demand_id >= len(demand_names):
                continue

            demand_name = demand_names[demand_id]

            # 生成预测
            prediction = IntentionPrediction(
                user_id=user_id,
                predicted_intention=f"可能需要满足{demand_name}相关需求",
                related_demand_id=demand_id,
                trigger_context=f"{demand_name}需求呈上升趋势",
                confidence=0.6,
                expected_timeframe="short"
            )

            # 存储为 L6 记忆
            entry = MemoryEntry(
                layer=MemoryLayer.L6_INTENTION,
                content=f"预测意图: {prediction.predicted_intention}\n"
                       f"置信度: {prediction.confidence:.0%}\n"
                       f"预期时间: {prediction.expected_timeframe}",
                user_id=user_id,
                dpu_demand_ids=[demand_id],
                tags=["intention_prediction", "rising_trend"]
            )
            self.store.save_entry(entry)

    def _maintain_evolution_chains(self, user_id: str):
        """维护演化链 - 跟踪需求/态度的演变过程"""
        # 获取所有 L2 原子事实
        facts = self.store.get_entries_by_layer(user_id, MemoryLayer.L2_FACT, limit=200)

        # 按需求ID分组
        demand_facts: Dict[int, List[MemoryEntry]] = {}
        for fact in facts:
            for demand_id in fact.dpu_demand_ids:
                if demand_id not in demand_facts:
                    demand_facts[demand_id] = []
                demand_facts[demand_id].append(fact)

        # 为每个需求维护演化链
        for demand_id, entries in demand_facts.items():
            if len(entries) < 2:  # 至少需要2个节点
                continue

            # 检查是否已有演化链
            existing_chain = self.store.get_chain_by_target(user_id, demand_id, "demand")

            # 按时间排序
            entries.sort(key=lambda x: x.timestamp)

            if existing_chain:
                # 更新现有链
                self._update_evolution_chain(existing_chain, entries)
            else:
                # 创建新链
                self._create_evolution_chain(user_id, demand_id, entries)

    def _create_evolution_chain(self, user_id: str, demand_id: int,
                                 entries: List[MemoryEntry]):
        """创建新的演化链"""
        demand_names = [
            "生理生存", "安全稳定", "社交归属", "情感陪伴",
            "尊重认可", "认知求知", "审美价值", "自我实现",
            "自由掌控", "公平公正", "成长进阶", "秩序规整"
        ]

        chain = EvolutionChain(
            chain_type="demand",
            target_id=demand_id,
            target_name=demand_names[demand_id] if demand_id < len(demand_names) else f"需求{demand_id}",
            node_ids=[e.id for e in entries],
            head_id=entries[-1].id,  # 最新
            tail_id=entries[0].id    # 最初
        )

        self.store.save_chain(chain)

        # 更新每个节点的演化链ID
        for entry in entries:
            entry.evolution_chain_id = chain.id
            # 建立前后关系
            idx = entries.index(entry)
            if idx > 0:
                entry.supersedes_id = entries[idx - 1].id
            if idx < len(entries) - 1:
                entry.superseded_by_id = entries[idx + 1].id
            self.store.update_entry(entry)

    def _update_evolution_chain(self, chain: EvolutionChain,
                                 entries: List[MemoryEntry]):
        """更新现有演化链"""
        # 获取链上已有节点ID
        existing_ids = set(chain.node_ids)

        # 找出新节点
        new_entries = [e for e in entries if e.id not in existing_ids]

        if not new_entries:
            return

        # 添加新节点
        chain.node_ids.extend([e.id for e in new_entries])
        chain.head_id = entries[-1].id  # 更新链头为最新
        chain.updated_at = time.time()

        self.store.update_chain(chain)

        # 更新新节点的演化链信息
        for entry in new_entries:
            entry.evolution_chain_id = chain.id
            # 找到前一个节点
            idx = entries.index(entry)
            if idx > 0:
                entry.supersedes_id = entries[idx - 1].id
                # 更新前一个节点的 superseded_by_id
                prev_entry = entries[idx - 1]
                prev_entry.superseded_by_id = entry.id
                self.store.update_entry(prev_entry)
            self.store.update_entry(entry)

    def _deduplicate_memories(self, user_id: str):
        """记忆去重 - 合并相似的原子事实"""
        # 获取所有 L2 原子事实
        facts = self.store.get_entries_by_layer(user_id, MemoryLayer.L2_FACT, limit=500)

        if len(facts) < 10:  # 数据不足时不处理
            return

        # 简单的去重策略：基于内容相似度
        # 简化版：检查完全相同的 content
        content_map: Dict[str, List[MemoryEntry]] = {}

        for fact in facts:
            # 标准化内容（去除空格，转小写）
            normalized = fact.content.lower().replace(" ", "").replace("，", ",").replace("。", ".")
            if normalized not in content_map:
                content_map[normalized] = []
            content_map[normalized].append(fact)

        # 合并重复项
        for normalized, entries in content_map.items():
            if len(entries) > 1:
                # 保留最新的一条，其他标记为被替代
                entries.sort(key=lambda x: x.timestamp, reverse=True)
                keeper = entries[0]

                for old_entry in entries[1:]:
                    old_entry.superseded_by_id = keeper.id
                    old_entry.tags.append("deduplicated")
                    self.store.update_entry(old_entry)

                # 更新 keeper 的访问计数
                keeper.access_count += len(entries) - 1
                self.store.update_entry(keeper)

    # ========== 公共 API ==========

    def get_mental_models(self, user_id: str, model_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """获取用户的心智模型"""
        entries = self.store.get_entries_by_layer(user_id, MemoryLayer.L5_MENTAL, limit=20)

        models = []
        for entry in entries:
            # 解析 entry.content
            lines = entry.content.split('\n')
            model_info = {
                'id': entry.id,
                'type': entry.tags[1] if len(entry.tags) > 1 else 'unknown',
                'description': lines[0] if lines else '',
                'content': entry.content,
                'timestamp': entry.timestamp,
                'confidence': 0.7  # 简化版
            }

            if model_type is None or model_info['type'] == model_type:
                models.append(model_info)

        return models

    def get_intention_predictions(self, user_id: str) -> List[Dict[str, Any]]:
        """获取意图预测"""
        entries = self.store.get_entries_by_layer(user_id, MemoryLayer.L6_INTENTION, limit=10)

        predictions = []
        for entry in entries:
            lines = entry.content.split('\n')
            pred_info = {
                'id': entry.id,
                'predicted_intention': lines[0].replace("预测意图: ", "") if lines else '',
                'related_demand_id': entry.dpu_demand_ids[0] if entry.dpu_demand_ids else None,
                'content': entry.content,
                'timestamp': entry.timestamp
            }
            predictions.append(pred_info)

        return predictions
