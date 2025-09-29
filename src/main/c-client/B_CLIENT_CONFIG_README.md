# C-Client B-Client Configuration

## 概述

C-Client 现在支持配置连接到不同的 B-Client 环境：
- **Local B-Client**: 本地开发环境的 B-Client
- **Production B-Client**: 生产环境的 B-Client 服务器

## 配置文件

配置文件位置：`src/main/c-client/config.json`

```json
{
  "b_client_websocket": {
    "enabled": true,
    "host": "localhost",
    "port": 8766,
    "auto_reconnect": true,
    "reconnect_interval": 30
  },
  "b_client_environment": {
    "current": "local",
    "local": {
      "name": "Local B-Client",
      "host": "localhost",
      "port": 8766,
      "description": "Connect to local B-Client for development"
    },
    "production": {
      "name": "Production B-Client",
      "host": "comp639nsn.pythonanywhere.com",
      "port": 8766,
      "description": "Connect to production B-Client server"
    }
  }
}
```

## 环境配置

### Local 环境
- **名称**: Local B-Client
- **主机**: localhost
- **端口**: 8766
- **用途**: 本地开发和测试

### Production 环境
- **名称**: Production B-Client
- **主机**: comp639nsn.pythonanywhere.com
- **端口**: 8766
- **用途**: 生产环境部署

## 使用方法

### 1. 通过配置界面
C-Client 启动后，会显示一个配置按钮，点击可以打开配置界面：
- 选择环境（Local 或 Production）
- 配置连接参数
- 设置 WebSocket 选项

### 2. 通过配置文件
直接编辑 `config.json` 文件：
```json
{
  "b_client_environment": {
    "current": "production"  // 切换到生产环境
  }
}
```

### 3. 通过代码
```javascript
const BClientConfigManager = require('./config/bClientConfigManager');
const configManager = new BClientConfigManager();

// 切换到生产环境
configManager.setCurrentEnvironment('production');

// 更新环境配置
configManager.updateEnvironmentConfig('production', {
  host: 'your-b-client-server.com',
  port: 8766
});
```

## API 接口

### IPC 接口
- `b-client-config:get` - 获取当前配置
- `b-client-config:set-environment` - 设置当前环境
- `b-client-config:update-environment` - 更新环境配置
- `b-client-config:update-websocket` - 更新 WebSocket 配置
- `show-b-client-config` - 显示配置界面

### 配置管理器方法
- `getCurrentEnvironment()` - 获取当前环境
- `setCurrentEnvironment(env)` - 设置当前环境
- `getEnvironmentConfig(env)` - 获取环境配置
- `updateEnvironmentConfig(env, config)` - 更新环境配置
- `getWebSocketConfig()` - 获取 WebSocket 配置
- `updateWebSocketConfig(config)` - 更新 WebSocket 配置

## 网络架构

```
┌─────────────────┐    WebSocket    ┌─────────────────┐
│   C-Client      │ ──────────────► │   B-Client      │
│  (家庭环境)      │    ws://ip:8766  │  (公网服务器)    │
│                 │                 │                 │
│ 环境配置:        │                 │ 服务器配置:      │
│ - local         │                 │ - 0.0.0.0:8766  │
│ - production    │                 │ - 等待连接       │
└─────────────────┘                 └─────────────────┘
```

## 部署说明

### 本地测试
1. 启动本地 B-Client 服务器
2. C-Client 配置选择 "Local B-Client"
3. 连接地址：`ws://localhost:8766`

### 生产环境
1. 部署 B-Client 到公网服务器
2. C-Client 配置选择 "Production B-Client"
3. 连接地址：`ws://comp639nsn.pythonanywhere.com:8766`

## 故障排除

### 连接失败
1. 检查 B-Client 服务器是否运行
2. 检查网络连接
3. 检查防火墙设置
4. 验证配置参数

### 配置不生效
1. 重启 C-Client 应用
2. 检查配置文件格式
3. 查看控制台日志

## 开发说明

### 添加新环境
```javascript
configManager.updateEnvironmentConfig('staging', {
  name: 'Staging B-Client',
  host: 'staging-b-client.example.com',
  port: 8766,
  description: 'Staging environment for testing'
});
```

### 自定义配置界面
修改 `src/main/c-client/config/bClientConfigModal.js` 中的 HTML 和样式。

## 测试

运行配置测试：
```bash
cd src/main/c-client
node test-config.js
```

这将测试所有配置功能并显示结果。
