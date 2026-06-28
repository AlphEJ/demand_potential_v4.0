"""
DPU Agent 工具函数
从 pages/08_agent_execute.py 的 LocalExecutor 中提取并改造为独立函数
支持：网页搜索、文件操作、系统信息、URL打开等
"""

import os
import sys
import json
import subprocess
import webbrowser
import datetime
import platform
from typing import Dict, Any, Optional
from urllib.parse import urlparse, quote


# ==================== 安全配置 ====================

# 允许打开的应用白名单（防止命令注入）
# 安全：已移除 cmd.exe 和 powershell.exe，防止 LLM 诱导执行任意命令
ALLOWED_APPS = {
    "win32": {
        "notepad": "notepad.exe",
        "calc": "calc.exe",
        "calculator": "calc.exe",
        "explorer": "explorer.exe",
        "paint": "mspaint.exe",
        "wordpad": "write.exe",
        "chrome": "chrome.exe",
        "edge": "msedge.exe",
    },
    "darwin": {
        "finder": "Finder",
        "safari": "Safari",
        "chrome": "Google Chrome",
        "textedit": "TextEdit",
        "calculator": "Calculator",
        "notes": "Notes",
    },
}

# 允许访问的目录白名单前缀
ALLOWED_PATH_PREFIXES = [
    os.path.expanduser("~"),
    os.path.join(os.path.expanduser("~"), "Desktop"),
    os.path.join(os.path.expanduser("~"), "Documents"),
    os.path.join(os.path.expanduser("~"), "Downloads"),
    os.path.join(os.path.expanduser("~"), "Temp"),
]

# 最大文件大小限制（10MB）
MAX_FILE_SIZE = 10 * 1024 * 1024


# ==================== 安全验证函数 ====================

def validate_path(path: str) -> tuple:
    """
    验证路径安全性

    Args:
        path: 待验证的文件路径

    Returns:
        (是否安全, 错误消息) 元组
    """
    try:
        expanded_path = os.path.expanduser(path)
        abs_path = os.path.abspath(expanded_path)

        # 检查是否在允许的目录范围内
        is_allowed = any(
            abs_path.startswith(os.path.abspath(prefix))
            for prefix in ALLOWED_PATH_PREFIXES
        )

        if not is_allowed:
            return False, f"路径不在允许范围内: {path}"

        # 检查路径遍历攻击
        if ".." in path and "~" not in path and not os.path.isabs(path):
            if not path.startswith("~") and not os.path.isabs(path):
                return False, "只允许使用 ~ 开头或绝对路径"

        return True, ""
    except Exception as e:
        return False, f"路径验证失败: {str(e)}"


def sanitize_url(url: str) -> tuple:
    """
    验证 URL 安全性

    Args:
        url: 待验证的 URL

    Returns:
        (是否安全, 规范化URL或错误消息) 元组
    """
    try:
        parsed = urlparse(url)

        if parsed.scheme not in ("http", "https"):
            return False, "只允许 http/https 协议"

        if not parsed.netloc:
            return False, "URL 格式无效"

        return True, url
    except Exception as e:
        return False, f"URL验证失败: {str(e)}"


# ==================== 工具函数 ====================

def tool_search_web(query: str) -> Dict[str, Any]:
    """
    搜索网页（直接在浏览器中打开搜索结果）

    Args:
        query: 搜索关键词

    Returns:
        执行结果字典 {"success": bool, "message": str, "url": str}
    """
    from urllib.parse import quote
    encoded_query = quote(query, safe="")
    url = f"https://www.bing.com/search?q={encoded_query}"
    
    try:
        webbrowser.open(url)
        return {"success": True, "message": f"已在浏览器中搜索: {query}", "url": url, "query": query}
    except Exception as e:
        return {"success": False, "message": f"搜索失败: {str(e)}", "url": url}


def tool_open_url(url: str) -> Dict[str, Any]:
    """
    打开网页（直接在浏览器中打开）

    Args:
        url: 目标 URL

    Returns:
        执行结果字典
    """
    is_valid, result = sanitize_url(url)
    if not is_valid:
        return {"success": False, "message": f"URL验证失败: {result}"}

    try:
        webbrowser.open(result)
        return {"success": True, "message": f"已在浏览器中打开: {result}", "url": result}
    except Exception as e:
        return {"success": False, "message": f"打开网页失败: {str(e)}", "url": result}


def tool_open_app(app_name: str) -> Dict[str, Any]:
    """
    打开本地应用（白名单验证）

    Args:
        app_name: 应用名称

    Returns:
        执行结果字典
    """
    platform_apps = ALLOWED_APPS.get(sys.platform, {})
    normalized_name = app_name.lower().strip()

    if normalized_name not in platform_apps:
        allowed_list = ", ".join(platform_apps.keys())
        return {
            "success": False,
            "message": f"应用不在白名单中: {app_name}。允许的应用: {allowed_list}"
        }

    try:
        actual_app = platform_apps[normalized_name]

        if sys.platform == "win32":
            subprocess.Popen([actual_app], shell=False)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", "-a", actual_app], shell=False)
        else:
            subprocess.Popen([actual_app], shell=False)

        return {"success": True, "message": f"已启动应用: {app_name}"}
    except FileNotFoundError:
        return {"success": False, "message": f"应用不存在: {app_name}"}
    except Exception as e:
        return {"success": False, "message": f"启动应用失败: {str(e)}"}


def tool_create_file(path: str, content: str) -> Dict[str, Any]:
    """
    创建文件（安全验证版）

    Args:
        path: 文件路径
        content: 文件内容

    Returns:
        执行结果字典
    """
    is_valid, error = validate_path(path)
    if not is_valid:
        return {"success": False, "message": error}

    content_size = len(content.encode("utf-8"))
    if content_size > MAX_FILE_SIZE:
        return {"success": False, "message": f"文件内容过大 ({content_size} bytes > {MAX_FILE_SIZE} bytes)"}

    try:
        expanded_path = os.path.expanduser(path)

        dir_path = os.path.dirname(expanded_path)
        if dir_path:
            os.makedirs(dir_path, exist_ok=True)

        with open(expanded_path, "w", encoding="utf-8") as f:
            f.write(content)

        return {"success": True, "message": f"已创建文件: {expanded_path}"}
    except PermissionError:
        return {"success": False, "message": f"无权限写入: {path}"}
    except Exception as e:
        return {"success": False, "message": f"创建文件失败: {str(e)}"}


def tool_open_folder(path: str) -> Dict[str, Any]:
    """
    打开文件夹

    Args:
        path: 文件夹路径

    Returns:
        执行结果字典
    """
    is_valid, error = validate_path(path)
    if not is_valid:
        return {"success": False, "message": error}

    try:
        expanded_path = os.path.expanduser(path)

        if not os.path.exists(expanded_path):
            os.makedirs(expanded_path, exist_ok=True)

        if sys.platform == "win32":
            os.startfile(expanded_path)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", expanded_path], shell=False)
        else:
            subprocess.Popen(["xdg-open", expanded_path], shell=False)

        return {"success": True, "message": f"已打开文件夹: {expanded_path}"}
    except PermissionError:
        return {"success": False, "message": f"无权限访问: {path}"}
    except Exception as e:
        return {"success": False, "message": f"打开文件夹失败: {str(e)}"}


def tool_list_files(path: str) -> Dict[str, Any]:
    """
    列出目录下的文件

    Args:
        path: 目录路径

    Returns:
        执行结果字典
    """
    is_valid, error = validate_path(path)
    if not is_valid:
        return {"success": False, "message": error}

    try:
        expanded_path = os.path.expanduser(path)

        if not os.path.exists(expanded_path):
            return {"success": False, "message": f"路径不存在: {expanded_path}"}

        items = os.listdir(expanded_path)
        file_list = []
        for item in items[:20]:  # 最多显示20个
            full_path = os.path.join(expanded_path, item)
            if os.path.isdir(full_path):
                file_list.append(f"[DIR] {item}/")
            else:
                size = os.path.getsize(full_path)
                file_list.append(f"[FILE] {item} ({size} bytes)")

        return {"success": True, "message": "文件列表：\n" + "\n".join(file_list), "files": file_list}
    except PermissionError:
        return {"success": False, "message": f"无权限访问: {path}"}
    except Exception as e:
        return {"success": False, "message": f"列出文件失败: {str(e)}"}


def tool_get_system_info() -> Dict[str, Any]:
    """
    获取系统信息

    Returns:
        执行结果字典
    """
    try:
        info = {
            "os": f"{platform.system()} {platform.release()}",
            "processor": platform.processor() or "未知",
            "python_version": platform.python_version(),
            "current_time": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
        message = (
            f"操作系统: {info['os']}\n"
            f"处理器: {info['processor']}\n"
            f"Python版本: {info['python_version']}\n"
            f"当前时间: {info['current_time']}"
        )
        return {"success": True, "message": message, "data": info}
    except Exception as e:
        return {"success": False, "message": f"获取系统信息失败: {str(e)}"}


# ==================== 工具调度器 ====================

# 工具名称到函数的映射
TOOL_REGISTRY = {
    "search_web": tool_search_web,
    "open_url": tool_open_url,
    "open_app": tool_open_app,
    "create_file": tool_create_file,
    "open_folder": tool_open_folder,
    "list_files": tool_list_files,
    "system_info": tool_get_system_info,
}


def execute_tool(tool_call: Dict[str, Any]) -> Dict[str, Any]:
    """
    执行工具调用

    Args:
        tool_call: 工具调用字典，格式为 {"action": "工具名称", ...其他参数}

    Returns:
        执行结果字典 {"success": bool, "message": str, "action": str}
    """
    action = tool_call.get("action", "")

    if action not in TOOL_REGISTRY:
        return {
            "success": False,
            "message": f"未知工具操作: {action}",
            "action": action,
        }

    try:
        tool_func = TOOL_REGISTRY[action]

        # 根据不同工具提取参数
        if action == "search_web":
            result = tool_func(tool_call.get("query", ""))
        elif action == "open_url":
            result = tool_func(tool_call.get("url", ""))
        elif action == "open_app":
            result = tool_func(tool_call.get("app", ""))
        elif action == "create_file":
            result = tool_func(tool_call.get("path", ""), tool_call.get("content", ""))
        elif action == "open_folder":
            result = tool_func(tool_call.get("path", ""))
        elif action == "list_files":
            result = tool_func(tool_call.get("path", "."))
        elif action == "system_info":
            result = tool_func()
        else:
            result = {"success": False, "message": f"工具参数解析失败: {action}"}

        result["action"] = action
        return result

    except Exception as e:
        return {"success": False, "message": f"工具执行异常: {str(e)}", "action": action}


def parse_tool_calls(response_text: str) -> list:
    """
    从 LLM 响应文本中解析工具调用指令

    Args:
        response_text: LLM 生成的响应文本

    Returns:
        工具调用字典列表
    """
    import re

    pattern = r"<<<TOOL_CALL>>>(.*?)<<<END_TOOL_CALL>>>"
    matches = re.findall(pattern, response_text, re.DOTALL)

    tool_calls = []
    for match in matches:
        try:
            cmd = json.loads(match.strip())
            tool_calls.append(cmd)
        except json.JSONDecodeError:
            tool_calls.append({"action": "parse_error", "raw": match.strip()})

    return tool_calls


def strip_tool_calls(response_text: str) -> str:
    """
    从 LLM 响应文本中移除工具调用标记，返回纯净文本

    Args:
        response_text: LLM 生成的响应文本

    Returns:
        去除工具调用标记后的文本
    """
    import re
    return re.sub(
        r"<<<TOOL_CALL>>>.*?<<<END_TOOL_CALL>>>",
        "", response_text, flags=re.DOTALL
    ).strip()
