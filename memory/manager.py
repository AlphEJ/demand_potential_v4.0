"""
记忆管理器 - 统一入口
整合 System1 和 System2，提供简洁的 API
"""

import time
from typing import Dict, List, Optional, Any

from .models import MemoryEntry, MemoryLayer, UserIdentity, EvolutionChain
from .persistence import MemoryStore
from .system1 import System1Processor
from .system2 import System2Processor


class MemoryManager:
    """记忆管理器 - DPU 记忆模块的统一入口"""
    
    def __init__(self, db_path: str = "./memory_store.db", llm_client=None):
        self.store = MemoryStore(db_path=db_path)
        self.llm_client = llm_client
        
        # 初始化处理器
        self.system1 = System1Processor(self.store, llm_client)
        # System2 后台处理（异步）
        self.system2 = System2Processor(self.store, llm_client)
    
    # ========== 核心 API ==========
    
    def record_conversation(self,
                           user_input: str,
                           assistant_response: str,
                           dpu_output: Optional[Dict] = None,
                           session_id: str = "",
                           user_id: str = "default") -> Dict[str, Any]:
        """
        记录对话 - 主入口
        
        自动调用 System1 实时处理，写入 L1-L4
        """
        return self.system1.process_message(
            user_input=user_input,
            assistant_response=assistant_response,
            dpu_output=dpu_output,
            session_id=session_id,
            user_id=user_id
        )
    
    def get_context_for_analysis(self, user_id: str, 
                                 current_input: str,
                                 max_context_items: int = 5) -> Dict[str, Any]:
        """
        获取分析所需的上下文记忆
        
        用于 Understanding 页面，调取少量历史辅助理解
        """
        context = {
            'recent_facts': [],
            'identity_summary': {},
            'relevant_history': []
        }
        
        # 1. 获取用户画像
        identity = self.store.get_identity(user_id)
        if identity:
            # 提取关键画像信息
            context['identity_summary'] = {
                'total_interactions': identity.total_interactions,
                'top_demands': self._get_top_demands(identity),
                'decision_style': identity.decision_style
            }
        
        # 2. 获取最近事实
        recent_facts = self.store.get_entries_by_layer(
            user_id=user_id,
            layer=MemoryLayer.L2_FACT,
            limit=max_context_items
        )
        context['recent_facts'] = [f.content for f in recent_facts]
        
        # 3. 获取相关历史（简化版：基于时间）
        recent_entries = self.store.get_recent_entries(user_id, limit=10)
        context['relevant_history'] = [
            {
                'content': e.content[:100],
                'timestamp': e.timestamp,
                'top_demand': e.dpu_top_demand
            }
            for e in recent_entries
        ]
        
        return context
    
    def get_full_context_for_agent(self, user_id: str,
                                   session_id: str = "",
                                   max_turns: int = 50) -> List[Dict]:
        """
        获取 Agent 所需的完整对话上下文
        
        用于 Agent 页面，突破 10 轮限制
        """
        # 获取会话相关的所有原始痕迹
        if session_id:
            # 获取该会话的记忆
            entries = self.store.get_recent_entries(user_id, limit=max_turns)
            # 过滤当前会话
            session_entries = [e for e in entries if e.session_id == session_id]
        else:
            # 获取所有最近记忆
            session_entries = self.store.get_recent_entries(user_id, limit=max_turns)
        
        # 构建对话历史
        context = []
        for entry in session_entries:
            if entry.layer == MemoryLayer.L1_RAW:
                # 解析原始对话
                lines = entry.content.split('\n')
                user_msg = ""
                ai_msg = ""
                for line in lines:
                    if line.startswith("用户: "):
                        user_msg = line[4:]
                    elif line.startswith("AI: "):
                        ai_msg = line[4:]
                
                if user_msg or ai_msg:
                    context.append({
                        'timestamp': entry.timestamp,
                        'user': user_msg,
                        'assistant': ai_msg,
                        'dpu_top_demand': entry.dpu_top_demand,
                        'dpu_potentials': entry.dpu_potentials
                    })
        
        # 按时间排序
        context.sort(key=lambda x: x['timestamp'])
        return context
    
    def get_user_identity(self, user_id: str) -> Optional[UserIdentity]:
        """获取用户画像"""
        return self.store.get_identity(user_id)
    
    def get_demand_trend(self, user_id: str, demand_id: int) -> List[Dict]:
        """获取需求变化趋势"""
        return self.store.get_demand_history(user_id, demand_id)
    
    def get_memory_stats(self, user_id: str) -> Dict[str, Any]:
        """获取记忆统计"""
        return self.store.get_stats(user_id)
    
    def add_memory(self,
                   user_id: str,
                   content: str,
                   layer: int = 1,
                   metadata: Optional[Dict] = None) -> str:
        """
        直接添加记忆条目（简化接口）
        
        Args:
            user_id: 用户ID
            content: 记忆内容
            layer: 记忆层级 (1-6)
            metadata: 元数据
        
        Returns:
            记忆ID
        """
        from .models import MemoryLayer
        
        layer_map = {
            1: MemoryLayer.L1_RAW,
            2: MemoryLayer.L2_FACT,
            3: MemoryLayer.L3_IDENTITY,
            4: MemoryLayer.L4_SUMMARY,
            5: MemoryLayer.L5_MENTAL,
            6: MemoryLayer.L6_INTENTION
        }
        
        memory_layer = layer_map.get(layer, MemoryLayer.L1_RAW)
        
        entry = MemoryEntry(
            user_id=user_id,
            content=content,
            layer=memory_layer,
            tags=metadata.get('tags', []) if metadata else [],
            dpu_potentials=metadata.get('dpu_potentials') if metadata else None,
            dpu_demand_ids=metadata.get('dpu_demand_ids') if metadata else None,
        )
        
        self.store.save_entry(entry)
        return entry.id
    
    # ========== 演化链相关 ==========
    
    def get_evolution_chain(self, chain_id: str) -> Optional[EvolutionChain]:
        """获取演化链"""
        return self.store.get_chain(chain_id)
    
    def get_demand_evolution(self, user_id: str, demand_id: int) -> Optional[EvolutionChain]:
        """获取特定需求的演化链"""
        return self.store.get_chain_by_target(user_id, demand_id, "demand")
    
    # ========== 辅助方法 ==========
    
    def _get_top_demands(self, identity: UserIdentity, n: int = 3) -> List[Dict]:
        """获取用户最关注的需求"""
        if not identity.demand_profiles:
            return []
        
        # 按重视程度排序
        sorted_demands = sorted(
            identity.demand_profiles.items(),
            key=lambda x: x[1].get('intensity', 0),
            reverse=True
        )
        
        return [
            {
                'demand_id': d[0],
                'intensity': d[1].get('intensity', 0),
                'trend': d[1].get('trend', 'stable')
            }
            for d in sorted_demands[:n]
        ]
    
    def format_context_for_prompt(self, context: Dict[str, Any]) -> str:
        """将上下文格式化为 Prompt 文本"""
        lines = ["【历史记忆上下文】"]
        
        # 用户画像
        if context.get('identity_summary'):
            summary = context['identity_summary']
            lines.append(f"\n用户交互次数: {summary.get('total_interactions', 0)}")
            
            top_demands = summary.get('top_demands', [])
            if top_demands:
                lines.append("长期关注需求:")
                for d in top_demands:
                    lines.append(f"  - 需求{d['demand_id']}: 重视度{d['intensity']:.2f} ({d['trend']})")
        
        # 最近事实
        recent_facts = context.get('recent_facts', [])
        if recent_facts:
            lines.append("\n最近记忆:")
            for fact in recent_facts[:3]:
                lines.append(f"  - {fact}")
        
        return "\n".join(lines)
    
    # ========== System2 后台处理 ==========
    
    def process_background(self, user_id: str = "default"):
        """
        后台处理（System2）
        由定时任务或空闲时调用，不阻塞主链路
        
        功能：
        - 生成/更新 L5 心智模型
        - 生成 L6 前瞻意图
        - 维护演化链
        - 记忆去重和合并
        
        Args:
            user_id: 用户ID，默认 "default"
        """
        self.system2.process_background(user_id)
    
    def get_mental_models(self, user_id: str = "default", model_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        获取用户的心智模型（L5）
        
        Args:
            user_id: 用户ID
            model_type: 模型类型筛选（decision/conflict/...），None 表示全部
            
        Returns:
            心智模型列表
        """
        return self.system2.get_mental_models(user_id, model_type)
    
    def get_intention_predictions(self, user_id: str = "default") -> List[Dict[str, Any]]:
        """
        获取意图预测（L6）
        
        Args:
            user_id: 用户ID
            
        Returns:
            意图预测列表
        """
        return self.system2.get_intention_predictions(user_id)
