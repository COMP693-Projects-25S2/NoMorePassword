# WebSocket Integration Documentation

## 概述

本文档描述了在 C-Client 和新 B-Client 之间实现的 WebSocket 通信框架，用于替代原有的 HTTP API 交互方式。

## 架构设计

### C-Client WebSocket 服务器
- **位置**: `src/main/c-client/websocket/websocketServer.js`
- **端口**: 8765
- **功能**: 
  - 处理来自 B-Client 的 WebSocket 连接
  - 管理用户会话和 Cookie 数据
  - 广播消息给所有连接的 B-Client

### B-Client WebSocket 客户端
- **位置**: `src/main/b-client-new/app.py` (CClientWebSocketClient 类)
- **功能**:
  - 连接到 C-Client WebSocket 服务器
  - 发送 Cookie 查询和更新请求
  - 通知用户登录/登出事件
  - 同步会话数据

## 消息类型

### 1. 连接注册
```json
{
  "type": "b_client_register",
  "client_id": "b-client-20240101120000"
}
```

### 2. Cookie 查询
```json
{
  "type": "cookie_query",
  "user_id": "user123",
  "username": "testuser"
}
```

### 3. Cookie 更新
```json
{
  "type": "cookie_update",
  "user_id": "user123",
  "username": "testuser",
  "cookie": "session_id=abc123; user_token=xyz789",
  "auto_refresh": true
}
```

### 4. 用户登录通知
```json
{
  "type": "user_login",
  "user_id": "user123",
  "username": "testuser",
  "session_data": {
    "login_time": "2024-01-01T00:00:00Z",
    "ip": "127.0.0.1"
  }
}
```

### 5. 用户登出通知
```json
{
  "type": "user_logout",
  "user_id": "user123",
  "username": "testuser"
}
```

### 6. 会话同步
```json
{
  "type": "session_sync",
  "user_id": "user123",
  "session_data": {
    "last_activity": "2024-01-01T12:00:00Z",
    "status": "active"
  }
}
```

## API 端点

### B-Client 新增的 API 端点

#### 1. 检查 C-Client 连接状态
```
GET /api/c-client/status
```

#### 2. 查询 Cookie
```
POST /api/c-client/query-cookie
Content-Type: application/json

{
  "user_id": "user123",
  "username": "testuser"
}
```

#### 3. 更新 Cookie
```
POST /api/c-client/update-cookie
Content-Type: application/json

{
  "user_id": "user123",
  "username": "testuser",
  "cookie": "session_id=abc123",
  "auto_refresh": true
}
```

#### 4. 通知用户登录
```
POST /api/c-client/notify-login
Content-Type: application/json

{
  "user_id": "user123",
  "username": "testuser",
  "session_data": {}
}
```

#### 5. 通知用户登出
```
POST /api/c-client/notify-logout
Content-Type: application/json

{
  "user_id": "user123",
  "username": "testuser"
}
```

#### 6. 同步会话数据
```
POST /api/c-client/sync-session
Content-Type: application/json

{
  "user_id": "user123",
  "session_data": {}
}
```

## 测试页面

### C-Client WebSocket 测试页面
- **URL**: `http://localhost:3000/c-client-test`
- **功能**: 
  - 检查 WebSocket 连接状态
  - 测试 Cookie 查询和更新
  - 测试用户会话操作
  - 实时显示响应日志

## 启动流程

### 1. 启动 C-Client
```bash
# 在项目根目录
npm run start:c-client
```

C-Client 启动时会自动启动 WebSocket 服务器（端口 8765）。

### 2. 启动新 B-Client
```bash
# 在 src/main/b-client-new 目录
python run.py
```

B-Client 启动时会自动连接到 C-Client 的 WebSocket 服务器。

## 数据库表结构

### user_cookies 表
```sql
CREATE TABLE user_cookies (
    user_id TEXT,
    username TEXT,
    cookie TEXT,
    auto_refresh BOOLEAN,
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, username)
);
```

### user_sessions 表
```sql
CREATE TABLE user_sessions (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    session_data TEXT,
    login_time TIMESTAMP,
    logout_time TIMESTAMP,
    status TEXT DEFAULT 'inactive'
);
```

## 依赖项

### Python (B-Client)
```
websockets==11.0.3
```

### Node.js (C-Client)
```
ws==8.14.2
```

## 故障排除

### 1. WebSocket 连接失败
- 确保 C-Client 正在运行
- 检查端口 8765 是否被占用
- 查看 C-Client 控制台日志

### 2. 消息发送失败
- 检查 WebSocket 连接状态
- 验证消息格式是否正确
- 查看 B-Client 和 C-Client 的日志

### 3. 数据库错误
- 确保 SQLite 数据库文件存在
- 检查数据库权限
- 验证表结构是否正确创建

## 性能考虑

1. **连接管理**: WebSocket 连接会自动重连
2. **消息队列**: 支持异步消息处理
3. **心跳检测**: 每 30 秒发送心跳包
4. **错误处理**: 完善的错误处理和日志记录

## 安全考虑

1. **连接验证**: 客户端需要注册才能发送消息
2. **数据验证**: 所有输入数据都经过验证
3. **错误处理**: 敏感信息不会在错误消息中泄露
4. **日志记录**: 详细的操作日志用于审计

## 未来扩展

1. **消息加密**: 可以添加消息加密功能
2. **负载均衡**: 支持多个 C-Client 实例
3. **消息持久化**: 重要消息可以持久化存储
4. **监控面板**: 添加实时监控和统计功能
