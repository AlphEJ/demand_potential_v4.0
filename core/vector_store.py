"""
FAISS 本地向量存储 + 持久化
用于增量存储需求维度基准向量和用户交互向量
"""

import os
import json
import logging
import time
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field

import numpy as np

logger = logging.getLogger("dpu_vector_store")


# ============================================================
# 向量条目数据结构
# ============================================================

@dataclass
class VectorEntry:
    """单条向量记录"""
    text: str
    vector: np.ndarray
    demand_id: int            # 对应的需求维度 0-11
    similarity: float = 0.0   # 与基准向量的相似度
    timestamp: float = 0.0
    metadata: Dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "vector": self.vector.tolist() if isinstance(self.vector, np.ndarray) else self.vector,
            "demand_id": self.demand_id,
            "similarity": self.similarity,
            "timestamp": self.timestamp,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "VectorEntry":
        return cls(
            text=data["text"],
            vector=np.array(data["vector"], dtype=np.float32),
            demand_id=data["demand_id"],
            similarity=data.get("similarity", 0.0),
            timestamp=data.get("timestamp", 0.0),
            metadata=data.get("metadata", {}),
        )


# ============================================================
# 向量存储（FAISS + JSON持久化）
# ============================================================

class DemandVectorStore:
    """
    需求维度向量存储

    管理：
    - 12 个基准向量（每个需求维度的标准描述编码）
    - 增量用户交互向量（按需求维度分类存储）
    - FAISS 索引用于快速相似度搜索
    - JSON + NumPy 持久化
    """

    def __init__(self, store_dir: str = "data/vector_store"):
        self.store_dir = store_dir
        self.store_path = os.path.join(store_dir, "vectors.json")
        self.index_path = os.path.join(store_dir, "faiss.index")

        # 12 个基准向量
        self.baseline_vectors: Optional[np.ndarray] = None  # shape (12, dim)

        # 每维度的用户交互向量
        self.user_vectors: Dict[int, List[VectorEntry]] = {
            i: [] for i in range(12)
        }

        # FAISS 索引（延迟构建）
        self._faiss_index = None
        self._vector_dim = None

        # 统计
        self.total_entries: int = 0
        self.created_at: float = time.time()

        # 自动加载已有数据
        self._auto_load()

    # ============================================================
    # 基准向量管理
    # ============================================================

    def set_baselines(self, vectors: np.ndarray) -> None:
        """设置12维基准向量。

        Args:
            vectors: shape (12, embedding_dim) 的 numpy 数组
        """
        assert vectors.shape[0] == 12, f"基准向量必须12行，当前 {vectors.shape[0]}"
        self.baseline_vectors = vectors.astype(np.float32)
        self._vector_dim = vectors.shape[1]
        self._build_faiss_index()

    def _build_faiss_index(self):
        """构建 FAISS 索引"""
        if self.baseline_vectors is None:
            return
        try:
            import faiss
            dim = self._vector_dim
            # 使用内积索引（向量需L2归一化 → 等价余弦相似度）
            self._faiss_index = faiss.IndexFlatIP(dim)
            # L2归一化基准向量
            vectors = self.baseline_vectors.copy()
            faiss.normalize_L2(vectors)
            self._faiss_index.add(vectors)
            logger.info(f"FAISS索引已构建: {dim}维, 12个基准向量")
        except ImportError:
            logger.warning("FAISS未安装，使用NumPy替代搜索")
            self._faiss_index = None

    # ============================================================
    # 相似度搜索
    # ============================================================

    def search(self, query_vector: np.ndarray, top_k: int = 5) -> List[Tuple[int, float]]:
        """搜索最相似的基准需求维度。

        Args:
            query_vector: shape (dim,) 的查询向量
            top_k: 返回前k个结果

        Returns:
            [(need_id, similarity_score), ...] 按相似度降序排列
        """
        query = query_vector.astype(np.float32).reshape(1, -1)

        if self._faiss_index is not None:
            # FAISS 路径
            import faiss
            faiss.normalize_L2(query)
            scores, indices = self._faiss_index.search(query, min(top_k, 12))
            results = []
            for idx, score in zip(indices[0], scores[0]):
                if idx >= 0 and idx < 12:
                    results.append((int(idx), float(score)))
            return results
        elif self.baseline_vectors is not None:
            # NumPy 降级路径
            norm_query = query / (np.linalg.norm(query) + 1e-8)
            norm_base = self.baseline_vectors / (
                np.linalg.norm(self.baseline_vectors, axis=1, keepdims=True) + 1e-8
            )
            similarities = np.dot(norm_base, norm_query.T).flatten()
            top_indices = np.argsort(similarities)[::-1][:top_k]
            return [(int(i), float(similarities[i])) for i in top_indices]
        else:
            return []

    # ============================================================
    # 增量向量存储
    # ============================================================

    def add_user_vector(
        self,
        text: str,
        vector: np.ndarray,
        demand_id: int,
        similarity: float = 0.0,
        metadata: Optional[Dict] = None,
    ) -> None:
        """添加一条用户交互向量。

        Args:
            text: 原始文本
            vector: 向量
            demand_id: 匹配到的需求维度
            similarity: 匹配相似度
            metadata: 附加元数据
        """
        if demand_id < 0 or demand_id >= 12:
            return

        entry = VectorEntry(
            text=text,
            vector=vector.astype(np.float32),
            demand_id=demand_id,
            similarity=similarity,
            timestamp=time.time(),
            metadata=metadata or {},
        )
        self.user_vectors[demand_id].append(entry)
        self.total_entries += 1

        # 每 100 条自动保存
        if self.total_entries % 100 == 0:
            self.save()

    def get_demand_stats(self) -> Dict[int, Dict]:
        """获取各需求维度统计信息。

        Returns:
            {demand_id: {count, avg_similarity, ...}}
        """
        stats = {}
        for i in range(12):
            entries = self.user_vectors[i]
            if entries:
                avgs = np.mean([e.similarity for e in entries])
                stats[i] = {
                    "count": len(entries),
                    "avg_similarity": float(avgs),
                    "total_entries": len(entries),
                }
            else:
                stats[i] = {"count": 0, "avg_similarity": 0.0, "total_entries": 0}
        return stats

    def get_cooccurrence_matrix(self) -> np.ndarray:
        """
        基于已存储向量，计算12×12需求共现矩阵。

        Returns:
            12×12 归一化共现矩阵 (float64)
        """
        matrix = np.zeros((12, 12), dtype=np.float64)
        # 统计各维度条目数作为自相关
        for i in range(12):
            matrix[i, i] = 1.0  # 自相关始终为1

        # 共现：使用不同维度间的平均相似度交叉
        for i in range(12):
            for j in range(i + 1, 12):
                if self.user_vectors[i] and self.user_vectors[j]:
                    vecs_i = np.array([e.vector for e in self.user_vectors[i]])
                    vecs_j = np.array([e.vector for e in self.user_vectors[j]])
                    # 计算两个维度向量集的平均余弦相似度
                    sim = np.mean(np.dot(vecs_i, vecs_j.T))
                    matrix[i, j] = max(0.0, float(sim))
                    matrix[j, i] = matrix[i, j]

        return matrix

    # ============================================================
    # 持久化
    # ============================================================

    def save(self) -> bool:
        """保存向量数据到磁盘"""
        try:
            os.makedirs(self.store_dir, exist_ok=True)

            # 保存基准向量
            baseline_data = {
                "shape": self.baseline_vectors.shape if self.baseline_vectors is not None else None,
                "vectors": self.baseline_vectors.tolist() if self.baseline_vectors is not None else None,
            }
            baseline_path = os.path.join(self.store_dir, "baselines.npy")
            if self.baseline_vectors is not None:
                np.save(baseline_path, self.baseline_vectors)

            # 保存用户向量
            data = {
                "total_entries": self.total_entries,
                "created_at": self.created_at,
                "updated_at": time.time(),
                "vector_dim": self._vector_dim,
                "baseline_info": {
                    "shape": baseline_data["shape"],
                },
                "user_vectors": {
                    str(i): [e.to_dict() for e in entries]
                    for i, entries in self.user_vectors.items()
                },
            }
            with open(self.store_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

            # 保存 FAISS 索引
            if self._faiss_index is not None:
                import faiss
                faiss.write_index(self._faiss_index, self.index_path)

            logger.info(f"向量存储已保存: {self.total_entries}条记录 -> {self.store_dir}")
            return True
        except Exception as e:
            logger.error(f"向量存储保存失败: {e}")
            return False

    def _auto_load(self) -> None:
        """自动加载已有数据"""
        if not os.path.exists(self.store_path):
            return

        try:
            with open(self.store_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            self.total_entries = data.get("total_entries", 0)
            self.created_at = data.get("created_at", time.time())
            self._vector_dim = data.get("vector_dim")

            # 加载用户向量
            for i_str, entries_data in data.get("user_vectors", {}).items():
                i = int(i_str)
                self.user_vectors[i] = [
                    VectorEntry.from_dict(e) for e in entries_data
                ]

            # 加载基准向量
            baseline_path = os.path.join(self.store_dir, "baselines.npy")
            if os.path.exists(baseline_path):
                self.baseline_vectors = np.load(baseline_path)
                self._vector_dim = self.baseline_vectors.shape[1]
                self._build_faiss_index()

            # 加载 FAISS 索引
            if os.path.exists(self.index_path) and self._faiss_index is None:
                import faiss
                self._faiss_index = faiss.read_index(self.index_path)

            logger.info(f"向量存储已加载: {self.total_entries}条记录")
        except Exception as e:
            logger.warning(f"向量存储加载失败，使用空库: {e}")

    def clear(self) -> None:
        """清空所有用户向量（保留基准向量）"""
        self.user_vectors = {i: [] for i in range(12)}
        self.total_entries = 0
        logger.info("用户向量已清空")
