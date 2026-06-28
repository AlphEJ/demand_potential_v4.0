"""
DPU Avatar 存储层
==================
负责所有"数字分身"的持久化存储。当前使用本地 JSON 文件系统，
后续可以无侵入地替换成 SQLite / Redis / MongoDB。

每个分身一个独立的 JSON 文件：
    {STORAGE_DIR}/{avatar_id}.json

索引文件：
    {STORAGE_DIR}/_index.json   ->  所有分身的基本索引（用于快速列表）

文件结构参考 models.AvatarMemoryFile 的定义。
"""

import json
import time
import uuid
import os
import logging
from typing import List, Dict, Any, Optional

from api.models import (
    AvatarMemoryFile,
    AvatarPersona,
    AvatarRawMessage,
    AvatarDPUSnapshot,
    AvatarProfileStats,
)

logger = logging.getLogger("dpu_avatar_store")

# ============ 存储根目录 ============
# 优先使用环境变量指定的目录；否则使用项目根下 data/avatars
DEFAULT_STORAGE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "avatars",
)
STORAGE_DIR = os.environ.get("DPU_AVATAR_DIR", DEFAULT_STORAGE_DIR)
os.makedirs(STORAGE_DIR, exist_ok=True)

INDEX_FILE = os.path.join(STORAGE_DIR, "_index.json")


# ============================================================
# 辅助函数
# ============================================================

def _avatar_path(avatar_id: str) -> str:
    """返回一个分身的 JSON 文件路径"""
    return os.path.join(STORAGE_DIR, f"{avatar_id}.json")


def _safe_read_json(path: str) -> Optional[Dict[str, Any]]:
    """带容错的 JSON 读取"""
    try:
        if not os.path.exists(path):
            return None
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"读取 {path} 失败: {e}")
        return None


def _safe_write_json(path: str, data: Dict[str, Any]) -> bool:
    """带容错的 JSON 写入"""
    try:
        dir_path = os.path.dirname(path)
        if dir_path:
            os.makedirs(dir_path, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logger.warning(f"写入 {path} 失败: {e}")
        return False


# ============================================================
# 索引管理（列表页用）
# ============================================================

def _read_index() -> Dict[str, Any]:
    """读取索引文件（不存在则返回空 dict）"""
    data = _safe_read_json(INDEX_FILE)
    if data is None:
        return {"avatars": {}}
    return data


def _write_index(index: Dict[str, Any]) -> None:
    _safe_write_json(INDEX_FILE, index)


def _update_index_summary(avatar_file: AvatarMemoryFile) -> None:
    """在分身写入磁盘后，更新索引中关于这个分身的简要信息（用于列表页）"""
    index = _read_index()
    stats = avatar_file.profile_stats
    core_names = []
    if stats and stats.needs_12d_weights:
        NEED_NAMES = [
            "生理生存", "安全稳定", "社交归属", "被理解",
            "尊重认可", "认知求知", "审美价值", "自我实现",
            "自由掌控", "公平公正", "成长进阶", "超越自我",
        ]
        top = sorted(range(12), key=lambda i: stats.needs_12d_weights[i] if i < len(stats.needs_12d_weights) else 0, reverse=True)[:3]
        core_names = [NEED_NAMES[i] for i in top if stats.needs_12d_weights[i] > 0.1]

    summary = {
        "avatar_id": avatar_file.avatar_id,
        "name": avatar_file.persona.name,
        "avatar_emoji": avatar_file.persona.avatar_emoji,
        "relationship": avatar_file.persona.relationship,
        "tags": avatar_file.persona.custom_tags,
        "created_at": avatar_file.created_at,
        "updated_at": avatar_file.updated_at,
        "total_messages": stats.total_messages_analyzed if stats else 0,
        "core_needs": core_names,
        "short_desc": (avatar_file.persona.raw_description or "")[:120],
    }
    index.setdefault("avatars", {})[avatar_file.avatar_id] = summary
    _write_index(index)


# ============================================================
# 分身 CRUD
# ============================================================

def generate_avatar_id() -> str:
    """生成简短的分身 ID（不是完整的 UUID，方便分享）"""
    return f"av-{uuid.uuid4().hex[:12]}"


def create_avatar(persona: AvatarPersona) -> AvatarMemoryFile:
    """创建一个新的分身档案（还未进行 DPU 分析）"""
    avatar_id = generate_avatar_id()
    now = int(time.time() * 1000)

    file = AvatarMemoryFile(
        avatar_id=avatar_id,
        persona=persona,
        created_at=now,
        updated_at=now,
        dpu_snapshots=[],
        profile_stats=AvatarProfileStats(),
        current_need_state=[0.0] * 12,
        conversation_history=[],
    )

    path = _avatar_path(avatar_id)
    _safe_write_json(path, json.loads(file.model_dump_json()))
    _update_index_summary(file)
    logger.info(f"已创建分身: {avatar_id} ({persona.name})")
    return file


def save_avatar(avatar_file: AvatarMemoryFile) -> bool:
    """保存/更新整个分身后写索引"""
    avatar_file.updated_at = int(time.time() * 1000)
    path = _avatar_path(avatar_file.avatar_id)
    ok = _safe_write_json(path, json.loads(avatar_file.model_dump_json()))
    if ok:
        _update_index_summary(avatar_file)
    return ok


def load_avatar(avatar_id: str) -> Optional[AvatarMemoryFile]:
    """读取一个完整的分身档案"""
    path = _avatar_path(avatar_id)
    data = _safe_read_json(path)
    if not data:
        return None
    try:
        return AvatarMemoryFile(**data)
    except Exception as e:
        logger.warning(f"解析 {avatar_id} 失败: {e}")
        return None


def delete_avatar(avatar_id: str) -> bool:
    """删除一个分身（包括文件 + 索引条目）"""
    path = _avatar_path(avatar_id)
    deleted = False
    if os.path.exists(path):
        try:
            os.remove(path)
            deleted = True
        except Exception as e:
            logger.warning(f"删除 {avatar_id} 失败: {e}")

    if deleted:
        index = _read_index()
        if "avatars" in index and avatar_id in index["avatars"]:
            del index["avatars"][avatar_id]
            _write_index(index)
        logger.info(f"已删除分身: {avatar_id}")
    return deleted


def list_avatars() -> List[Dict[str, Any]]:
    """返回所有分身的简要信息列表（按更新时间倒序）"""
    index = _read_index()
    avatars = list(index.get("avatars", {}).values())
    avatars.sort(key=lambda a: a.get("updated_at", 0), reverse=True)
    return avatars


# ============================================================
# 增量更新：追加快照 / 更新画像统计
# ============================================================

def append_snapshots(avatar_file: AvatarMemoryFile, new_snapshots: List[AvatarDPUSnapshot]) -> None:
    """把一批新的 DPU 快照追加到分身上（这是增量训练的主函数）"""
    if avatar_file.dpu_snapshots is None:
        avatar_file.dpu_snapshots = []
    avatar_file.dpu_snapshots.extend(new_snapshots)


def recompute_profile_stats(avatar_file: AvatarMemoryFile) -> AvatarProfileStats:
    """基于当前所有 DPU 快照，重新计算画像统计（L3 + L5 层）"""
    NEED_NAMES_CN = [
        "生理生存", "安全稳定", "社交归属", "被理解",
        "尊重认可", "认知求知", "审美价值", "自我实现",
        "自由掌控", "公平公正", "成长进阶", "超越自我",
    ]

    snapshots = avatar_file.dpu_snapshots or []
    # 只统计"对方"说的话（is_me=False）；用户说的话不进入"他"的画像
    their_snapshots = [s for s in snapshots if not s.is_me]
    total_their = len(their_snapshots)

    if total_their == 0:
        return AvatarProfileStats(
            total_messages_analyzed=len(snapshots),
            total_their_messages=0,
            needs_12d_weights=[0.0] * 12,
            activation_counts=[0] * 12,
            suppressed_counts=[0] * 12,
            co_occurrence_matrix=[[0.0] * 12 for _ in range(12)],
            core_needs=[],
            most_suppressed_needs=[],
            dominant_emotional_tones=[],
            generated_persona_description="",
            speech_style_signature={},
        )

    # ----- 12 维权重（指数衰减：越早的权重越低） -----
    weights = [0.0] * 12
    activation_counts = [0] * 12
    suppressed_counts = [0] * 12
    co_occ = [[0.0] * 12 for _ in range(12)]

    # 按时间顺序（旧→新），用指数衰减加权
    # 越新的消息权重越高（alpha ≈ 0.9^(N-i)）
    for idx, snap in enumerate(their_snapshots):
        age_factor = 1.0 - (idx / max(1, total_their)) * 0.5  # 从 1.0 线性衰减到 0.5
        ns = snap.need_state if snap.need_state and len(snap.need_state) == 12 else [0.0] * 12
        for i in range(12):
            weights[i] += ns[i] * age_factor
            if ns[i] > 0.2:
                activation_counts[i] += 1

        # 共现矩阵
        active_ids = [i for i in range(12) if ns[i] > 0.2]
        for i in range(len(active_ids)):
            for j in range(i + 1, len(active_ids)):
                co_occ[active_ids[i]][active_ids[j]] += 1
                co_occ[active_ids[j]][active_ids[i]] += 1

        # 被压制需求计数
        for sid in snap.suppressed_need_ids or []:
            if 0 <= sid < 12:
                suppressed_counts[sid] += 1

    # 归一化权重到 0-1
    max_w = max(weights) if weights else 0
    if max_w > 0:
        weights = [w / max_w for w in weights]

    # ----- Top 核心需求 -----
    ranked = sorted(range(12), key=lambda i: weights[i], reverse=True)
    core_needs = [i for i in ranked if weights[i] > 0.35][:5]
    if not core_needs:
        core_needs = ranked[:2]

    # 最常被压制
    most_suppressed = sorted(range(12), key=lambda i: suppressed_counts[i], reverse=True)
    most_suppressed = [i for i in most_suppressed if suppressed_counts[i] > 0][:3]

    # ----- 情绪基调统计 -----
    tone_counts: Dict[str, int] = {}
    for snap in their_snapshots:
        t = snap.emotional_tone or "平静"
        tone_counts[t] = tone_counts.get(t, 0) + 1
    dominant_tones = sorted(tone_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    # ----- 说话风格特征（签名） -----
    all_texts = [s.text for s in their_snapshots]
    total_chars = sum(len(t) for t in all_texts)
    avg_len = total_chars / total_their if total_their > 0 else 0

    def count_in(text: str, chars: str) -> int:
        return sum(1 for c in text if c in chars)

    total_excl = sum(count_in(t, "!！") for t in all_texts)
    total_quest = sum(count_in(t, "?？") for t in all_texts)
    total_ellipsis = sum(count_in(t, "…") + t.count("...") + t.count("。。。") for t in all_texts)

    total_sentences = max(1, sum(max(1, len(t) / 10) for t in all_texts))
    speech_sig = {
        "sample_texts": all_texts[-5:],
        "total_chars": total_chars,
        "message_count": total_their,
    }

    # ----- 自动生成人物描述（基于 DPU 数据，纯模板，不依赖 LLM） -----
    core_names_str = "、".join(NEED_NAMES_CN[i] for i in core_needs[:3])
    top_tone = dominant_tones[0][0] if dominant_tones else "平静"
    if most_suppressed:
        suppressed_names = "、".join(NEED_NAMES_CN[i] for i in most_suppressed[:2])
        persona_desc = (
            f"从 {total_their} 条他的发言来看，他最核心的心理需求维度是「{core_names_str}」，"
            f"情绪基调以「{top_tone}」为主。他的「{suppressed_names}」需求被长期压制 "
            f"—— 这意味着他在这些方面有未被满足的期待。"
        )
    else:
        persona_desc = (
            f"基于 {total_their} 条他的发言，他最核心的心理需求维度是「{core_names_str}」，"
            f"情绪基调以「{top_tone}」为主。整体来看他的沟通风格偏理性和稳定。"
        )

    return AvatarProfileStats(
        total_messages_analyzed=len(snapshots),
        total_their_messages=total_their,
        needs_12d_weights=weights,
        activation_counts=activation_counts,
        suppressed_counts=suppressed_counts,
        co_occurrence_matrix=co_occ,
        core_needs=core_needs,
        most_suppressed_needs=most_suppressed,
        dominant_emotional_tones=[f"{tone}({count})" for tone, count in dominant_tones],
        generated_persona_description=persona_desc,
        speech_style_signature=speech_sig,
        avg_sentence_len=round(avg_len, 1),
        exclamation_ratio=round(total_excl / total_sentences, 3),
        question_ratio=round(total_quest / total_sentences, 3),
        ellipsis_ratio=round(total_ellipsis / total_sentences, 3),
    )
