# NSN B-Client Configuration Guide

## 配置说明

NSN项目现在使用简单的配置文件来管理B-Client API地址。

## 配置方式

### 1. 环境变量方式

设置B-Client API URL环境变量：

```bash
export B_CLIENT_API_URL=http://localhost:3000
```

### 2. 配置文件方式

1. 复制配置文件模板：
   ```bash
   cp config.env.example config.env
   ```

2. 编辑 `config.env` 文件，修改B-Client URL：
   ```bash
   # 编辑配置文件
   nano config.env
   ```

## 配置项说明

- `B_CLIENT_API_URL`: B-Client API服务器地址（默认: http://localhost:3000）

## 使用示例

### 启动开发服务器
```bash
# 使用默认配置
python run.py

# 使用环境变量
export B_CLIENT_API_URL=http://localhost:3000
python run.py

# 使用配置文件
# 先创建并编辑 config.env 文件
python run.py
```

### 修改B-Client配置
```bash
# 方法1: 修改环境变量
export B_CLIENT_API_URL=http://your-b-client-server.com:3000

# 方法2: 修改 config.env 文件
echo "B_CLIENT_API_URL=http://your-b-client-server.com:3000" > config.env
```

## 注意事项

1. **配置文件优先级**: 环境变量 > 配置文件 > 默认值
2. **重启服务**: 修改配置后需要重启NSN服务器才能生效

## 故障排除

### B-Client连接失败
- 检查 `B_CLIENT_API_URL` 配置是否正确
- 确认B-Client服务是否正在运行
- 检查网络连接和防火墙设置
