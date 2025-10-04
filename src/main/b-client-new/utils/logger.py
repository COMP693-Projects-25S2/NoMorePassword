"""
B-Client Logging System
统一管理B端所有模块的日志输出
"""
import os
import logging
import logging.handlers
from datetime import datetime
from pathlib import Path
import sys

class BClientLogger:
    """B-Client日志管理器"""
    
    def __init__(self, log_dir="logs"):
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(exist_ok=True)
        
        # 生成日志文件名（模块_启动日期_时间）
        start_time = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.start_time = start_time
        
        # 日志文件路径
        self.main_log_file = self.log_dir / f"bclient_main_{start_time}.log"
        self.websocket_log_file = self.log_dir / f"bclient_websocket_{start_time}.log"
        self.nodemanager_log_file = self.log_dir / f"bclient_nodemanager_{start_time}.log"
        self.sync_log_file = self.log_dir / f"bclient_sync_{start_time}.log"  # 统一的sync日志文件
        self.sync_manager_log_file = self.log_dir / f"bclient_sync_{start_time}.log"  # 重定向到sync文件
        self.routes_log_file = self.log_dir / f"bclient_routes_{start_time}.log"
        self.app_log_file = self.log_dir / f"bclient_app_{start_time}.log"
        
        # 初始化各个模块的logger
        self._setup_loggers()
    
    def _setup_loggers(self):
        """设置各个模块的logger"""
        # 主应用logger
        self.main_logger = self._create_logger(
            'bclient_main',
            self.main_log_file,
            level=logging.INFO
        )
        
        # WebSocket模块logger
        self.websocket_logger = self._create_logger(
            'bclient_websocket',
            self.websocket_log_file,
            level=logging.INFO
        )
        
        # NodeManager模块logger
        self.nodemanager_logger = self._create_logger(
            'bclient_nodemanager',
            self.nodemanager_log_file,
            level=logging.INFO
        )
        
        # SyncManager模块logger
        self.sync_manager_logger = self._create_logger(
            'bclient_sync_manager',
            self.sync_manager_log_file,
            level=logging.INFO
        )
        
        # Routes模块logger
        self.routes_logger = self._create_logger(
            'bclient_routes',
            self.routes_log_file,
            level=logging.INFO
        )
        
        # App模块logger
        self.app_logger = self._create_logger(
            'bclient_app',
            self.app_log_file,
            level=logging.INFO
        )
    
    def _create_logger(self, name, log_file, level=logging.INFO):
        """创建logger实例"""
        logger = logging.getLogger(name)
        logger.setLevel(level)
        
        # 避免重复添加handler
        if logger.handlers:
            return logger
        
        # 文件handler - 使用RotatingFileHandler防止日志文件过大
        file_handler = logging.handlers.RotatingFileHandler(
            log_file,
            maxBytes=10*1024*1024,  # 10MB
            backupCount=5,
            encoding='utf-8'
        )
        file_handler.setLevel(level)
        
        # 控制台handler - 只显示重要信息
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(logging.WARNING)  # 只显示WARNING及以上级别
        
        # 日志格式
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        
        file_handler.setFormatter(formatter)
        console_handler.setFormatter(formatter)
        
        logger.addHandler(file_handler)
        logger.addHandler(console_handler)
        
        return logger
    
    def get_logger(self, module_name):
        """根据模块名获取对应的logger"""
        module_map = {
            'websocket': self.websocket_logger,
            'nodemanager': self.nodemanager_logger,
            'sync_manager': self.sync_manager_logger,
            'routes': self.routes_logger,
            'app': self.app_logger,
            'main': self.main_logger
        }
        return module_map.get(module_name, self.main_logger)
    
    def log_startup_info(self):
        """记录启动信息"""
        self.main_logger.info("=" * 60)
        self.main_logger.info(f"B-Client Starting at {datetime.now()}")
        self.main_logger.info(f"Log files created:")
        self.main_logger.info(f"  Main: {self.main_log_file}")
        self.main_logger.info(f"  WebSocket: {self.websocket_log_file}")
        self.main_logger.info(f"  NodeManager: {self.nodemanager_log_file}")
        self.main_logger.info(f"  SyncManager: {self.sync_manager_log_file}")
        self.main_logger.info(f"  Routes: {self.routes_log_file}")
        self.main_logger.info(f"  App: {self.app_log_file}")
        self.main_logger.info("=" * 60)

# 全局logger实例
bclient_logger = BClientLogger()

def get_bclient_logger(module_name):
    """获取B端模块logger的便捷函数"""
    return bclient_logger.get_logger(module_name)

# 重写print函数，将print输出也记录到日志
class PrintToLogger:
    """将print输出重定向到日志"""
    
    def __init__(self, logger):
        self.logger = logger
        self.original_print = print
    
    def __call__(self, *args, **kwargs):
        # 调用原始print
        self.original_print(*args, **kwargs)
        
        # 将输出也记录到日志
        message = ' '.join(str(arg) for arg in args)
        if message.strip():  # 只记录非空消息
            self.logger.info(message)

# 替换print函数
def setup_print_redirect(module_name):
    """设置print重定向到日志"""
    logger = get_bclient_logger(module_name)
    return PrintToLogger(logger)
