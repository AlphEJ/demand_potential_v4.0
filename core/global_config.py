"""
全局配置管理模块
将 API Key 等配置持久化保存到 config.json，所有页面共享
"""
import json
import os
from pathlib import Path

# 配置文件路径
CONFIG_FILE = Path(__file__).parent.parent / "config.json"


def load_config() -> dict:
    """加载配置文件"""
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_config(config: dict):
    """保存配置文件"""
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)


def get_api_key(provider: str) -> str:
    """获取指定 provider 的 API Key"""
    config = load_config()
    llm_config = config.get("llm", {})
    
    if provider == "tongyi":
        return llm_config.get("tongyi_api_key", "") or os.getenv("TONGYI_API_KEY", "")
    elif provider == "deepseek":
        return llm_config.get("deepseek_api_key", "") or os.getenv("DEEPSEEK_API_KEY", "")
    elif provider == "ollama":
        return llm_config.get("ollama_base_url", "http://localhost:11434")
    return ""


def set_api_key(provider: str, api_key: str, model: str = None):
    """设置 API Key"""
    config = load_config()
    if "llm" not in config:
        config["llm"] = {}
    
    if provider == "tongyi":
        config["llm"]["tongyi_api_key"] = api_key
        if model:
            config["llm"]["tongyi_model"] = model
        config["llm"]["provider"] = "tongyi"
    elif provider == "deepseek":
        config["llm"]["deepseek_api_key"] = api_key
        if model:
            config["llm"]["deepseek_model"] = model
        config["llm"]["provider"] = "deepseek"
    elif provider == "ollama":
        config["llm"]["ollama_base_url"] = api_key
        if model:
            config["llm"]["ollama_model"] = model
        config["llm"]["provider"] = "ollama"
    
    save_config(config)


def get_llm_config() -> dict:
    """获取完整的 LLM 配置"""
    config = load_config()
    return config.get("llm", {})
