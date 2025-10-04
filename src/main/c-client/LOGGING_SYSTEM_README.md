# C-Client 日志管理系统

## 概述
已为C-Client创建了完整的日志管理系统，将各模块的日志输出统一管理并保存到专用日志文件夹中。

## 文件结构
```
src/main/c-client/
├── utils/
│   └── logger.js                   # C端日志管理器
├── logs/                          # 日志文件夹（自动创建）
│   ├── cclient_main_YYYYMMDD_HHMMSS.log
│   ├── cclient_websocket_YYYYMMDD_HHMMSS.log
│   ├── cclient_nodemanager_YYYYMMDD_HHMMSS.log
│   ├── cclient_tabmanager_YYYYMMDD_HHMMSS.log
│   ├── cclient_viewmanager_YYYYMMDD_HHMMSS.log
│   ├── cclient_history_YYYYMMDD_HHMMSS.log
│   ├── cclient_ipc_YYYYMMDD_HHMMSS.log
│   └── cclient_app_YYYYMMDD_HHMMSS.log
└── utils/
    └── replace_console_logs.py    # 控制台日志替换脚本
```

## 已集成的模块

### 1. main.js (ElectronApp)
- ✅ 导入日志系统
- ✅ 在类中初始化logger

### 2. websocket/cClientWebSocketClient.js
- ✅ 导入日志系统
- ✅ 在类中初始化logger

### 3. nodeManager/nodeManager.js
- ✅ 导入日志系统
- ✅ 在类中初始化logger

### 4. window/tabManager.js
- ✅ 导入日志系统
- ✅ 在类中初始化logger

### 5. window/viewManager.js
- ✅ 导入日志系统
- ✅ 在类中初始化logger

### 6. history/historyManager.js
- ✅ 导入日志系统
- ✅ 在类中初始化logger

### 7. ipc/ipcHandlers.js
- ✅ 导入日志系统
- ✅ 在类中初始化logger

## 日志级别
- **DEBUG**: 调试信息（详细状态、参数等）
- **INFO**: 一般信息（连接、注册、操作等）
- **WARN**: 警告信息（连接问题、重试等）
- **ERROR**: 错误信息（连接失败、异常等）

## 日志文件命名规则
- 格式: `cclient_模块名_YYYYMMDD_HHMMSS.log`
- 示例: `cclient_websocket_20241220_143025.log`

## 日志文件管理
- **文件大小**: 无限制（可根据需要添加轮转）
- **编码**: UTF-8
- **格式**: `时间戳 - 模块名 - 级别 - 消息`

## 使用方法

### 在代码中使用logger
```javascript
const { getCClientLogger } = require('../utils/logger');

class YourClass {
    constructor() {
        this.logger = getCClientLogger('your_module');
    }
    
    someMethod() {
        this.logger.info('这是一条信息日志');
        this.logger.warn('这是一条警告日志');
        this.logger.error('这是一条错误日志');
        this.logger.debug('这是一条调试日志');
    }
}
```

### 控制台输出
- 所有级别的日志都会显示在控制台（带模块前缀）
- 所有级别的日志都会写入文件

## 已完成的console.log替换
- ✅ WebSocket连接管理相关
- ✅ 节点管理相关
- ✅ Tab管理相关
- ✅ View管理相关
- ✅ 历史记录管理相关
- ✅ IPC处理相关
- ✅ 应用主进程相关

## 控制台日志替换脚本
提供了 `replace_console_logs.py` 脚本来自动替换console.log语句：
```bash
cd utils
python replace_console_logs.py
```

## 注意事项
1. 日志文件夹会在首次运行时自动创建
2. 每个启动会话都会创建新的日志文件
3. 保留必要的系统启动和心跳日志
4. 所有日志都会同时显示在控制台和文件中
5. 支持emoji前缀的日志消息自动识别和级别分类
