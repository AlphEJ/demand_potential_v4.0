"""
LLM客户端工厂
统一管理多个LLM客户端（无状态版本）
"""

from typing import Optional, Dict, Type, Any
from .base import LLMClient
from .tongyi import TongyiClient
from .deepseek import DeepSeekClient
from .ollama import OllamaClient
from .openclaw import OpenClawClient


class LLMFactoryError(Exception):
    """LLM工厂异常"""
    pass


class LLMFactory:
    """
    LLM客户端工厂（无状态版本）
    
    注意：此类不再使用类变量存储客户端实例。
    客户端实例应该由调用方存储在 session_state 或其他地方。
    """
    
    # 支持的客户端类型
    CLIENTS: Dict[str, Type[LLMClient]] = {
        "tongyi": TongyiClient,
        "deepseek": DeepSeekClient,
        "ollama": OllamaClient,
        "openclaw": OpenClawClient,
    }
    
    # 默认配置
    DEFAULT_CONFIGS: Dict[str, Dict[str, Any]] = {
        "tongyi": {"model": "qwen-plus"},
        "deepseek": {"model": "deepseek-chat"},
        "ollama": {"model": "llama3.2", "base_url": "http://localhost:11434"},
        "openclaw": {"model": "qwen/qwen3.5-plus", "base_url": "http://localhost:18789"},
    }
    
    @classmethod
    def create_client(cls, provider: str, **kwargs) -> LLMClient:
        """
        创建客户端
        
        Args:
            provider: 提供商名称
            **kwargs: 客户端配置参数
        
        Returns:
            LLMClient 实例
        
        Raises:
            LLMFactoryError: 如果提供商不支持或创建失败
        """
        if provider not in cls.CLIENTS:
            supported = ", ".join(cls.CLIENTS.keys())
            raise LLMFactoryError(f"不支持的提供商: {provider}。支持的提供商: {supported}")
        
        client_class = cls.CLIENTS[provider]
        
        # 合并默认配置
        config = cls.DEFAULT_CONFIGS.get(provider, {}).copy()
        config.update(kwargs)
        
        try:
            client = client_class(**config)
            return client
        except Exception as e:
            raise LLMFactoryError(f"创建 {provider} 客户端失败: {e}")
    
    @classmethod
    def get_client(cls, provider: str, **kwargs) -> LLMClient:
        """
        创建客户端（create_client 的别名，保持向后兼容）

        Args:
            provider: 提供商名称
            **kwargs: 客户端配置参数

        Returns:
            LLMClient 实例
        """
        return cls.create_client(provider, **kwargs)

    @classmethod
    def get_default_config(cls, provider: str) -> Dict[str, Any]:
        """
        获取提供商的默认配置
        
        Args:
            provider: 提供商名称
        
        Returns:
            默认配置字典
        """
        return cls.DEFAULT_CONFIGS.get(provider, {}).copy()
    
    @classmethod
    def list_providers(cls) -> list:
        """列出所有支持的提供商"""
        return list(cls.CLIENTS.keys())
    
    @classmethod
    def get_provider_info(cls, provider: str) -> Dict[str, Any]:
        """
        获取提供商信息
        
        Args:
            provider: 提供商名称
        
        Returns:
            提供商信息字典
        """
        if provider not in cls.CLIENTS:
            return {}
        
        info = {
            "name": provider,
            "class": cls.CLIENTS[provider].__name__,
            "default_config": cls.DEFAULT_CONFIGS.get(provider, {}),
        }
        
        # 添加友好名称
        name_map = {
            "tongyi": "通义千问 (阿里云)",
            "deepseek": "DeepSeek",
            "ollama": "Ollama (本地)",
            "openclaw": "OpenClaw (执行层)",
        }
        info["display_name"] = name_map.get(provider, provider)
        
        return info
    
    @classmethod
    def test_connection(cls, provider: str, **kwargs) -> Dict[str, Any]:
        """
        测试连接
        
        Args:
            provider: 提供商名称
            **kwargs: 客户端配置参数
        
        Returns:
            测试结果字典 {"success": bool, "message": str, "latency_ms": float}
        """
        import time
        
        result = {
            "success": False,
            "message": "",
            "latency_ms": 0.0
        }
        
        try:
            client = cls.create_client(provider, **kwargs)
            
            start_time = time.time()
            response = client.generate("你好", max_tokens=10)
            end_time = time.time()
            
            result["latency_ms"] = (end_time - start_time) * 1000
            
            if response.is_success:
                result["success"] = True
                result["message"] = f"连接成功 (延迟: {result['latency_ms']:.0f}ms)"
            else:
                result["message"] = f"连接失败: {response.error or '未知错误'}"
            
        except LLMFactoryError as e:
            result["message"] = str(e)
        except Exception as e:
            result["message"] = f"测试失败: {str(e)}"
        
        return result
