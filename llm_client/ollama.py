"""
Ollama本地模型客户端
"""

from typing import Optional
import requests
from .base import LLMClient, LLMResponse


class OllamaClient(LLMClient):
    """Ollama本地模型客户端"""
    
    DEFAULT_BASE_URL = "http://localhost:11434"
    
    def __init__(self, model: str = "llama3.2", base_url: Optional[str] = None, **kwargs):
        self.model = model
        self.base_url = base_url or self.DEFAULT_BASE_URL
        super().__init__(base_url=self.base_url, **kwargs)
    
    def generate(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> LLMResponse:
        """生成文本"""
        try:
            # 构建prompt
            full_prompt = prompt
            if system_prompt:
                full_prompt = f"{system_prompt}\n\n{prompt}"
            
            response = requests.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": full_prompt,
                    "stream": False,
                    "options": {
                        "temperature": kwargs.get("temperature", 0.7),
                    }
                },
                timeout=60
            )
            
            if response.status_code == 200:
                data = response.json()
                return LLMResponse(
                    content=data.get("response", ""),
                    model=self.model,
                )
            else:
                return LLMResponse(
                    content="",
                    model=self.model,
                    error=f"HTTP {response.status_code}: {response.text}"
                )
        except Exception as e:
            return LLMResponse(content="", model=self.model, error=str(e))
    
    def get_model_name(self) -> str:
        return f"Ollama-{self.model}"
    
    def list_models(self) -> list:
        """列出本地可用的模型"""
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=5)
            if response.status_code == 200:
                data = response.json()
                return [m["name"] for m in data.get("models", [])]
            return []
        except:
            return []
