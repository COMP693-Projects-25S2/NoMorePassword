# 节点分配逻辑优化 - 支持主节点离线场景

## 🔧 问题

**原逻辑：**
```python
if cluster_id not in self.cluster_pool or not self.cluster_pool[cluster_id]:
    logger.error(f"No connections in cluster pool")
    return False  # ❌ 直接失败
```

**问题：**
- ❌ 如果主节点不在线，池为空
- ❌ 无法分配新节点
- ❌ 必须等待主节点上线

## ✅ 解决方案

**新逻辑：**
```python
cluster_connections = self.cluster_pool.get(cluster_id, [])

if cluster_connections:
    # 有连接，可以count peers
    cluster_connection = cluster_connections[0]
    channel_count = await self.count_peers(cluster_connection, ...)
    
    if channel_count >= 1000:
        return False
else:
    # 没有连接，跳过peer count
    logger.info(f"⚠️ No connections in cluster pool, skipping peer count")
    logger.info(f"   → Directly assigning (assuming it's available)")

# 继续执行分配逻辑...
response = await self.send_to_c_client(connection, command)
if response.get("success"):
    self.add_to_cluster_pool(cluster_id, connection)
    return True
```

**优点：**
- ✅ 主节点离线时也能分配节点
- ✅ 跳过peer count检查
- ✅ 直接分配，假设容量可用
- ✅ 主节点上线后会绑定到已有的池

## 📊 场景分析

### 场景1：主节点在线（正常流程）

```python
# 1. 主节点已在cluster_pool中
cluster_pool['cluster-1'] = [MainNode]

# 2. 新节点要加入
assign_to_cluster(NewNode, 'cluster-1', ...)

# 3. 执行流程
→ 找到MainNode连接
→ 通过MainNode.countPeers()获取当前channel数量
→ 如果<1000，分配成功
→ 如果>=1000，返回False（满了）
```

### 场景2：主节点离线（新逻辑支持）

```python
# 1. 主节点不在线，cluster_pool为空或没有这个cluster
cluster_pool = {}  # 或 cluster_pool['cluster-1'] = []

# 2. 新节点要加入
assign_to_cluster(NewNode, 'cluster-1', ...)

# 3. 执行流程
→ 没有连接，无法count peers
→ ⚠️ 跳过peer count检查
→ 直接分配（假设容量可用）
→ 分配成功
→ 创建cluster_pool['cluster-1'] = [NewNode]

# 4. 主节点后续上线
→ 添加到cluster_pool['cluster-1'] = [NewNode, MainNode]
→ 下次分配可以正常count peers了
```

### 场景3：部分节点在线

```python
# 1. 有一些普通节点在线（主节点离线）
cluster_pool['cluster-1'] = [RegularNode1, RegularNode2]

# 2. 新节点要加入
assign_to_cluster(NewNode, 'cluster-1', ...)

# 3. 执行流程
→ 找到RegularNode1连接
→ 尝试通过RegularNode1.countPeers()
→ 如果成功：使用返回的count判断
→ 如果失败：⚠️ 跳过检查，直接分配
```

## 🔍 代码变化

### assign_to_channel

**修改前：**
```python
if channel_id not in self.channel_pool or not self.channel_pool[channel_id]:
    logger.error(f"No connections in channel pool")
    return False  # ❌ 直接返回失败
```

**修改后：**
```python
channel_connections = self.channel_pool.get(channel_id, [])

if channel_connections:
    # 尝试count peers
    try:
        node_count = await self.count_peers(...)
        if node_count >= 1000:
            return False
    except:
        logger.warning("Failed to count, proceeding anyway")
else:
    # 跳过count，直接分配
    logger.info("No connections, skipping peer count")
    logger.info("→ Directly assigning")

# 继续分配...
```

### assign_to_cluster

同样的逻辑变化。

### assign_to_domain

同样的逻辑变化。

## 📋 日志示例

### 主节点在线时

```
📊 Found 1 connection(s) in channel pool, counting peers...
📊 Current nodes in channel: 5
✅ Channel has capacity (5 < 1000)
→ Proceeding with assignment
✅ Successfully assigned to channel
```

### 主节点离线时

```
⚠️ No connections in channel pool fd93b6f3..., skipping peer count
   → Directly assigning to channel (assuming it's available)
✅ Successfully assigned to channel
```

### Count失败时

```
📊 Found 1 connection(s) in channel pool, counting peers...
⚠️ Failed to count peers: Timeout, proceeding with assignment anyway
→ Directly assigning to channel (assuming it's available)
✅ Successfully assigned to channel
```

## ✅ 好处

1. **容错性** - 主节点离线不影响分配
2. **灵活性** - 支持多种在线状态
3. **可用性** - 新节点始终能被分配
4. **渐进式** - 主节点上线后自动恢复完整功能

## 🧪 测试场景

### 测试1：主节点离线场景

```
1. 清空B端连接池
2. 启动C端NodeA（普通节点，domain_id='xxx'）
3. NodeA连接到B端
→ 应该成功分配，即使没有主节点
→ domain_pool['xxx'] = [NodeA]
```

### 测试2：主节点后续上线

```
1. NodeA已连接（普通节点）
2. 启动NodeB（主节点，domain_id='xxx', is_main=True）
3. NodeB连接到B端
→ domain_pool['xxx'] = [NodeA, NodeB(MAIN)]
→ 后续分配可以通过NodeB count peers
```

### 测试3：使用Node Test模拟多设备

```
1. 创建3个用户（Alice, Bob, Charlie）
2. 点击"Node Test"生成不同node_id
3. 用Alice登录并连接 → 分配成功（主节点不在线）
4. 用Bob登录并连接 → 分配成功（主节点不在线）
5. 用Charlie登录并连接 → 分配成功（主节点不在线）
→ 所有节点都应该在B端显示
```

## 📝 修改文件

- ✅ `src/main/b-client-new/nodeManager.py`
  - `assign_to_channel()` - 支持主节点离线
  - `assign_to_cluster()` - 支持主节点离线
  - `assign_to_domain()` - 支持主节点离线

