# NoMorePassword - Electron Browser

一个基于 Electron 的浏览器应用，具有访问历史跟踪功能。

## 功能特性

- 🌐 基于 Electron 的现代浏览器界面
- 📊 访问历史跟踪和记录
- 🔐 用户注册和认证系统
- 🎯 双客户端架构 (C-Client 和 B-Client)
- 💾 SQLite 数据库存储
- 🔄 OAuth 认证支持
- 📱 响应式用户界面

## 技术栈

- **Electron** - 跨平台桌面应用框架
- **SQLite** - 轻量级数据库
- **Node.js** - 后端运行时
- **HTML/CSS/JavaScript** - 前端界面

## 安装和运行

### 前置要求

- Node.js (推荐 v16 或更高版本)
- npm 或 yarn

### 安装依赖

```bash
npm install
```

### 运行应用

#### 启动 C-Client (默认)
```bash
npm start
# 或
npm run start:c-client
```

#### 启动 B-Client
```bash
npm run start:b-client
```

#### 开发模式
```bash
npm run dev
npm run dev:c-client
npm run dev:b-client
```

### 构建应用

```bash
npm run build
```

## 项目结构

```
src/
├── main/                    # 主进程代码
│   ├── b-client/           # B-Client 特定代码
│   ├── window/             # 窗口管理
│   ├── sqlite/             # 数据库相关
│   ├── history/            # 历史记录管理
│   ├── ipc/                # IPC 通信处理
│   └── nodeManager/        # 节点管理
├── pages/                  # 渲染进程页面
│   ├── index.html          # 主页面
│   ├── b-client.html       # B-Client 页面
│   ├── history.html        # 历史记录页面
│   └── userRegistration.html # 用户注册页面
```

## 快捷键

- `Ctrl+Shift+I` - 打开开发者工具
- `Ctrl+T` - 新建标签页
- `F5` - 刷新页面
- `Alt+Left` - 后退
- `Alt+Right` - 前进
- `Ctrl+H` - 打开历史记录
- `Ctrl+Shift+L` - 清除本地用户

## 数据库

应用使用 SQLite 数据库存储：
- 用户信息
- 访问历史
- 会话数据

数据库文件位置：
- C-Client: `src/main/sqlite/secure.db`
- B-Client: `src/main/b-client/sqlite/b_client_secure.db`

## 开发说明

### 客户端切换

应用支持两种客户端模式：
- **C-Client**: 完整的浏览器功能
- **B-Client**: 简化的浏览器功能

### 历史记录

应用会自动记录：
- 访问的 URL
- 页面标题
- 访问时间
- 停留时长

### OAuth 认证

支持 OAuth 2.0 认证流程，包括：
- 授权码流程
- 令牌管理
- 会话保持

## 故障排除

### 常见问题

1. **应用无法启动**
   - 检查 Node.js 版本
   - 重新安装依赖: `npm install`

2. **better-sqlite3 模块版本不匹配错误**
   ```
   Error: The module was compiled against a different Node.js version
   ```
   - 运行修复命令: `npm run fix-modules`
   - 或手动执行: `npx electron-rebuild`

3. **数据库错误**
   - 检查数据库文件权限
   - 删除损坏的数据库文件重新创建

4. **OAuth 认证失败**
   - 检查网络连接
   - 验证 OAuth 配置

### 日志

应用日志会输出到控制台，包括：
- 初始化过程
- 错误信息
- 用户操作记录

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 更新日志

### v1.0.0
- 初始版本发布
- 基础浏览器功能
- 历史记录跟踪
- 双客户端支持
