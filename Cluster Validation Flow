# 集群验证简化流程图

## 集群验证流程

```mermaid
flowchart TD
    A[用户C1发起登录请求] --> B[B-Client接收登录请求]
    B --> C{检查用户是否为新用户}
    
    C -->|是新用户| D[直接允许登录]
    C -->|不是新用户| E[启动集群验证流程]
    
    E --> F[查询集群内其他节点]
    F --> G{是否找到有效batch?}
    
    G -->|未找到| H[视为新用户允许登录]
    G -->|找到有效batch| I[获取batch_id和第一条记录]
    
    I --> J[向C1发送验证请求]
    J --> K[C1查询本地数据库]
    
    K --> L{本地是否找到相同batch?}
    L -->|未找到| M[验证失败拒绝登录]
    L -->|找到| N[返回本地batch数据]
    
    N --> O[B-Client进行数据比对]
    O --> P{数据是否完全匹配?}
    
    P -->|不匹配| Q[验证失败数据不一致]
    P -->|完全匹配| R[验证成功允许登录]
    
    R --> S[发送login_success消息给C1]
    Q --> T[发送验证失败消息]
    M --> T
    H --> U[发送新用户登录成功消息]
    D --> U
    
    %% 样式定义
    classDef startEnd fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef process fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef decision fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef success fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef failure fill:#ffebee,stroke:#c62828,stroke-width:2px
    
    class A,S startEnd
    class B,E,F,I,J,K,N,O process
    class C,G,L,P decision
    class D,H,R,U success
    class M,Q,T failure
```

## 集群验证时序图

```mermaid
sequenceDiagram
    participant C1 as C1客户端
    participant B as B-Client服务
    participant C2 as C2客户端
    participant DB1 as C1数据库
    participant DB2 as C2数据库

    Note over C1, C2: 集群验证流程开始

    C1->>B: 1. login_request
    Note over C1: 用户test1发起登录请求

    B->>B: 2. 启动集群验证流程
    Note over B: 检查用户是否为新用户

    B->>C2: 3. cluster_verification_request
    Note over B: 向C2查询用户的有效batch数据

    C2->>DB2: 4. 查询用户batch数据
    DB2-->>C2: 返回batch数据
    Note over C2: 找到用户的有效batch数据

    C2->>B: 5. cluster_verification_response
    Note over C2: 返回batch数据供验证使用

    B->>C1: 6. cluster_verification_request
    Note over B: 请求C1验证相同的batch数据

    C1->>DB1: 7. 查询batch数据
    DB1-->>C1: 返回batch数据
    Note over C1: 查询本地相同的batch数据

    C1->>B: 8. cluster_verification_response
    Note over C1: 返回本地batch数据供比对

    B->>B: 9. 比对C1和C2的记录数据
    Note over B: 详细比对ID、用户ID、URL、标题等字段

    B->>C1: 10. login_success
    Note over B: 集群验证通过，用户登录成功

    Note over C1, C2: 集群验证流程完成
```

## 关键验证字段

### 数据一致性检查
- **用户标识**: `user_id` 必须完全匹配
- **活动记录**: `url`, `title`, `activity_type` 必须一致
- **时间戳**: `created_at` 必须相同
- **记录ID**: `id` 必须匹配
- **描述信息**: `description` 必须一致

### 安全验证机制
- **集群内验证**: 确保用户在同一集群内
- **数据完整性**: 防止数据篡改
- **时效性检查**: 防止重放攻击
- **节点一致性**: 多节点数据同步验证
