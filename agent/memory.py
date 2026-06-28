"""
DPU Agent 对话记忆管理
使用 Python 列表实现轻量级对话记忆，支持上下文窗口管理
"""

from typing import List, Dict, Optional


class ConversationMemory:
    """
    对话记忆管理器

    功能：
    - 添加用户/助手消息
    - 获取最近 N 轮对话上下文
    - 清空记忆
    - 将对话历史格式化为文本（用于注入 Prompt）
    """

    def __init__(self, max_turns: int = 20):
        """
        初始化对话记忆

        Args:
            max_turns: 最大保留轮数（一轮 = 一问一答），超出后自动丢弃最早的消息
        """
        self._messages: List[Dict[str, str]] = []
        self._max_turns = max_turns

    def add_user_message(self, content: str) -> None:
        """
        添加用户消息

        Args:
            content: 用户消息内容
        """
        self._messages.append({"role": "user", "content": content})
        self._trim()

    def add_assistant_message(self, content: str) -> None:
        """
        添加助手消息

        Args:
            content: 助手回复内容
        """
        self._messages.append({"role": "assistant", "content": content})
        self._trim()

    def add_message(self, role: str, content: str) -> None:
        """
        添加任意角色消息

        Args:
            role: 消息角色（"user" 或 "assistant"）
            content: 消息内容
        """
        self._messages.append({"role": role, "content": content})
        self._trim()

    def get_recent(self, n: int = 5) -> List[Dict[str, str]]:
        """
        获取最近 N 轮对话（一轮 = 一问一答，即2条消息）

        Args:
            n: 获取的轮数

        Returns:
            最近的消息列表
        """
        return self._messages[-(n * 2):]

    def get_all(self) -> List[Dict[str, str]]:
        """
        获取全部对话历史

        Returns:
            完整消息列表
        """
        return self._messages.copy()

    def get_context_text(self, n: int = 5) -> str:
        """
        将最近 N 轮对话格式化为文本，用于注入 LLM Prompt

        Args:
            n: 获取的轮数

        Returns:
            格式化的对话上下文文本
        """
        recent = self.get_recent(n)
        if not recent:
            return ""

        lines = ["【对话历史】"]
        for msg in recent:
            role_label = "用户" if msg["role"] == "user" else "助手"
            lines.append(f"{role_label}: {msg['content']}")
        return "\n".join(lines)

    def clear(self) -> None:
        """清空全部对话记忆"""
        self._messages.clear()

    @property
    def message_count(self) -> int:
        """当前消息总数"""
        return len(self._messages)

    @property
    def turn_count(self) -> int:
        """当前对话轮数（一轮 = 一问一答）"""
        return len(self._messages) // 2

    def _trim(self) -> None:
        """裁剪超出最大轮数的旧消息"""
        max_messages = self._max_turns * 2
        if len(self._messages) > max_messages:
            self._messages = self._messages[-max_messages:]


# ===== 全局记忆实例（单例模式） =====
_global_memory: Optional[ConversationMemory] = None


def get_global_memory(max_turns: int = 20) -> ConversationMemory:
    """
    获取全局对话记忆实例（单例）

    Args:
        max_turns: 最大保留轮数（仅首次创建时生效）

    Returns:
        全局 ConversationMemory 实例
    """
    global _global_memory
    if _global_memory is None:
        _global_memory = ConversationMemory(max_turns=max_turns)
    return _global_memory


def reset_global_memory() -> None:
    """重置全局对话记忆（清空并重新创建）"""
    global _global_memory
    if _global_memory is not None:
        _global_memory.clear()
