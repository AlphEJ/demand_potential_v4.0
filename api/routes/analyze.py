"""
DPU Agent API - DPU 分析路由

架构：
  ① LLM 语义提取（自然语言 → 需求信号词）
  ② DPU 关键词匹配 → 12 维激活
  ③ DPU 层级压制 + 冲突仲裁
  ④ LLM 自然语言回答（基于 DPU 分析结果）
"""

import os
from fastapi import APIRouter, Header, Request
from pydantic import BaseModel
from typing import List, Optional

from core.engine import DemandPotentialEngine
from core.config import DPUConfig
from core.demands import NeedMeta
from core.matrix import AssociationMatrix

router = APIRouter()


# ------------------------------------------------------------------
# 请求 / 响应模型
# ------------------------------------------------------------------
class AnalyzeRequest(BaseModel):
    text: str

class AskRequest(BaseModel):
    text: str
    activation12: List[float]
    top_needs: List[str] = []
    suppressed: List[str] = []
    conflicts: List[str] = []
    signals: List[str] = []
    question: str


def _auto_detect_llm_provider(
    header_provider: Optional[str] = None,
    header_api_key: Optional[str] = None,
):
    """
    自动检测可用的 LLM 提供商
    优先级：请求头里的 Key > 环境变量（前端 localStorage 配置优先）
    """
    if header_api_key and header_api_key.strip():
        provider = (header_provider or "").strip().lower() or "tongyi"
        # 前端传 provider=offline 表示不要用 LLM
        if provider == "offline":
            return None, {}
        return provider, {"api_key": header_api_key.strip()}

    tongyi_key = os.getenv("TONGYI_API_KEY", "").strip()
    deepseek_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if tongyi_key:
        return "tongyi", {"api_key": tongyi_key}
    elif deepseek_key:
        return "deepseek", {"api_key": deepseek_key}
    return None, {}


@router.post("/demands", summary="分析文本 → 12维需求图谱")
async def analyze_demands(
    request: AnalyzeRequest,
    x_llm_provider: Optional[str] = Header(None, alias="X-LLM-Provider"),
    x_llm_api_key: Optional[str] = Header(None, alias="X-LLM-Api-Key"),
):
    """
    前端粘贴文本后点击分析时调用。
    流程：
      1. LLM 把原文里的需求信号词挑出来（如"不认真听我说话"）
      2. DPU 对这些信号词做关键词匹配 → 12 维激活
      3. DPU 层级压制 + 冲突仲裁
      4. 返回：NeedSphere 数据 + 信号词 + 被压制需求 + 冲突需求

    请求头：
      X-LLM-Provider: tongyi/deepseek/ollama/offline
      X-LLM-Api-Key: 你的 API Key（如果传了，会覆盖 .env 里的配置）
    """
    try:
        provider, config = _auto_detect_llm_provider(x_llm_provider, x_llm_api_key)
        from core.embedding_matcher import EmbeddingConfig
        embedding_cfg = EmbeddingConfig(
            provider="local",
            similarity_threshold=0.40,
            fallback_to_keywords=True,
        )
        use_direct = provider is not None
        engine = DemandPotentialEngine(
            DPUConfig(),
            llm_provider=provider,
            llm_config=config,
            embedding_config=embedding_cfg,
        )
        output = engine.process(request.text, use_direct_llm=use_direct)

        need_by_id = {item["need_id"]: item["potential"] for item in output.demand_ranking}
        activation12 = [need_by_id.get(i, 0.0) for i in range(12)]

        signals = getattr(engine, "_llm_signals", []) or []
        signal_texts = [s.get("text", "") for s in signals if isinstance(s, dict)]

        top = []
        for item in output.demand_ranking[:5]:
            need_id = item["need_id"]
            name = NeedMeta.NAMES[need_id] if 0 <= need_id < len(NeedMeta.NAMES) else f"D{need_id}"
            top.append(f"{name} {int(item.get('potential', 0) * 100)}%")

        return {
            "success": True,
            "activation12": activation12,
            "top_needs": top,
            "suppressed": output.suppressed or [],
            "conflicts": output.conflicts or [],
            "signals": signal_texts,
            "llm_context": getattr(engine, "_llm_context", None),
            "llm_available": provider is not None,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/ask", summary="基于 DPU 分析结果问 AI")
async def ask_ai(
    request: AskRequest,
    x_llm_provider: Optional[str] = Header(None, alias="X-LLM-Provider"),
    x_llm_api_key: Optional[str] = Header(None, alias="X-LLM-Api-Key"),
):
    """前端问 AI 时调用（基于 DPU 的分析结果，AI 不自己重新分析）。"""
    try:
        provider, config = _auto_detect_llm_provider(x_llm_provider, x_llm_api_key)
        if provider is None:
            return {
                "success": False,
                "answer": "（没有配置 LLM API Key。可以在项目根目录的 .env 文件里填写 TONGYI_API_KEY=... 或 DEEPSEEK_API_KEY=...）"
            }

        engine = DemandPotentialEngine(DPUConfig(), llm_provider=provider, llm_config=config)
        dpu_context = {
            "activation12": request.activation12,
            "top_needs": request.top_needs,
            "suppressed": request.suppressed,
            "conflicts": request.conflicts,
            "signals": request.signals,
        }
        answer = engine._llm_client.reply_based_on_dpu(
            user_input=request.text,
            dpu_context=dpu_context,
            user_question=request.question,
        )
        return {"success": True, "answer": answer}
    except Exception as e:
        return {"success": False, "answer": f"（LLM 调用失败：{str(e)}）"}


class TraceRequest(BaseModel):
    text: str

class TraceFeedbackRequest(BaseModel):
    from_id: int
    to_id: int
    is_correct: bool  # True=路径对, False=路径不对


@router.post("/trace", summary="分析文本 → 推理路径追踪（那根线）")
async def trace_path(
    request: TraceRequest,
    x_llm_provider: Optional[str] = Header(None, alias="X-LLM-Provider"),
    x_llm_api_key: Optional[str] = Header(None, alias="X-LLM-Api-Key"),
):
    """
    PathTracer 接口 —— 把 DPU 的黑盒打分变成可见的传导路径

    返回：
      - nodes: 根节点 + L1传导 + L2传导
      - edges: 节点之间的连接（关联度、传导值、边类型）
      - root_nodes: 直接激活的需求 ID
      - conflict_pairs: 冲突互斥对
    """
    try:
        provider, config = _auto_detect_llm_provider(x_llm_provider, x_llm_api_key)
        from core.embedding_matcher import EmbeddingConfig
        embedding_cfg = EmbeddingConfig(
            provider="local",
            similarity_threshold=0.40,
            fallback_to_keywords=True,
        )
        use_direct = provider is not None
        engine = DemandPotentialEngine(
            DPUConfig(),
            llm_provider=provider,
            llm_config=config,
            embedding_config=embedding_cfg,
        )
        output = engine.process(request.text, use_direct_llm=use_direct)

        # 追踪推理路径
        path = engine.trace_path(output)
        path_dict = path.to_dict()

        # 同时返回基础分析数据（避免前端发两次请求）
        need_by_id = {item["need_id"]: item["potential"] for item in output.demand_ranking}
        activation12 = [need_by_id.get(i, 0.0) for i in range(12)]

        return {
            "success": True,
            "path": path_dict,
            "activation12": activation12,
            "source_text": request.text,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/trace/feedback", summary="用户反馈路径对错（切掉重连）")
async def trace_feedback(request: TraceFeedbackRequest):
    """
    用户标记某条传导路径是对还是错
    - is_correct=True → 关联度提升 10%
    - is_correct=False → 关联度降低 20%（切掉重连）
    """
    try:
        # 用临时引擎实例做修改（PathTracer 的修改存在实例内存中）
        engine = DemandPotentialEngine(DPUConfig())
        if request.is_correct:
            engine.mark_path_right(request.from_id, request.to_id)
            action = "提升"
        else:
            engine.mark_path_wrong(request.from_id, request.to_id)
            action = "降低"

        return {
            "success": True,
            "message": f"已{action} {NeedMeta.NAMES.get(request.from_id, 'D'+str(request.from_id))} → {NeedMeta.NAMES.get(request.to_id, 'D'+str(request.to_id))} 的关联度",
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/matrix", summary="获取12x12关联矩阵")
async def get_matrix():
    """获取 12 维需求关联矩阵"""
    try:
        matrix = AssociationMatrix()
        matrix_data = matrix.get_matrix_data()
        needs = [NeedMeta.get_name(i) for i in range(12)]
        return {"success": True, "matrix": matrix_data.tolist(), "needs": needs}
    except Exception as e:
        return {"success": False, "matrix": [], "needs": [], "error": str(e)}


@router.get("/formulas", summary="获取计算公式说明")
async def get_formulas():
    """获取 DPU 势能计算的公式说明"""
    formulas = {
        "P_base（基础势能）": "P_base = Level_factor × (w2×(E×I) + w3×(1-R) + w4×Intent_Gate) + w1×Level  E=紧急度 I=重要度 R=资源依赖度",
        "P_couple（耦合势能）": "P_couple = P_base × max(Couple_min_reserve, Corr_avg + Excl_max)",
        "P_final（最终势能）": "P_final = P_couple × (1 - Suppression_factor)",
        "层级压制": "当某层级的平均激活值超过阈值时，对上层需求施加压制：Suppression_factor = base^n（n 为层级差）",
        "冲突仲裁": "当两个需求的关联度低于互斥阈值时触发互斥，势能较低的需求被标记为冲突状态",
        "权重约束": "w1(层级) + w2(紧急×重要) + w3(资源) + w4(意图) = 1.0，默认值 0.35/0.30/0.20/0.15",
    }
    return {"success": True, "formulas": formulas}
