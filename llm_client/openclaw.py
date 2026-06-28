"""需求势能3.0 - OpenClaw执行层客户端"""
import os
import requests
import json
from typing import Optional
from .base import LLMClient, LLMResponse


class OpenClawClient(LLMClient):
    """OpenClaw本地执行客户端，通过HTTP调用OpenClaw网关"""

    def __init__(self, base_url: str = "http://localhost:18789",
                 token: str = "", model: str = "qwen/qwen3.5-plus",
                 token_env: str = "OPENCLAW_TOKEN"):
        # 调用父类初始化
        super().__init__(base_url=base_url, api_key=token, model=model)
        
        # 优先从环境变量获取 token（更安全）
        self.token = os.environ.get(token_env, token)
        self.model = model

    def chat(self, messages: list, temperature: float = 0.7,
             max_tokens: int = 4096) -> LLMResponse:
        """发送消息给OpenClaw执行"""
        headers = {
            "Content-Type": "application/json",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        try:
            response = requests.post(
                f"{self.base_url}/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=120  # 执行任务可能需要较长时间
            )
            response.raise_for_status()
            data = response.json()

            content = data["choices"][0]["message"]["content"]
            usage = None
            if "usage" in data and data["usage"]:
                usage = {
                    "prompt_tokens": data["usage"].get("prompt_tokens", 0),
                    "completion_tokens": data["usage"].get("completion_tokens", 0),
                }

            return LLMResponse(
                content=content,
                model=self.model,
                usage=usage,
                error=None
            )

        except requests.exceptions.ConnectionError:
            return LLMResponse(
                content="❌ 无法连接到OpenClaw服务。请确认：\n1. OpenClaw已安装\n2. 已运行 openclaw gateway --port 18789\n3. 端口18789未被占用",
                model=self.model,
                usage=None,
                error="Connection failed"
            )
        except requests.exceptions.Timeout:
            return LLMResponse(
                content="⏰ OpenClaw执行超时（120秒）。任务可能过于复杂，请尝试拆分任务。",
                model=self.model,
                usage=None,
                error="Timeout"
            )
        except Exception as e:
            return LLMResponse(
                content=f"❌ OpenClaw调用失败：{str(e)}",
                model=self.model,
                usage=None,
                error=str(e)
            )

    def analyze_demand(self, user_input: str) -> Optional[dict]:
        """OpenClaw不负责需求分析，返回None让引擎使用规则降级"""
        return None

    def generate(self, prompt: str, system_prompt=None, **kwargs) -> LLMResponse:
        """生成文本（实现抽象方法）"""
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        temperature = kwargs.get("temperature", 0.7)
        max_tokens = kwargs.get("max_tokens", 4096)
        
        return self.chat(messages, temperature, max_tokens)

    def get_model_name(self) -> str:
        """获取模型名称（实现抽象方法）"""
        return f"OpenClaw-{self.model}"

    def check_connection(self) -> bool:
        """检查OpenClaw是否在运行"""
        try:
            headers = {}
            if self.token:
                headers["Authorization"] = f"Bearer {self.token}"
            # 直接检测根路径，不调用工具，更轻量
            response = requests.get(
                f"{self.base_url}/",
                headers=headers,
                timeout=10
            )
            return response.status_code == 200
        except:
            return False