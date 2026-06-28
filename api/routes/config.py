"""
DPU Agent API - 配置路由
提供 LLM 配置和 DPU 参数的查询与修改接口
"""

import json
import os
from pathlib import Path
from fastapi import APIRouter
from typing import Dict, Any, List

from api.models import (
    LLMConfig,
    LLMConfigResponse,
    DPUConfigRequest,
    DPUConfigResponse,
    SimpleResponse,
)
from core.config import DPUConfig, default_config
from llm_client.factory import LLMFactory

# 安全：启动时加载 .env 文件
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

router = APIRouter()

# ===== 配置文件路径 =====
_CONFIG_FILE = Path(__file__).parent.parent.parent / "config.json"

# ===== 默认 LLM 配置 =====
_DEFAULT_LLM_CONFIG: Dict[str, Any] = {
    "provider": "tongyi",
    "model": "qwen-plus",
    "api_key": None,
    "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "temperature": 0.7,
    "max_tokens": 2048,
}


def _load_config() -> Dict[str, Any]:
    """
    从文件加载配置，API Key 优先从环境变量读取（安全策略）
    
    Returns:
        配置字典
    """
    if _CONFIG_FILE.exists():
        try:
            with open(_CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                # 合并默认配置和文件配置
                config = _DEFAULT_LLM_CONFIG.copy()
                if "llm" in data:
                    config.update(data["llm"])
        except Exception:
            config = _DEFAULT_LLM_CONFIG.copy()
    else:
        config = _DEFAULT_LLM_CONFIG.copy()

    # 安全：如果配置文件中无 API Key，从环境变量读取
    if not config.get("api_key"):
        provider = config.get("provider", "tongyi")
        env_key_map = {
            "tongyi": "TONGYI_API_KEY",
            "deepseek": "DEEPSEEK_API_KEY",
        }
        env_var = env_key_map.get(provider)
        if env_var:
            config["api_key"] = os.environ.get(env_var)

    return config


def _save_config(config: Dict[str, Any]) -> bool:
    """
    保存配置到文件
    
    Args:
        config: 配置字典
        
    Returns:
        是否保存成功
    """
    try:
        # 读取现有配置
        existing = {}
        if _CONFIG_FILE.exists():
            with open(_CONFIG_FILE, "r", encoding="utf-8") as f:
                existing = json.load(f)
        
        # 更新 LLM 配置
        existing["llm"] = {
            "provider": config.get("provider"),
            "model": config.get("model"),
            "api_key": config.get("api_key"),
            "base_url": config.get("base_url"),
            "temperature": config.get("temperature"),
            "max_tokens": config.get("max_tokens"),
        }
        
        # 写入文件
        with open(_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(existing, f, indent=2, ensure_ascii=False)
        
        return True
    except Exception:
        return False


# ===== 运行时 LLM 配置（从文件加载）=====
_runtime_llm_config: Dict[str, Any] = _load_config()


@router.get("/llm", response_model=LLMConfigResponse, summary="获取LLM配置")
async def get_llm_config() -> LLMConfigResponse:
    """
    获取当前 LLM 配置和可用提供商列表

    Returns:
        当前 LLM 配置和可用提供商信息
    """
    # 获取可用提供商列表
    providers = []
    for provider_name in LLMFactory.list_providers():
        info = LLMFactory.get_provider_info(provider_name)
        providers.append(info)

    # API Key 脱敏显示
    api_key = _runtime_llm_config.get("api_key")
    api_key_masked = None
    if api_key:
        # 只显示前4位和后4位
        api_key_masked = f"{api_key[:4]}...{api_key[-4:]}" if len(api_key) > 8 else "***"

    config = LLMConfig(
        provider=_runtime_llm_config.get("provider", "tongyi"),
        model=_runtime_llm_config.get("model", "qwen-plus"),
        api_key=None,  # 不返回完整 API Key
        api_key_masked=api_key_masked,
        base_url=_runtime_llm_config.get("base_url"),
        temperature=_runtime_llm_config.get("temperature", 0.7),
        max_tokens=_runtime_llm_config.get("max_tokens", 2048),
    )

    return LLMConfigResponse(
        success=True,
        config=config,
        available_providers=providers,
    )


@router.put("/llm", response_model=SimpleResponse, summary="更新LLM配置")
async def update_llm_config(config: LLMConfig) -> SimpleResponse:
    """
    更新 LLM 配置

    Args:
        config: 新的 LLM 配置

    Returns:
        操作结果
    """
    global _runtime_llm_config

    try:
        # 验证提供商是否支持
        supported_providers = LLMFactory.list_providers()
        if config.provider not in supported_providers:
            supported = ", ".join(supported_providers)
            return SimpleResponse(
                success=False,
                message=f"不支持的提供商: {config.provider}。支持的提供商: {supported}",
            )

        # 构建新配置（保留未更新的字段）
        new_config = _runtime_llm_config.copy()
        new_config["provider"] = config.provider
        new_config["model"] = config.model
        new_config["temperature"] = config.temperature
        new_config["max_tokens"] = config.max_tokens
        
        # 只在提供了新 API Key 时更新
        if config.api_key:
            new_config["api_key"] = config.api_key
        
        # Base URL 更新
        if config.base_url:
            new_config["base_url"] = config.base_url

        # 保存到文件
        if not _save_config(new_config):
            return SimpleResponse(
                success=False,
                message="配置保存到文件失败",
            )

        # 更新运行时配置
        _runtime_llm_config = new_config

        return SimpleResponse(
            success=True,
            message=f"LLM 配置已保存: {config.provider}/{config.model}",
        )

    except Exception as e:
        return SimpleResponse(
            success=False,
            message=f"更新配置失败: {str(e)}",
        )


@router.get("/dpu", response_model=DPUConfigResponse, summary="获取DPU参数配置")
async def get_dpu_config() -> DPUConfigResponse:
    """
    获取当前 DPU 引擎参数配置

    Returns:
        当前 DPU 配置字典
    """
    config = default_config

    config_dict = {
        "w1_level": config.w1_level,
        "w2_composite": config.w2_composite,
        "w3_resource": config.w3_resource,
        "w4_intent": config.w4_intent,
        "intent_threshold": config.intent_threshold,
        "couple_min_reserve": config.couple_min_reserve,
        "decay_rate": config.decay_rate,
        "aging_delta": config.aging_delta,
        "load_factor": config.load_factor,
        "suppression_trigger": config.suppression_trigger,
        "suppression_base": config.suppression_base,
        "strong_exclusion_threshold": config.strong_exclusion_threshold,
        "enable_chaos": config.enable_chaos,
        "chaos_range": config.chaos_range,
    }

    return DPUConfigResponse(
        success=True,
        config=config_dict,
    )


@router.put("/dpu", response_model=SimpleResponse, summary="更新DPU参数")
async def update_dpu_config(config: DPUConfigRequest) -> SimpleResponse:
    """
    更新 DPU 引擎参数配置

    只更新请求中提供的非 None 字段。
    注意：权重之和必须为 1.0。

    Args:
        config: DPU 配置更新请求

    Returns:
        操作结果
    """
    try:
        # 构建更新字典（只包含非 None 值）
        update_fields = config.model_dump(exclude_none=True)

        if not update_fields:
            return SimpleResponse(
                success=True,
                message="未提供需要更新的参数",
            )

        # 验证权重之和
        weight_fields = ["w1_level", "w2_composite", "w3_resource", "w4_intent"]
        provided_weights = {k: v for k, v in update_fields.items() if k in weight_fields}

        if provided_weights:
            total = sum(provided_weights.values())
            if abs(total - 1.0) > 0.01:
                return SimpleResponse(
                    success=False,
                    message=f"权重之和必须为 1.0，当前提供的权重之和为 {total:.2f}",
                )

        # 更新全局默认配置
        for key, value in update_fields.items():
            if hasattr(default_config, key):
                setattr(default_config, key, value)

        updated_keys = ", ".join(update_fields.keys())
        return SimpleResponse(
            success=True,
            message=f"DPU 配置已更新: {updated_keys}",
        )

    except Exception as e:
        return SimpleResponse(
            success=False,
            message=f"更新配置失败: {str(e)}",
        )
