# B-Client Render.com 部署指南

## 1. 准备工作

### 1.1 创建Render.com账户
- 访问 [Render.com](https://render.com)
- 注册账户（支持GitHub/GitLab登录）

### 1.2 准备代码仓库
- 将B-Client代码推送到GitHub/GitLab仓库
- 确保代码包含所有必要的配置文件

## 2. 部署方式选择

### 方式1：使用render.yaml（推荐）
使用提供的 `render.yaml` 配置文件进行一键部署。

### 方式2：使用Docker
使用提供的 `Dockerfile` 进行容器化部署。

### 方式3：手动配置
通过Render.com控制台手动配置。

## 3. 使用render.yaml部署

### 3.1 连接GitHub仓库
1. 登录Render.com控制台
2. 点击 "New" → "Blueprint"
3. 选择你的GitHub仓库
4. Render会自动检测 `render.yaml` 文件

### 3.2 配置自动部署
```yaml
services:
  - type: web
    name: b-client
    env: python
    plan: free
    buildCommand: pip install -r requirements.txt
    startCommand: python run.py
    envVars:
      - key: B_CLIENT_ENVIRONMENT
        value: production
      - key: HOST
        value: 0.0.0.0
      - key: PORT
        value: 3000
      - key: DEBUG
        value: false
    healthCheckPath: /api/health
    autoDeploy: false  # 设置为true启用自动部署
```

## 4. 使用Docker部署

### 4.1 创建Web Service
1. 在Render.com控制台点击 "New" → "Web Service"
2. 选择你的GitHub仓库
3. 配置以下设置：
   - **Build Command**: `docker build -t b-client .`
   - **Start Command**: `docker run -p $PORT:3000 b-client`
   - **Environment**: `Docker`

### 4.2 Docker配置
```dockerfile
FROM python:3.10-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV B_CLIENT_ENVIRONMENT=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DEBUG=false
EXPOSE 3000
CMD ["python", "run.py"]
```

## 5. 环境变量配置

### 5.1 必需的环境变量
在Render.com控制台的Environment Variables中添加：

```bash
B_CLIENT_ENVIRONMENT=production
HOST=0.0.0.0
PORT=3000
DEBUG=false
```

### 5.2 NSN生产环境配置
确保B端能够与生产环境NSN交互：

```bash
NSN_PRODUCTION_URL=https://comp693nsnproject.pythonanywhere.com
NSN_PRODUCTION_HOST=comp693nsnproject.pythonanywhere.com
NSN_PRODUCTION_PORT=443
```

### 5.3 可选的环境变量
```bash
# 数据库配置（如果需要）
DATABASE_URL=sqlite:///b_client_secure.db

# 日志级别
LOG_LEVEL=INFO

# 安全配置
SECRET_KEY=your-secret-key-here
```

## 6. 域名和SSL配置

### 6.1 自定义域名
1. 在Render.com控制台点击你的服务
2. 进入 "Settings" → "Custom Domains"
3. 添加你的域名
4. 配置DNS记录指向Render提供的IP

### 6.2 SSL证书
- Render.com自动提供免费SSL证书
- 支持Let's Encrypt自动续期

## 7. 监控和日志

### 7.1 健康检查
- 健康检查端点：`/api/health`
- 自动监控服务状态
- 失败时自动重启

### 7.2 日志查看
1. 在Render.com控制台点击你的服务
2. 进入 "Logs" 标签
3. 实时查看应用日志
4. 支持日志下载和搜索

## 8. 数据库配置

### 8.1 SQLite数据库
- 使用内置SQLite数据库
- 数据存储在容器文件系统中
- 重启服务会丢失数据（免费计划）

### 8.2 持久化数据库（推荐）
考虑使用Render.com的PostgreSQL服务：
1. 创建PostgreSQL数据库
2. 获取连接字符串
3. 更新环境变量：
   ```bash
   DATABASE_URL=postgresql://username:password@host:port/database
   ```

## 9. WebSocket支持

### 9.1 Render.com WebSocket支持
- ✅ **支持WebSocket连接**
- ✅ **支持实时通信**
- ✅ **支持长连接**
- ✅ **完整B端功能**

### 9.2 配置注意事项
- 确保WebSocket服务器正常启动
- 检查防火墙和网络配置
- 监控连接状态

## 10. 性能优化

### 10.1 免费计划限制
- CPU: 0.1 CPU
- 内存: 512MB RAM
- 带宽: 100GB/月
- 睡眠: 15分钟无活动后休眠

### 10.2 升级建议
- 付费计划提供更好的性能
- 无休眠时间
- 更多CPU和内存资源
- 更好的网络性能

## 11. NSN交互测试

### 11.1 测试NSN连接
部署完成后，测试B端与NSN的连接：

```bash
# 测试NSN状态API
curl https://your-render-app.onrender.com/api/nsn/status

# 预期响应
{
  "success": true,
  "nsn_url": "https://comp693nsnproject.pythonanywhere.com",
  "status": "online",
  "response_time": 0.5
}
```

### 11.2 测试B端NSN集成
```bash
# 测试用户信息查询
curl -X POST https://your-render-app.onrender.com/api/nsn/user-info \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser"}'

# 测试登录功能
curl -X POST https://your-render-app.onrender.com/api/nsn/login \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "password"}'
```

### 11.3 验证配置
确保B端正确连接到生产环境NSN：
- ✅ NSN状态显示为"online"
- ✅ 响应时间正常（< 2秒）
- ✅ API调用返回正确响应

## 12. 故障排除

### 12.1 常见问题

#### 构建失败
```bash
# 检查requirements.txt
pip install -r requirements.txt

# 检查Python版本
python --version
```

#### 启动失败
```bash
# 检查环境变量
echo $B_CLIENT_ENVIRONMENT
echo $PORT

# 检查端口绑定
netstat -tlnp | grep :3000
```

#### WebSocket连接失败
```bash
# 检查WebSocket服务器状态
curl http://localhost:3000/api/c-client/status
```

### 11.2 日志分析
```bash
# 查看构建日志
# 查看运行时日志
# 检查错误信息
```

## 12. 备份和恢复

### 12.1 代码备份
- 使用Git版本控制
- 定期推送到远程仓库
- 创建发布标签

### 12.2 数据备份
- 导出数据库数据
- 备份配置文件
- 记录环境变量

## 13. 安全配置

### 13.1 环境变量安全
- 不要在代码中硬编码敏感信息
- 使用Render.com的环境变量功能
- 定期轮换密钥

### 13.2 网络安全
- 启用HTTPS
- 配置CORS策略
- 限制访问IP（如果需要）

## 14. 部署检查清单

- [ ] 代码推送到Git仓库
- [ ] render.yaml配置正确
- [ ] 环境变量设置完成
- [ ] 数据库配置正确
- [ ] WebSocket功能测试
- [ ] 健康检查端点正常
- [ ] SSL证书配置完成
- [ ] 自定义域名配置（如果需要）
- [ ] 监控和日志配置
- [ ] 备份策略制定

## 15. 联系支持

如果遇到问题：
- 查看Render.com文档
- 检查应用日志
- 联系Render.com支持
- 查看GitHub Issues
