"""需求势能3.0 - 日志模块"""
import logging
import sys
from pathlib import Path
from datetime import datetime
from typing import Optional


# 全局日志配置
_logging_initialized = False


def setup_logging(
    level: str = "INFO",
    log_dir: Optional[str] = None,
    log_to_console: bool = True
) -> None:
    """
    初始化日志系统
    
    Args:
        level: 日志级别 (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_dir: 日志文件目录，None则不写文件
        log_to_console: 是否输出到控制台
    """
    global _logging_initialized
    
    if _logging_initialized:
        return
    
    # 创建根日志器
    root_logger = logging.getLogger("dpu")
    root_logger.setLevel(getattr(logging, level.upper(), logging.INFO))
    
    # 日志格式
    formatter = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    
    # 控制台处理器
    if log_to_console:
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(logging.DEBUG)
        console_handler.setFormatter(formatter)
        root_logger.addHandler(console_handler)
    
    # 文件处理器
    if log_dir:
        log_path = Path(log_dir)
        log_path.mkdir(parents=True, exist_ok=True)
        
        log_file = log_path / f"dpu_{datetime.now().strftime('%Y%m%d')}.log"
        file_handler = logging.FileHandler(log_file, encoding="utf-8")
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)
    
    _logging_initialized = True


def get_logger(name: str = "dpu") -> logging.Logger:
    """
    获取日志器
    
    Args:
        name: 日志器名称，通常使用模块名
    
    Returns:
        logging.Logger 实例
    """
    # 确保基础日志已初始化
    if not _logging_initialized:
        setup_logging()
    
    return logging.getLogger(name)


class DPUError(Exception):
    """DPU基础异常"""
    pass


class LLMError(DPUError):
    """LLM相关异常"""
    pass


class ConfigError(DPUError):
    """配置相关异常"""
    pass


class SecurityError(DPUError):
    """安全相关异常"""
    pass
