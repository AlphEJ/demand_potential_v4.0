"""
System1 处理器 - 前台实时记忆处理
职责：
- 实时写入 L1 原始痕迹
- 抽取 L2 原子事实
- 更新 L3 身份画像
- 生成 L4 会话摘要

特点：毫秒级响应，不阻塞对话主链路
"""

import time
from typing import Dict, List, Optional, Any
from datetime import datetime

from .models import MemoryEntry, MemoryLayer, UserIdentity
from .persistence import MemoryStore


class System1Processor:
    """System1: 在线快路径 - 实时处理"""
    
    def __init__(self, store: MemoryStore, llm_client=None):
        self.store = store
        self.llm_client = llm_client
    
    def process_message(self, 
                       user_input: str,
                       assistant_response: str,
                       dpu_output: Optional[Dict] = None,
                       session_id: str = "",
                       user_id: str = "default") -> Dict[str, Any]:
        """
        处理单条对话消息 - System1 核心入口
        
        Args:
            user_input: 用户输入
            assistant_response: AI回复
            dpu_output: DPU分析结果
            session_id: 会话ID
            user_id: 用户ID
            
        Returns:
            处理结果，包含写入的记忆ID
        """
        result = {
            'l1_raw_id': None,
            'l2_facts': [],
            'l3_updated': False,
            'l4_summary_id': None,
        }
        
        timestamp = time.time()
        message_id = f"msg_{int(timestamp * 1000)}"
        
        # 1. L1: 写入原始对话痕迹
        raw_content = f"用户: {user_input}\nAI: {assistant_response}"
        l1_entry = self._write_l1_raw(
            content=raw_content,
            session_id=session_id,
            user_id=user_id,
            message_id=message_id,
            dpu_output=dpu_output,
            timestamp=timestamp
        )
        result['l1_raw_id'] = l1_entry.id
        
        # 2. L2: 抽取原子事实
        facts = self._extract_facts(user_input, dpu_output)
        for fact in facts:
            l2_entry = self._write_l2_fact(
                content=fact,
                session_id=session_id,
                user_id=user_id,
                source_message_id=message_id,
                dpu_output=dpu_output,
                timestamp=timestamp
            )
            result['l2_facts'].append(l2_entry.id)
        
        # 3. L3: 更新身份画像
        if dpu_output:
            self._update_l3_identity(user_id, dpu_output, timestamp)
            result['l3_updated'] = True
        
        # 4. L4: 更新会话摘要
        l4_entry = self._update_l4_summary(
            session_id=session_id,
            user_id=user_id,
            new_message=raw_content,
            dpu_output=dpu_output,
            timestamp=timestamp
        )
        if l4_entry:
            result['l4_summary_id'] = l4_entry.id
        
        return result
    
    def _write_l1_raw(self,
                     content: str,
                     session_id: str,
                     user_id: str,
                     message_id: str,
                     dpu_output: Optional[Dict],
                     timestamp: float) -> MemoryEntry:
        """写入 L1 原始痕迹"""
        entry = MemoryEntry(
            layer=MemoryLayer.L1_RAW,
            content=content,
            session_id=session_id,
            user_id=user_id,
            source_message_id=message_id,
            timestamp=timestamp
        )
        
        # 关联 DPU 数据
        if dpu_output:
            entry.dpu_demand_ids = [item['need_id'] for item in dpu_output.get('demand_ranking', [])[:5]]
            entry.dpu_potentials = {item['need_id']: item['potential'] 
                                   for item in dpu_output.get('demand_ranking', [])[:5]}
            if entry.dpu_demand_ids:
                entry.dpu_top_demand = entry.dpu_demand_ids[0]
        
        self.store.save_entry(entry)
        return entry
    
    def _extract_facts(self, user_input: str, dpu_output: Optional[Dict]) -> List[str]:
        """
        从用户输入中抽取原子事实
        简化版：基于 DPU 分析结果提取关键信息
        """
        facts = []
        
        # 如果有 DPU 输出，提取需求相关事实
        if dpu_output:
            top_needs = dpu_output.get('demand_ranking', [])[:3]
            for item in top_needs:
                need_name = item.get('need', '未知需求')
                potential = item.get('potential', 0)
                reason = item.get('reason', '')
                
                # 构建事实陈述
                fact = f"用户当前{need_name}需求较高(势能{potential:.2f})"
                if reason:
                    fact += f"，原因：{reason}"
                facts.append(fact)
        
        # 如果没有提取到事实，使用输入本身
        if not facts and user_input:
            # 截取前100字符作为事实
            fact_content = user_input[:100] + "..." if len(user_input) > 100 else user_input
            facts.append(f"用户提到：{fact_content}")
        
        return facts
    
    def _write_l2_fact(self,
                      content: str,
                      session_id: str,
                      user_id: str,
                      source_message_id: str,
                      dpu_output: Optional[Dict],
                      timestamp: float) -> MemoryEntry:
        """写入 L2 原子事实"""
        entry = MemoryEntry(
            layer=MemoryLayer.L2_FACT,
            content=content,
            session_id=session_id,
            user_id=user_id,
            source_message_id=source_message_id,
            timestamp=timestamp
        )
        
        # 关联 DPU 数据
        if dpu_output:
            entry.dpu_demand_ids = [item['need_id'] for item in dpu_output.get('demand_ranking', [])[:3]]
        
        # 检查是否有相似事实需要合并或更新
        self._merge_similar_facts(entry)
        
        return entry
    
    def _merge_similar_facts(self, new_entry: MemoryEntry):
        """合并相似事实（简化版）"""
        # 获取用户同类型的现有事实
        existing_facts = self.store.get_entries_by_layer(
            user_id=new_entry.user_id,
            layer=MemoryLayer.L2_FACT,
            limit=20
        )
        
        # 简单去重：如果内容相似度较高，更新旧条目而不是新建
        for fact in existing_facts:
            similarity = self._simple_similarity(new_entry.content, fact.content)
            if similarity > 0.7:  # 阈值
                # 更新旧条目
                fact.superseded_by_id = new_entry.id
                new_entry.supersedes_id = fact.id
                self.store.update_entry(fact)
                break
        
        self.store.save_entry(new_entry)
    
    def _simple_similarity(self, text1: str, text2: str) -> float:
        """简单文本相似度计算"""
        # 基于共有词的比例计算
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())
        
        if not words1 or not words2:
            return 0.0
        
        intersection = words1 & words2
        union = words1 | words2
        
        return len(intersection) / len(union)
    
    def _update_l3_identity(self, user_id: str, dpu_output: Dict, timestamp: float):
        """更新 L3 身份画像"""
        # 获取或创建用户画像
        identity = self.store.get_identity(user_id)
        if not identity:
            identity = UserIdentity(user_id=user_id)
        
        # 更新统计
        identity.total_interactions += 1
        identity.last_seen = timestamp
        
        # 更新 12 维需求画像
        for item in dpu_output.get('demand_ranking', [])[:5]:
            need_id = item.get('need_id')
            potential = item.get('potential', 0)
            
            if need_id is None:
                continue
            
            # 获取或创建该需求的画像
            if need_id not in identity.demand_profiles:
                identity.demand_profiles[need_id] = {
                    'preference': '',
                    'intensity': 0.5,
                    'trend': 'stable',
                    'last_updated': timestamp,
                    'history': []
                }
            
            profile = identity.demand_profiles[need_id]
            
            # 记录历史
            profile['history'].append({
                'timestamp': timestamp,
                'potential': potential
            })
            
            # 只保留最近20次记录
            profile['history'] = profile['history'][-20:]
            
            # 更新重视程度（滑动平均）
            old_intensity = profile['intensity']
            profile['intensity'] = old_intensity * 0.7 + potential * 0.3
            
            # 判断趋势
            if len(profile['history']) >= 2:
                recent = profile['history'][-5:]  # 最近5次
                early = profile['history'][:5]    # 最早5次
                recent_avg = sum(h['potential'] for h in recent) / len(recent)
                early_avg = sum(h['potential'] for h in early) / len(early)
                
                if recent_avg > early_avg * 1.1:
                    profile['trend'] = 'rising'
                elif recent_avg < early_avg * 0.9:
                    profile['trend'] = 'falling'
                else:
                    profile['trend'] = 'stable'
            
            profile['last_updated'] = timestamp
        
        # 保存更新后的画像
        self.store.save_identity(identity)
    
    def _update_l4_summary(self,
                          session_id: str,
                          user_id: str,
                          new_message: str,
                          dpu_output: Optional[Dict],
                          timestamp: float) -> Optional[MemoryEntry]:
        """更新 L4 会话摘要"""
        if not session_id:
            return None
        
        # 获取当前会话的摘要
        existing_summary = self.store.get_session_summary(session_id)
        
        if existing_summary:
            # 更新现有摘要
            existing_summary.content += f"\n{new_message}"
            existing_summary.timestamp = timestamp
            
            # 更新 DPU 数据
            if dpu_output:
                # 合并需求ID
                new_demands = [item['need_id'] for item in dpu_output.get('demand_ranking', [])[:3]]
                for d in new_demands:
                    if d not in existing_summary.dpu_demand_ids:
                        existing_summary.dpu_demand_ids.append(d)
            
            self.store.update_entry(existing_summary)
            return existing_summary
        else:
            # 创建新摘要
            summary = MemoryEntry(
                layer=MemoryLayer.L4_SUMMARY,
                content=new_message,
                session_id=session_id,
                user_id=user_id,
                timestamp=timestamp
            )
            
            if dpu_output:
                summary.dpu_demand_ids = [item['need_id'] for item in dpu_output.get('demand_ranking', [])[:3]]
            
            self.store.save_entry(summary)
            return summary
