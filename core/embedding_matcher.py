"""
需求维度向量语义匹配器
使用句子嵌入 + 余弦相似度替代手工关键词匹配
支持中英文双语，TF-IDF 兜底
"""

import logging
import time
from typing import Dict, List, Optional, Tuple

import numpy as np

from .demand_descriptions import get_all_descriptions
from .vector_store import DemandVectorStore
from .demands import Demand, DemandSet, NeedMeta

logger = logging.getLogger("dpu_embedding")


# ============================================================
# 配置
# ============================================================

class EmbeddingConfig:
    """Embedding 配置"""

    def __init__(
        self,
        provider: str = "local",                    # "local" | "remote" | "none"
        model_name: str = "paraphrase-multilingual-MiniLM-L12-v2",
        similarity_threshold: float = 0.40,          # 激活阈值
        fallback_to_keywords: bool = True,           # 是否降级到关键词匹配
        use_tfidf_fallback: bool = True,             # 是否启用 TF-IDF 兜底
        language: str = "auto",                      # "zh" | "en" | "auto"
        store_dir: str = "data/vector_store",
        cache_baselines: bool = True,
    ):
        self.provider = provider
        self.model_name = model_name
        self.similarity_threshold = similarity_threshold
        self.fallback_to_keywords = fallback_to_keywords
        self.use_tfidf_fallback = use_tfidf_fallback
        self.language = language
        self.store_dir = store_dir
        self.cache_baselines = cache_baselines


# ============================================================
# TF-IDF 兜底引擎（零额外依赖）
# ============================================================

class TfidfMatcher:
    """
    纯 NumPy TF-IDF 实现，当 sentence-transformers 不可用时兜底。
    无需任何外部依赖。
    """

    def __init__(self):
        self._vocab: Dict[str, int] = {}
        self._idf: Optional[np.ndarray] = None
        self._baseline_tfidf: Optional[np.ndarray] = None

    def _tokenize(self, text: str) -> List[str]:
        """简单分词（字符级 bigram + unigram，中英文通用）"""
        # 按空格和标点切分
        import re
        tokens = [t for t in re.split(r'[\s，。！？、；：""''（）\-.,!?;:()\[\]{}]+', text) if t]
        # 同时加入字符 bigram 处理中文
        bigrams = []
        clean = re.sub(r'[\s，。！？、；：""''（）\-.,!?;:()\[\]{}]+', '', text)
        for i in range(len(clean) - 1):
            bigrams.append(clean[i:i+2])
        return tokens + bigrams

    def _build_vocab(self, documents: List[str]) -> None:
        """构建词表"""
        self._vocab = {}
        idx = 0
        for doc in documents:
            for token in self._tokenize(doc):
                if token not in self._vocab:
                    self._vocab[token] = idx
                    idx += 1

    def _tfidf_vector(self, text: str, idf: np.ndarray) -> np.ndarray:
        """计算文本的 TF-IDF 向量"""
        tokens = self._tokenize(text)
        tf = np.zeros(len(self._vocab))
        for token in tokens:
            if token in self._vocab:
                tf[self._vocab[token]] += 1
        if tf.sum() > 0:
            tf = tf / tf.sum()
        return tf * idf

    def fit(self, documents: List[str]) -> None:
        """拟合 TF-IDF 模型"""
        self._build_vocab(documents)
        n_docs = len(documents)
        # 计算 IDF
        df = np.zeros(len(self._vocab))
        for doc in documents:
            seen = set()
            for token in self._tokenize(doc):
                if token in self._vocab and token not in seen:
                    df[self._vocab[token]] += 1
                    seen.add(token)
        self._idf = np.log((n_docs + 1) / (df + 1)) + 1

        # 计算基准 TF-IDF 向量
        self._baseline_tfidf = np.array([
            self._tfidf_vector(doc, self._idf) for doc in documents
        ])

    def match(self, query: str) -> np.ndarray:
        """匹配查询文本，返回与各文档的余弦相似度"""
        if self._idf is None or self._baseline_tfidf is None:
            return np.ones(12) * 0.1
        query_vec = self._tfidf_vector(query, self._idf)
        norm_q = np.linalg.norm(query_vec) + 1e-8
        norm_b = np.linalg.norm(self._baseline_tfidf, axis=1) + 1e-8
        similarities = np.dot(self._baseline_tfidf, query_vec) / (norm_b * norm_q)
        return np.clip(similarities, 0.0, 1.0)


# ============================================================
# 向量语义匹配器
# ============================================================

class DemandEmbeddingMatcher:
    """
    需求维度向量语义匹配器

    功能：
    1. 加载句子嵌入模型 → 编码12维标准描述为基准向量
    2. 对用户输入做语义编码 → 余弦相似度匹配
    3. 输出12维激活值（与原有 parse_demands_by_keywords 格式兼容）
    4. 增量学习：用户交互向量入库，提升后续匹配精度
    5. 三层降级：sentence-transformers → TF-IDF → None（由上层处理）

    用法：
        matcher = DemandEmbeddingMatcher(config)
        # 构建基准向量（首次使用）
        matcher.build_baselines()
        # 匹配
        result = matcher.match(["我饿了明天有面试"])
        # result = {0: 0.85, 1: 0.72, ...}  # need_id -> activation
    """

    def __init__(self, config: EmbeddingConfig = None):
        self.config = config or EmbeddingConfig()
        self._model = None          # sentence-transformers 模型
        self._model_dim = None      # 向量维度
        self._baseline_vectors: Optional[np.ndarray] = None  # shape (12, dim)
        self._tfidf_matcher: Optional[TfidfMatcher] = None
        self._model_available = False

        # 向量存储
        self.vector_store = DemandVectorStore(store_dir=self.config.store_dir)

    # ============================================================
    # 初始化
    # ============================================================

    def _load_model(self) -> bool:
        """懒加载 sentence-transformers 模型。失败时降级到 TF-IDF。"""
        if self._model_available:
            return True
        if self.config.provider == "none":
            return False

        # 尝试加载 sentence-transformers
        try:
            from sentence_transformers import SentenceTransformer
            logger.info(f"加载 embedding 模型: {self.config.model_name}")
            self._model = SentenceTransformer(self.config.model_name)
            self._model_dim = self._model.get_sentence_embedding_dimension()
            self._model_available = True
            logger.info(f"模型加载成功，向量维度: {self._model_dim}")
            return True
        except ImportError:
            logger.warning("sentence-transformers 未安装，降级为 TF-IDF")
        except Exception as e:
            logger.warning(f"模型加载失败: {e}，降级为 TF-IDF")

        # 降级到 TF-IDF
        if self.config.use_tfidf_fallback:
            self._tfidf_matcher = TfidfMatcher()
            self._model_available = False
            return True  # TF-IDF 可作为降级方案
        return False

    def _encode(self, texts: List[str]) -> Optional[np.ndarray]:
        """编码文本列表为向量。

        Returns:
            shape (n, dim) 或 None
        """
        if self._model_available and self._model is not None:
            return self._model.encode(texts, show_progress_bar=False)
        elif self._tfidf_matcher is not None:
            # TF-IDF 模式：逐文本匹配
            if self._tfidf_matcher._idf is None:
                return np.ones((len(texts), 12)) * 0.1  # 未拟合时返回均等值
            vecs = []
            for text in texts:
                vec = self._tfidf_matcher.match(text)
                vecs.append(vec)
            return np.array(vecs) if vecs else None
        return None

    # ============================================================
    # 基准向量构建
    # ============================================================

    def build_baselines(self, lang: str = "zh", force: bool = False) -> bool:
        """构建12维基准向量。

        用标准描述文本生成 embedding，作为每个需求维度的"锚点"。

        Args:
            lang: 语言 ("zh"/"en")
            force: 是否强制重建

        Returns:
            是否成功
        """
        # 检查是否已从磁盘加载
        if self.vector_store.baseline_vectors is not None and not force:
            self._baseline_vectors = self.vector_store.baseline_vectors
            self._model_dim = self.vector_store._vector_dim
            logger.info(f"基准向量已从磁盘加载，维度: {self._model_dim}")
            return True

        # 加载模型
        if not self._load_model():
            logger.warning("无法加载任何 embedding 模型，基准向量构建失败")
            return False

        # 获取描述文本
        descriptions = get_all_descriptions(lang, short=False)
        texts = [descriptions[i] for i in range(12)]

        if self._model_available:
            # sentence-transformers 编码
            vectors = self._encode(texts)
            if vectors is not None:
                self._baseline_vectors = vectors.astype(np.float32)
                self._model_dim = vectors.shape[1]
                self.vector_store.set_baselines(self._baseline_vectors)
                self.vector_store.save()
                logger.info(f"基准向量构建完成: 12 × {self._model_dim}")
                return True
        elif self._tfidf_matcher is not None:
            # TF-IDF 拟合
            self._tfidf_matcher.fit(texts)
            self._model_dim = 12  # TF-IDF 输出维度 = 12（每个文档的相似度）
            self._baseline_vectors = np.eye(12, dtype=np.float32)
            self.vector_store.set_baselines(self._baseline_vectors)
            logger.info("TF-IDF 基准向量构建完成")
            return True

        return False

    # ============================================================
    # 核心匹配逻辑
    # ============================================================

    def encode_single(self, text: str) -> np.ndarray:
        """编码单条文本"""
        if not self._model_available and self._tfidf_matcher is None:
            # 没有模型 → 返回零向量
            return np.zeros(self._model_dim or 384, dtype=np.float32)

        if self._model_available:
            result = self._encode([text])
            return result[0] if result is not None else np.zeros(self._model_dim, dtype=np.float32)
        elif self._tfidf_matcher is not None:
            result = self._tfidf_matcher.match(text)
            return result.astype(np.float32)
        return np.zeros(384, dtype=np.float32)

    def _cosine_similarity(self, query_vec: np.ndarray) -> np.ndarray:
        """计算查询向量与12个基准向量的余弦相似度。

        Returns:
            shape (12,) 的相似度数组
        """
        if self._model_available and self._baseline_vectors is not None:
            # sentence-transformers 路径
            norm_q = np.linalg.norm(query_vec) + 1e-8
            norm_b = np.linalg.norm(self._baseline_vectors, axis=1) + 1e-8
            similarities = np.dot(self._baseline_vectors, query_vec) / (norm_b * norm_q)
            return np.clip(similarities, 0.0, 1.0)
        elif self._tfidf_matcher is not None:
            # TF-IDF 路径：query_vec 已经是对12个描述的相似度
            return np.clip(query_vec, 0.0, 1.0)
        return np.zeros(12)

    def match(
        self,
        signal_texts: List[str],
        lang: str = "auto",
    ) -> Tuple[Dict[int, float], Dict]:
        """
        核心匹配方法：将信号文本映射为12维需求激活值。

        Args:
            signal_texts: 信号文本列表（LLM提取的短语）
            lang: 语言

        Returns:
            ({need_id: activation_value}, metadata)
            activation_value ∈ [0.0, 1.0]
            metadata 包含置信度等附加信息
        """
        if not signal_texts:
            return {}, {"matched": False, "reason": "empty_signals"}

        # 确保基准向量已构建
        if self._baseline_vectors is None:
            if not self.build_baselines():
                return {}, {"matched": False, "reason": "no_baselines"}

        # 编码每个信号文本
        signal_vectors = []
        for text in signal_texts:
            vec = self.encode_single(text)
            if vec is not None:
                signal_vectors.append((text, vec))

        if not signal_vectors:
            return {}, {"matched": False, "reason": "encoding_failed"}

        # 聚合所有信号的相似度
        threshold = self.config.similarity_threshold
        aggregated = np.zeros(12, dtype=np.float32)
        confidence_scores: Dict[int, float] = {}
        matched_texts: Dict[int, List[str]] = {i: [] for i in range(12)}

        for text, vec in signal_vectors:
            sims = self._cosine_similarity(vec)
            for i in range(12):
                if sims[i] >= threshold:
                    aggregated[i] = max(aggregated[i], sims[i])  # 取最强信号
                    matched_texts[i].append(text)

        # 归一化聚合激活值
        max_val = aggregated.max()
        if max_val > 0:
            activations = {}
            for i in range(12):
                if aggregated[i] >= threshold:
                    # 将相似度映射到 [0.3, 1.0] 作为激活值
                    normalized = 0.3 + 0.7 * (aggregated[i] / max_val) * aggregated[i]
                    activations[i] = float(min(1.0, normalized))
                    confidence_scores[i] = float(aggregated[i])
                else:
                    confidence_scores[i] = 0.0
        else:
            activations = {}
            for i in range(12):
                confidence_scores[i] = 0.0

        # 元数据
        metadata = {
            "matched": len(activations) > 0,
            "threshold": threshold,
            "confidence_scores": confidence_scores,
            "matched_texts": matched_texts,
            "total_signals": len(signal_texts),
            "model_used": "sentence-transformers" if self._model_available else "tfidf",
        }

        # 增量存储高置信度匹配
        for need_id, matched_list in matched_texts.items():
            for mtext in matched_list:
                vec = self.encode_single(mtext)
                sim = confidence_scores.get(need_id, 0.0)
                self.vector_store.add_user_vector(
                    text=mtext,
                    vector=vec,
                    demand_id=need_id,
                    similarity=sim,
                    metadata={"lang": lang, "source": "embedding_match"},
                )

        return activations, metadata

    # ============================================================
    # 生成 DemandSet（兼容原有接口）
    # ============================================================

    def match_to_demand_set(
        self,
        signal_texts: List[str],
        source_text: str = "",
        lang: str = "auto",
    ) -> DemandSet:
        """
        匹配并生成 DemandSet，格式与 parse_demands_by_keywords() 完全兼容。

        Args:
            signal_texts: 信号文本列表
            source_text: 原始用户输入
            lang: 语言

        Returns:
            DemandSet 对象
        """
        activations, metadata = self.match(signal_texts, lang)

        demand_set = DemandSet(source_text=source_text, timestamp=time.time())

        if not activations:
            return demand_set

        # 检测冲突关键词（提升 intent）
        from .demands import CONFLICT_KEYWORDS
        has_conflict = any(kw in source_text for kw in CONFLICT_KEYWORDS)

        for need_id, activation in activations.items():
            confidence = metadata.get("confidence_scores", {}).get(need_id, 0.5)

            demand = Demand(
                id=need_id,
                urgency=min(1.0, activation),
                importance=min(1.0, activation * 0.9 + confidence * 0.1),
                resource_dep=0.3,
                intent=0.7 if has_conflict else min(0.9, activation),
                reason=f"语义匹配(相似度:{confidence:.2f})",
            )
            demand_set.add(demand)

        return demand_set

    # ============================================================
    # 便捷方法
    # ============================================================

    def get_per_dimension_stats(self) -> Dict[str, any]:
        """获取各维度统计信息（用于前端展示）"""
        stats = self.vector_store.get_demand_stats()
        return {
            NeedMeta.get_name(i): {
                "count": s["count"],
                "avg_similarity": s["avg_similarity"],
            }
            for i, s in stats.items()
        }

    def is_available(self) -> bool:
        """检查匹配器是否可用"""
        return self._model_available or self._tfidf_matcher is not None

    def get_model_name(self) -> str:
        """获取当前使用的模型名称"""
        if self._model_available:
            return self.config.model_name
        elif self._tfidf_matcher is not None:
            return "TF-IDF (fallback)"
        return "none"
