# NMP系统节点管理文件和方法标注

## 📋 概述
本文档标注了c端和b端中与节点管理相关的文件和方法，以及数据库操作方法。

---

## 🔧 C-Client 节点管理

### 1. 核心节点管理文件

#### 📁 `src/main/c-client/nodeManager/distributedNodeManager.js`
**功能**: 分布式节点管理核心系统
**主要方法**:
- `registerNode(nodeInfo)` - 注册新节点到分布式系统
- `updateNode(nodeId, nodeInfo)` - 更新现有节点信息
- `getNodeById(nodeId)` - 根据ID获取节点
- `registerHeartbeat(heartbeatInfo)` - 注册节点心跳
- `updateHeartbeat(nodeId, updateData)` - 更新节点心跳
- `checkNodeHealth()` - 检查节点健康状态
- `electMainNode(nodeType, domainId, clusterId, channelId)` - 选举主节点
- `getActiveNodes(nodeType, domainId, clusterId, channelId)` - 获取活跃节点
- `getMainNode(nodeType, domainId, clusterId, channelId)` - 获取主节点
- `setMainNode(nodeType, domainId, clusterId, channelId, nodeId)` - 设置主节点
- `sendMessage(toNodeId, messageType, messageData)` - 发送消息到其他节点
- `processPendingMessages()` - 处理待处理消息
- `getNodeStatistics()` - 获取节点统计信息
- `shutdown()` - 关闭分布式节点管理器

#### 📁 `src/main/c-client/nodeManager/nodeManager.js`
**功能**: 本地节点管理
**主要方法**:
- `validateCurrentNodeOnStartup()` - 启动时验证当前节点状态
- `fixMultipleCurrentNodes()` - 修复多个当前节点问题
- `setCurrentNode(userId)` - 设置当前节点
- `getCurrentNode()` - 获取当前节点信息
- `clearCurrentNode()` - 清除当前节点标记
- `registerNewUserIfNeeded(mainWindow)` - 如需要则注册新用户
- `getUserCount()` - 获取用户总数

#### 📁 `src/main/c-client/nodeManager/startupValidator.js`
**功能**: 启动验证器
**主要方法**:
- 验证节点启动状态和配置

#### 📁 `src/main/c-client/nodeManager/index.js`
**功能**: 节点管理模块导出
**导出**: `NodeManager`, `StartupValidator`

### 2. 数据库管理文件

#### 📁 `src/main/c-client/sqlite/databaseManager.js`
**功能**: 数据库管理器 - 节点数据操作
**主要方法**:

**Domain主节点管理**:
- `addDomainMainNode(userId, username, domainId, nodeId, ipAddress)`
- `addDomainMainNodeAutoId(nodeData)`
- `getDomainMainNodeByNodeId(nodeId)`
- `updateDomainMainNode(userId, username, domainId, nodeId, ipAddress)`
- `deleteDomainMainNode(userId)`

**Cluster主节点管理**:
- `addClusterMainNode(userId, username, domainId, clusterId, nodeId, ipAddress)`
- `addClusterMainNodeAutoId(nodeData)`
- `getClusterMainNodeByNodeId(nodeId)`
- `updateClusterMainNode(userId, username, domainId, clusterId, nodeId, ipAddress)`
- `deleteClusterMainNode(userId)`

**Channel主节点管理**:
- `addChannelMainNode(userId, username, domainId, clusterId, channelId, nodeId, ipAddress)`
- `addChannelMainNodeAutoId(nodeData)`
- `getChannelMainNodeByNodeId(nodeId)`
- `updateChannelMainNode(userId, username, domainId, clusterId, channelId, nodeId, ipAddress)`
- `deleteChannelMainNode(userId)`

**Local用户管理**:
- `addLocalUser(userId, username, domainId, clusterId, channelId, nodeId, ipAddress, isCurrent)`
- `addLocalUserAutoId(nodeData)`
- `getLocalUserByNodeId(nodeId)`
- `updateLocalUser(userId, username, domainId, clusterId, channelId, nodeId, ipAddress)`
- `deleteLocalUser(userId)`
- `getCurrentLocalUser()`
- `setCurrentLocalUser(userId)`

**当前主节点信息管理**:
- `updateCurrentDomainMainNode(nodeInfo)`
- `getCurrentDomainMainNode()`
- `updateCurrentClusterMainNode(nodeInfo)`
- `getCurrentClusterMainNode()`
- `updateCurrentChannelMainNode(nodeInfo)`
- `getCurrentChannelMainNode()`
- `clearAllCurrentMainNodeInfo()`

**用户活动管理**:
- `addActivity(userId, website, url, title, description, date, time, duration)`
- `getActivitiesByUserId(userId)`
- `deleteActivitiesByUserId(userId)`

**统计和查询**:
- `getStatistics()` - 获取数据库统计信息
- `getAllNodesWithNodeId()` - 获取所有有node_id的节点
- `searchNodesByNodeId(partialNodeId)` - 根据node_id搜索节点

### 3. API客户端文件

#### 📁 `src/main/c-client/api/distributedApiClient.js`
**功能**: 分布式API客户端 - 处理c-client与b-client通信
**主要方法**:
- `registerNode(nodeInfo)` - 向域主节点注册c-client节点
- `forwardToDomainMainNode(domainId, nodeInfo)` - 转发到域主节点
- `forwardToClusterMainNode(domainId, clusterId, nodeInfo)` - 转发到集群主节点
- `forwardToChannelMainNode(domainId, clusterId, channelId, nodeInfo)` - 转发到通道主节点
- `sendHeartbeat(nodeId, nodeStatus, distributedNodeManager)` - 发送心跳
- `getNodeInfo(nodeId)` - 获取节点信息
- `getMainNodeInfo(nodeType, domainId, clusterId, channelId)` - 获取主节点信息
- `sendMessage(toNodeId, messageType, messageData)` - 发送消息
- `getPendingMessages(nodeId)` - 获取待处理消息
- `getDomainNodes()` - 获取域节点
- `getSystemStatistics()` - 获取系统统计信息
- `startHeartbeat(nodeId, distributedNodeManager)` - 开始心跳监控
- `shutdown()` - 关闭API客户端

---

## 🌐 B-Client 节点管理

### 1. 核心节点管理文件

#### 📁 `src/main/discard-b/nodeManager/bClientNodeManager.js`
**功能**: B-Client节点管理器 - 简化为用户cookie和用户账户管理
**主要方法**:

**用户Cookie管理**:
- `addUserCookie(userId, username, nodeId, cookie, autoRefresh, refreshTime)`
- `addUserCookieWithTargetUsername(userId, cClientUsername, targetUsername, nodeId, cookie, autoRefresh, refreshTime)`
- `getUserCookie(userId, username)`
- `getUserCookieByTargetUsername(userId, targetUsername)`
- `updateUserCookie(userId, username, nodeId, cookie, autoRefresh, refreshTime)`
- `deleteUserCookie(userId, username)`
- `getAllUserCookies(userId)`
- `deleteAllUserCookies(userId)`
- `getAutoRefreshCookies()`

**用户账户管理**:
- `addUserAccount(userId, username, website, account, password)`
- `addUserAccountWithDetails(userId, username, nodeId, website, account, password, email, firstName, lastName, location, registrationMethod, autoGenerated)`
- `getUserAccount(userId, username, website, account)`
- `getUserAccountsByWebsite(userId, username, website)`
- `getUserAccountByTargetUsername(userId, cClientUsername, targetUsername)`
- `updateUserAccount(userId, username, website, account, password)`
- `deleteUserAccount(userId, username, website, account)`
- `getAllUserAccounts(userId)`
- `getAllUserAccountsForStats()`

#### 📁 `src/main/discard-b/nodeManager/bClientStartupValidator.js`
**功能**: B-Client启动验证器

#### 📁 `src/main/discard-b/nodeManager/index.js`
**功能**: B-Client节点管理模块导出
**导出**: `BClientNodeManager`, `BClientStartupValidator`

### 2. 数据库管理文件

#### 📁 `src/main/discard-b/sqlite/nodeDatabase.js`
**功能**: B-Client节点数据库 - 存储domain_nodes数据
**主要方法**:

**域节点管理**:
- `addDomainNode(domainId, nodeId, ipAddress, refreshTime)`
- `getDomainNode(domainId)`
- `getDomainNodeByNodeId(nodeId)`
- `updateDomainNode(domainId, nodeId, ipAddress, refreshTime)`
- `updateDomainNodeByNodeId(nodeId, domainId, ipAddress, refreshTime)`
- `deleteDomainNode(domainId)`
- `deleteDomainNodeByNodeId(nodeId)`
- `getAllDomainNodes()`

**主节点信息管理**:
- `getDomainMainNode()` - B-Client不存储主节点信息，返回null
- `getClusterMainNode()` - B-Client不存储主节点信息，返回null
- `getChannelMainNode()` - B-Client不存储主节点信息，返回null

**刷新时间管理**:
- `updateDomainNodeRefreshTime(domainId, refreshTime)`
- `getDomainNodesNeedingRefresh(maxAgeHours)`

**查询和统计**:
- `getDomainNodesByIP(ipAddress)`
- `getDomainNodesCount()`
- `nodeIdExists(nodeId)`
- `getDomainNodesWithNodeId()`
- `getDomainNodesWithoutNodeId()`
- `searchDomainNodesByNodeId(partialNodeId)`
- `getDomainNodesByNodeIds(nodeIds)`
- `updateNodeId(domainId, newNodeId)`

### 3. API服务器文件

#### 📁 `src/main/discard-b/api/distributedApiServer.js`
**功能**: 分布式API服务器 - B-Client API服务器处理c-client请求
**主要方法**:

**节点注册和转发**:
- `handleNodeRegistration(req, res)` - 处理节点注册，存储节点信息并转发到域主节点
- `handleDomainForwarding(req, res)` - 处理域转发，B-Client作为代理/中继服务器
- `handleClusterForwarding(req, res)` - 处理集群转发
- `handleChannelForwarding(req, res)` - 处理通道转发
- `handleChannelRegistration(req, res)` - 处理通道注册完成

**心跳和通信**:
- `handleHeartbeat(req, res)` - 处理心跳
- `handleSendMessage(req, res)` - 处理发送消息
- `handleGetPendingMessages(req, res)` - 处理获取待处理消息
- `handleMarkMessageProcessed(req, res)` - 处理标记消息为已处理

**节点信息查询**:
- `handleGetNodeInfo(req, res)` - 处理获取节点信息
- `handleGetMainNodeInfo(req, res)` - 处理获取主节点信息
- `handleGetDomainNodes(req, res)` - 处理获取域节点
- `handleGetStatistics(req, res)` - 处理获取统计信息

**主节点转让**:
- `handleDomainMainNodeTransfer(req, res)` - 处理域主节点转让通知
- `updateDomainMainNodeInfo(domainId, newMainNode, newMainNodeInfo)` - 更新域主节点信息

**辅助方法**:
- `forwardRequestToNode(ipAddress, port, endpoint, data)` - 转发请求到特定节点
- `getCurrentMainNodeInfo()` - 获取当前主节点信息
- `start()` - 启动API服务器
- `stop()` - 停止API服务器

---

## 🗄️ 数据库表结构

### C-Client 数据库表:
1. **domain_main_nodes** - 域主节点表
2. **cluster_main_nodes** - 集群主节点表
3. **channel_main_nodes** - 通道主节点表
4. **channel_nodes** - 通道节点表
5. **local_users** - 本地用户表
6. **user_activities** - 用户活动表
7. **node_heartbeats** - 节点心跳表
8. **node_messages** - 节点消息表
9. **node_elections** - 节点选举表
10. **current_domain_main_node** - 当前域主节点表
11. **current_cluster_main_node** - 当前集群主节点表
12. **current_channel_main_node** - 当前通道主节点表

### B-Client 数据库表:
1. **domain_nodes** - 域节点表
2. **user_cookies** - 用户Cookie表
3. **user_accounts** - 用户账户表

---

## 🔄 节点管理流程

### 1. 节点注册流程:
1. C-Client调用`DistributedNodeManager.registerNode()`
2. 通过`DistributedApiClient.registerNode()`发送到B-Client
3. B-Client的`DistributedApiServer.handleNodeRegistration()`接收请求
4. B-Client存储节点信息到`domain_nodes`表
5. B-Client转发注册到域主节点

### 2. 心跳监控流程:
1. C-Client通过`DistributedApiClient.sendHeartbeat()`发送心跳
2. B-Client的`DistributedApiServer.handleHeartbeat()`接收心跳
3. 更新节点刷新时间
4. 返回当前主节点信息

### 3. 主节点选举流程:
1. `DistributedNodeManager.checkNodeHealth()`检查节点健康
2. 发现主节点离线时触发`electMainNode()`
3. 根据优先级和创建时间排序节点
4. 设置新的主节点并通知所有节点

### 4. 消息传递流程:
1. 发送方调用`sendMessage()`发送消息
2. 消息存储在`node_messages`表
3. 接收方调用`getPendingMessages()`获取消息
4. 处理完成后调用`markMessageProcessed()`标记为已处理

---

## 🎯 关键特性

1. **分布式架构**: 支持多层级节点管理(domain/cluster/channel/local)
2. **自动故障转移**: 主节点离线时自动选举新主节点
3. **心跳监控**: 定期检查节点健康状态
4. **消息传递**: 节点间可靠的消息通信机制
5. **数据持久化**: 所有节点信息存储在SQLite数据库中
6. **API接口**: 提供RESTful API进行节点管理操作

---

## 📝 注意事项

1. **B-Client角色**: B-Client主要作为中继服务器，不存储主节点信息
2. **C-Client角色**: C-Client是分布式节点管理的核心，负责节点注册、选举和管理
3. **数据库隔离**: C-Client和B-Client使用不同的数据库表结构
4. **错误处理**: 所有方法都包含完善的错误处理机制
5. **事件驱动**: 使用EventEmitter进行事件驱动的节点管理
