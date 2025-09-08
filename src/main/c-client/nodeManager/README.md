# 节点管理器 (Node Manager)

## 功能概述

节点管理器负责管理本地用户的节点状态，确保系统中只有一个活跃的当前节点。

## 主要功能

### 1. 启动时节点验证 (`StartupValidator`)
- **`validateOnStartup()`**: 项目启动时自动验证节点状态
- **`getStartupStatus()`**: 获取启动验证的详细状态报告

### 2. 节点管理 (`NodeManager`)
- **`validateCurrentNodeOnStartup()`**: 验证当前节点状态，确保只有1个 `is_current=1`
- **`fixMultipleCurrentNodes()`**: 修复多个当前节点的问题
- **`setCurrentNode(userId)`**: 设置指定用户为当前节点
- **`getCurrentNode()`**: 获取当前节点信息
- **`clearCurrentNode()`**: 清除当前节点标记
- **`registerNewUserIfNeeded()`**: 如果 `local_users` 表为空，提示用户注册新用户名
- **`getUserCount()`**: 获取用户总数

## 数据库字段

### `local_users` 表新增字段
- **`is_current`**: INTEGER 类型，默认值 0
  - `0`: 非当前节点
  - `1`: 当前活跃节点

## 使用示例

### 在项目启动时自动验证
```javascript
const { StartupValidator } = require('./nodeManager');

const startupValidator = new StartupValidator();
await startupValidator.validateOnStartup();
```

### 手动管理节点状态
```javascript
const { NodeManager } = require('./nodeManager');

const nodeManager = new NodeManager();

// 设置当前节点
nodeManager.setCurrentNode('user123');

// 获取当前节点信息
const currentNode = nodeManager.getCurrentNode();

// 清除当前节点标记
nodeManager.clearCurrentNode();
```

## 验证规则

1. **正常状态**: 所有用户的 `is_current` 都为 0，或者只有一个用户的 `is_current` 为 1
2. **异常状态**: 多个用户的 `is_current` 为 1
3. **自动修复**: 当检测到多个当前节点时，自动保留第一个，其他设为 0

## 集成说明

节点验证功能已集成到主应用程序的启动流程中，会在以下时机自动执行：
- 应用程序初始化时
- 历史管理器初始化完成后
- 主窗口创建之前

## 用户注册时机

用户注册弹框会在以下时机显示：
- **主窗口完全加载完成后**（包括所有资源加载完毕）
- **延迟1秒后**检查是否需要用户注册
- **确保用户界面完全可用**后再显示弹框

## 用户注册功能

当 `local_users` 表为空时，系统会在主窗口加载完成后自动显示用户注册弹框：
- **弹框类型**: HTML页面内嵌弹框（非独立窗口）
- **弹框位置**: 主页面中央，带半透明背景遮罩
- **弹框内容**: "请输入新用户名" 提示、输入框、确定/取消按钮
- **显示时机**: 主窗口完全加载完成后延迟1秒
- **用户ID生成**: 基于当前时间和公网IP地址生成UUID
- **字段设置**: 
  - `domain_id`, `cluster_id`, `channel_id` 设为空
  - `ip_address` 使用当前公网IP
  - `is_current` 设为 1（当前节点）

## 弹框实现方式

用户注册弹框现在集成在主页面中，而不是独立的Electron窗口：
- **HTML结构**: 弹框HTML直接嵌入到 `src/pages/index.html`
- **CSS样式**: 弹框样式定义在 `src/pages/style.css`
- **JavaScript逻辑**: 弹框逻辑集成在 `src/pages/renderer.js`
- **IPC通信**: 通过 `submit-username` 处理器与主进程通信
- **响应式设计**: 支持移动端和桌面端的自适应布局

## 日志输出

所有操作都会输出详细的日志信息，包括：
- 验证开始和完成状态
- 发现的节点数量统计
- 修复操作的详细信息
- 错误和异常情况
