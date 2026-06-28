"""
通义千问客户端
"""

import os
from typing import Optional
from openai import OpenAI
from .base import LLMClient, LLMResponse


class TongyiClient(LLMClient):
    """通义千问客户端（阿里云DashScope）"""
    
    DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    
    def __init__(self, api_key: Optional[str] = None, model: str = "qwen-plus", base_url: Optional[str] = None, **kwargs):
        self.api_key = api_key or os.getenv("TONGYI_API_KEY")
        self.model = model
        self.base_url = base_url or self.DEFAULT_BASE_URL
        super().__init__(api_key=self.api_key, base_url=self.base_url, **kwargs)
        
        self.client = OpenAI(
            api_key=self.api_key,
            base_url=self.base_url
        )
    
    def generate(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> LLMResponse:
        """生成文本"""
        try:
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})
            
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=kwargs.get("temperature", 0.7),
                max_tokens=kwargs.get("max_tokens", 1024),
            )
            
            # 处理usage可能为None的情况
            usage = None
            if response.usage:
                usage = {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                }
            
            return LLMResponse(
                content=response.choices[0].message.content,
                model=self.model,
                usage=usage
            )
        except Exception as e:
            return LLMResponse(content="", model=self.model, error=str(e))
    
    def get_model_name(self) -> str:
        return f"通义千问-{self.model}"
