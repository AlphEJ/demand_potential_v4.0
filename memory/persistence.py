"""
持久化层 - 轻量级存储
使用 SQLite + JSON 文件，兼容 PC 和开发板
"""

import json
import sqlite3
import os
from typing import Dict, List, Optional, Any
from datetime import datetime

from .models import MemoryEntry, MemoryLayer, UserIdentity, EvolutionChain, MentalModel, IntentionPrediction


class MemoryStore:
    """记忆存储 - SQLite + JSON 混合方案"""
    
    def __init__(self, db_path: str = "./memory_store.db", data_dir: str = "./memory_data"):
        self.db_path = db_path
        self.data_dir = data_dir
        
        # 确保目录存在
        os.makedirs(data_dir, exist_ok=True)
        
        # 初始化数据库
        self._init_db()
    
    def _init_db(self):
        """初始化数据库表"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 记忆条目表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS memory_entries (
                id TEXT PRIMARY KEY,
                layer INTEGER,
                content TEXT,
                timestamp REAL,
                session_id TEXT,
                user_id TEXT,
                source_message_id TEXT,
                dpu_demand_ids TEXT,  -- JSON 数组
                dpu_potentials TEXT,  -- JSON 对象
                dpu_top_demand INTEGER,
                supersedes_id TEXT,
                superseded_by_id TEXT,
                evolution_chain_id TEXT,
                confidence REAL,
                access_count INTEGER,
                last_accessed REAL,
                tags TEXT  -- JSON 数组
            )
        ''')
        
        # 用户画像表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_identities (
                user_id TEXT PRIMARY KEY,
                demand_profiles TEXT,  -- JSON
                decision_style TEXT,
                risk_tolerance REAL,
                time_preference TEXT,
                total_interactions INTEGER,
                first_seen REAL,
                last_seen REAL
            )
        ''')
        
        # 演化链表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS evolution_chains (
                id TEXT PRIMARY KEY,
                chain_type TEXT,
                target_id INTEGER,
                target_name TEXT,
                head_id TEXT,
                tail_id TEXT,
                node_ids TEXT,  -- JSON 数组
                created_at REAL,
                updated_at REAL,
                is_active INTEGER
            )
        ''')
        
        # 心智模型表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS mental_models (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                model_type TEXT,
                description TEXT,
                triggers TEXT,  -- JSON 数组
                pattern TEXT,
                underlying_need TEXT,
                typical_response TEXT,
                evidence_count INTEGER,
                contradict_count INTEGER,
                confidence REAL,
                created_at REAL,
                updated_at REAL
            )
        ''')
        
        # 前瞻意图表
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS intention_predictions (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                predicted_intention TEXT,
                related_demand_id INTEGER,
                trigger_context TEXT,
                confidence REAL,
                expected_timeframe TEXT,
                is_fulfilled INTEGER,
                fulfilled_at REAL,
                created_at REAL
            )
        ''')
        
        # 创建索引
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_entries_user ON memory_entries(user_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_entries_layer ON memory_entries(layer)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_entries_session ON memory_entries(session_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_entries_timestamp ON memory_entries(timestamp)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_entries_evolution ON memory_entries(evolution_chain_id)')
        
        conn.commit()
        conn.close()
    
    # ========== MemoryEntry 操作 ==========
    
    def save_entry(self, entry: MemoryEntry):
        """保存记忆条目"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT OR REPLACE INTO memory_entries VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        ''', (
            entry.id,
            entry.layer.value,
            entry.content,
            entry.timestamp,
            entry.session_id,
            entry.user_id,
            entry.source_message_id,
            json.dumps(entry.dpu_demand_ids),
            json.dumps(entry.dpu_potentials),
            entry.dpu_top_demand,
            entry.supersedes_id,
            entry.superseded_by_id,
            entry.evolution_chain_id,
            entry.confidence,
            entry.access_count,
            entry.last_accessed,
            json.dumps(entry.tags)
        ))
        
        conn.commit()
        conn.close()
    
    def update_entry(self, entry: MemoryEntry):
        """更新记忆条目"""
        self.save_entry(entry)  # SQLite 的 REPLACE 实现
    
    def get_entry(self, entry_id: str) -> Optional[MemoryEntry]:
        """获取单条记忆"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM memory_entries WHERE id = ?', (entry_id,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return self._row_to_entry(row)
        return None
    
    def get_entries_by_layer(self, user_id: str, layer: MemoryLayer, 
                            limit: int = 100) -> List[MemoryEntry]:
        """按层级获取记忆"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT * FROM memory_entries 
            WHERE user_id = ? AND layer = ?
            ORDER BY timestamp DESC
            LIMIT ?
        ''', (user_id, layer.value, limit))
        
        rows = cursor.fetchall()
        conn.close()
        
        return [self._row_to_entry(row) for row in rows]
    
    def get_recent_entries(self, user_id: str, limit: int = 50) -> List[MemoryEntry]:
        """获取最近记忆"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT * FROM memory_entries 
            WHERE user_id = ?
            ORDER BY timestamp DESC
            LIMIT ?
        ''', (user_id, limit))
        
        rows = cursor.fetchall()
        conn.close()
        
        return [self._row_to_entry(row) for row in rows]
    
    def get_session_summary(self, session_id: str) -> Optional[MemoryEntry]:
        """获取会话摘要"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT * FROM memory_entries 
            WHERE session_id = ? AND layer = ?
            ORDER BY timestamp DESC
            LIMIT 1
        ''', (session_id, MemoryLayer.L4_SUMMARY.value))
        
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return self._row_to_entry(row)
        return None
    
    def _row_to_entry(self, row) -> MemoryEntry:
        """数据库行转 MemoryEntry"""
        return MemoryEntry.from_dict({
            'id': row[0],
            'layer': row[1],
            'content': row[2],
            'timestamp': row[3],
            'session_id': row[4],
            'user_id': row[5],
            'source_message_id': row[6],
            'dpu_demand_ids': json.loads(row[7]) if row[7] else [],
            'dpu_potentials': {int(k): v for k, v in json.loads(row[8]).items()} if row[8] else {},
            'dpu_top_demand': row[9],
            'supersedes_id': row[10],
            'superseded_by_id': row[11],
            'evolution_chain_id': row[12],
            'confidence': row[13],
            'access_count': row[14],
            'last_accessed': row[15],
            'tags': json.loads(row[16]) if row[16] else [],
        })
    
    # ========== UserIdentity 操作 ==========
    
    def save_identity(self, identity: UserIdentity):
        """保存用户画像"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT OR REPLACE INTO user_identities VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            identity.user_id,
            json.dumps(identity.demand_profiles),
            identity.decision_style,
            identity.risk_tolerance,
            identity.time_preference,
            identity.total_interactions,
            identity.first_seen,
            identity.last_seen
        ))
        
        conn.commit()
        conn.close()
    
    def get_identity(self, user_id: str) -> Optional[UserIdentity]:
        """获取用户画像"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM user_identities WHERE user_id = ?', (user_id,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            identity = UserIdentity()
            identity.user_id = row[0]
            identity.demand_profiles = {int(k): v for k, v in json.loads(row[1]).items()} if row[1] else {}
            identity.decision_style = row[2]
            identity.risk_tolerance = row[3]
            identity.time_preference = row[4]
            identity.total_interactions = row[5]
            identity.first_seen = row[6]
            identity.last_seen = row[7]
            return identity
        return None
    
    # ========== EvolutionChain 操作 ==========
    
    def save_chain(self, chain: EvolutionChain):
        """保存演化链"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT OR REPLACE INTO evolution_chains VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            chain.id,
            chain.chain_type,
            chain.target_id,
            chain.target_name,
            chain.head_id,
            chain.tail_id,
            json.dumps(chain.node_ids),
            chain.created_at,
            chain.updated_at,
            1 if chain.is_active else 0
        ))
        
        conn.commit()
        conn.close()
    
    def get_chain(self, chain_id: str) -> Optional[EvolutionChain]:
        """获取演化链"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM evolution_chains WHERE id = ?', (chain_id,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            chain = EvolutionChain()
            chain.id = row[0]
            chain.chain_type = row[1]
            chain.target_id = row[2]
            chain.target_name = row[3]
            chain.head_id = row[4]
            chain.tail_id = row[5]
            chain.node_ids = json.loads(row[6]) if row[6] else []
            chain.created_at = row[7]
            chain.updated_at = row[8]
            chain.is_active = bool(row[9])
            return chain
        return None
    
    def get_chain_by_target(self, user_id: str, target_id: int, 
                           chain_type: str) -> Optional[EvolutionChain]:
        """按目标获取演化链"""
        # 简化实现：遍历查找
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT * FROM evolution_chains 
            WHERE target_id = ? AND chain_type = ? AND is_active = 1
            LIMIT 1
        ''', (target_id, chain_type))
        
        row = cursor.fetchone()
        conn.close()
        
        if row:
            chain = EvolutionChain()
            chain.id = row[0]
            chain.chain_type = row[1]
            chain.target_id = row[2]
            chain.target_name = row[3]
            chain.head_id = row[4]
            chain.tail_id = row[5]
            chain.node_ids = json.loads(row[6]) if row[6] else []
            chain.created_at = row[7]
            chain.updated_at = row[8]
            chain.is_active = bool(row[9])
            return chain
        return None
    
    # ========== 搜索功能 ==========
    
    def search_by_demand(self, user_id: str, demand_id: int, 
                        limit: int = 20) -> List[MemoryEntry]:
        """按需求ID搜索记忆"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 使用 JSON 包含查询（简化版）
        cursor.execute('''
            SELECT * FROM memory_entries 
            WHERE user_id = ?
            ORDER BY timestamp DESC
        ''', (user_id,))
        
        rows = cursor.fetchall()
        conn.close()
        
        # 过滤包含指定 demand_id 的条目
        results = []
        for row in rows:
            demand_ids = json.loads(row[7]) if row[7] else []
            if demand_id in demand_ids:
                results.append(self._row_to_entry(row))
                if len(results) >= limit:
                    break
        
        return results
    
    def get_demand_history(self, user_id: str, demand_id: int, 
                          limit: int = 50) -> List[Dict]:
        """获取特定需求的历史变化"""
        entries = self.search_by_demand(user_id, demand_id, limit)
        
        history = []
        for entry in entries:
            if demand_id in entry.dpu_potentials:
                history.append({
                    'timestamp': entry.timestamp,
                    'potential': entry.dpu_potentials[demand_id],
                    'content': entry.content[:100],
                    'layer': entry.layer.name
                })
        
        return sorted(history, key=lambda x: x['timestamp'])
    
    # ========== 统计功能 ==========
    
    def get_stats(self, user_id: str) -> Dict[str, Any]:
        """获取用户记忆统计"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 各层记忆数量
        cursor.execute('''
            SELECT layer, COUNT(*) FROM memory_entries 
            WHERE user_id = ?
            GROUP BY layer
        ''', (user_id,))
        
        layer_counts = {row[0]: row[1] for row in cursor.fetchall()}
        
        # 总记忆数
        cursor.execute('SELECT COUNT(*) FROM memory_entries WHERE user_id = ?', (user_id,))
        total = cursor.fetchone()[0]
        
        # 时间范围
        cursor.execute('''
            SELECT MIN(timestamp), MAX(timestamp) FROM memory_entries 
            WHERE user_id = ?
        ''', (user_id,))
        
        time_range = cursor.fetchone()
        conn.close()
        
        return {
            'total_entries': total,
            'layer_counts': layer_counts,
            'first_memory': time_range[0],
            'last_memory': time_range[1],
        }
