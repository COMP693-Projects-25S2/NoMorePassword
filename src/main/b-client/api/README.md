# B-Client HTTP RESTful API

B-Client提供了一个HTTP RESTful API服务器，用于接收来自网站的请求，管理用户Cookie和账户信息。

## 服务器信息

- **端口**: 3000 (可在 `src/main/b-client/config/apiConfig.js` 中配置)
- **基础URL**: `http://localhost:3000`
- **协议**: HTTP/HTTPS
- **配置文件**: `src/main/b-client/config/apiConfig.js`

## API端点

### 1. 健康检查

**GET** `/health`

检查API服务器状态。

**响应示例:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "service": "B-Client API Server"
}
```

### 2. 主要绑定端点

**POST** `/bind`

处理来自网站的绑定请求。

**请求参数:**
```json
{
  "domain_id": "example.com",
  "user_id": "user123",
  "user_name": "john_doe",
  "request_type": "bind_cookie",
  "auto_refresh": true,
  "cookie": "session=abc123; user_id=456; role=traveller"
}
```

**参数说明:**
- `domain_id` (必需): 目标网站域名
- `user_id` (必需): 用户唯一标识
- `user_name` (必需): 用户名
- `request_type` (必需): 请求类型
- `auto_refresh` (可选): 是否自动刷新cookie，默认true
- `cookie` (可选): 直接提供的cookie字符串，用于request_type=1时直接保存

**支持的request_type:**

#### 2.1 自动注册操作

- `0` 或 `auto_register` - 自动为用户在目标网站注册账号并登录
  - 支持的目标网站：`comp639nsn.pythonanywhere.com` (TravelTales)

#### 2.2 绑定已存在用户

- `1` 或 `bind_existing_user` - 绑定已登录到目标网站的用户
  - 适用于用户已经用自己的账号密码登录到NSN的情况
  - **方式1**: 直接提供cookie参数，B-Client直接保存cookie
  - **方式2**: 不提供cookie参数，B-Client使用存储的账号密码重新登录获取新的session cookie
  - 方式2需要用户之前已经通过request_type=0注册过账号
  - **auto_refresh=1**: 启用自动刷新功能，B-Client会：
    - 立即尝试多种方法延长cookie存活时间（访问dashboard页面或首页）
    - 将auto_refresh状态保存到user_cookies表
    - 启动定时任务，每隔30分钟自动刷新所有auto_refresh=1的cookie

#### 2.3 清除用户Cookie

- `2` 或 `clear_user_cookies` - 清除指定用户的所有cookie
  - 根据user_id清除该用户在user_cookies表中的所有记录
  - 适用于用户登出或需要重置会话的场景


**响应示例:**

**自动注册成功:**
```json
{
  "success": true,
  "request_type": 0,
  "result": {
    "action": "auto_register",
    "user_id": "user123",
    "user_name": "john_doe",
    "domain_id": "comp639nsn.pythonanywhere.com",
    "registration_data": {
      "username": "john_doe_1704110400000",
      "email": "john_doe@nomorepassword.local",
      "first_name": "john",
      "last_name": "doe",
      "location": "Unknown"
    },
    "registration_success": true,
    "login_success": true,
    "account_stored": true,
    "cookie_stored": true,
    "target_website_response": "Registration successful",
    "login_response": "Login successful",
    "stored_account_info": {
      "user_id": "user123",
      "username": "john_doe",
      "website": "comp639nsn.pythonanywhere.com",
      "account": "john_doe_1704110400000",
      "password": "A1b2C3d4E5f6!",
      "email": "john_doe@nomorepassword.local",
      "first_name": "john",
      "last_name": "doe",
      "location": "Unknown",
      "registration_method": "auto",
      "auto_generated": true
    },
    "session_info": {
      "logged_in": true,
      "session_cookie": "session=abc123; user_id=456; role=traveller",
      "user_role": "traveller",
      "user_id": "456"
    }
  }
}
```

**Cookie绑定:**
```json
{
  "success": true,
  "request_type": "bind_cookie",
  "result": {
    "action": "bind_cookie",
    "user_id": "user123",
    "user_name": "john_doe",
    "auto_refresh": true,
    "refresh_time": "2024-01-02T12:00:00.000Z",
    "success": true
  }
}
```

### 3. 获取用户Cookie

**GET** `/cookies/:user_id`

获取指定用户的所有Cookie。

**查询参数:**
- `username` (可选) - 指定用户名

**响应示例:**
```json
{
  "success": true,
  "user_id": "user123",
  "cookies": [
    {
      "user_id": "user123",
      "username": "john_doe",
      "cookie": "cookie_data_for_john_doe_1704110400000",
      "auto_refresh": 1,
      "refresh_time": "2024-01-02T12:00:00.000Z",
      "create_time": "2024-01-01T12:00:00.000Z"
    }
  ]
}
```

### 4. 获取用户账户

**GET** `/accounts/:user_id`

获取指定用户的所有账户。

**查询参数:**
- `username` (可选) - 指定用户名
- `website` (可选) - 指定网站

**响应示例:**
```json
{
  "success": true,
  "user_id": "user123",
  "accounts": [
    {
      "user_id": "user123",
      "username": "john_doe",
      "website": "example.com",
      "account": "account_john_doe",
      "password": "encrypted_password_1704110400000",
      "create_time": "2024-01-01T12:00:00.000Z"
    }
  ]
}
```

## 使用示例

### JavaScript (浏览器)

```javascript
// 自动注册用户到目标网站
async function autoRegisterUser() {
  const response = await fetch('http://localhost:3000/bind', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      domain_id: 'comp639nsn.pythonanywhere.com',
      user_id: 'user123',
      user_name: 'john_doe',
      request_type: 0, // 或者 'auto_register'
      auto_refresh: true,
      first_name: 'John', // 可选
      last_name: 'Doe',   // 可选
      location: 'New York' // 可选
    })
  });
  
  const result = await response.json();
  console.log('Auto registration result:', result);
}

// 绑定用户Cookie
async function bindUserCookie() {
  const response = await fetch('http://localhost:3000/bind', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      domain_id: 'example.com',
      user_id: 'user123',
      user_name: 'john_doe',
      request_type: 'bind_cookie',
      auto_refresh: true
    })
  });
  
  const result = await response.json();
  console.log('Bind result:', result);
}

// 获取用户Cookie
async function getUserCookies() {
  const response = await fetch('http://localhost:3000/cookies/user123?username=john_doe');
  const result = await response.json();
  console.log('User cookies:', result);
}
```

### cURL

```bash
# 健康检查
curl http://localhost:3000/health

# 自动注册用户到TravelTales网站
curl -X POST http://localhost:3000/bind \
  -H "Content-Type: application/json" \
  -d '{
    "domain_id": "comp639nsn.pythonanywhere.com",
    "user_id": "user123",
    "user_name": "john_doe",
    "request_type": 0,
    "auto_refresh": true,
    "first_name": "John",
    "last_name": "Doe",
    "location": "New York"
  }'

# 绑定用户Cookie
curl -X POST http://localhost:3000/bind \
  -H "Content-Type: application/json" \
  -d '{
    "domain_id": "example.com",
    "user_id": "user123",
    "user_name": "john_doe",
    "request_type": "bind_cookie",
    "auto_refresh": true
  }'

# 获取用户Cookie
curl "http://localhost:3000/cookies/user123?username=john_doe"

# 获取用户账户
curl "http://localhost:3000/accounts/user123?username=john_doe&website=comp639nsn.pythonanywhere.com"
```

## 错误处理

API使用标准HTTP状态码：

- `200` - 成功
- `400` - 请求参数错误
- `404` - 端点不存在
- `500` - 服务器内部错误

**错误响应示例:**
```json
{
  "success": false,
  "error": "Missing required parameters: domain_id, user_id, user_name, request_type"
}
```

## 数据库表结构

### user_accounts 表

存储用户账户信息，包含以下字段：

| 字段名 | 类型 | 说明 |
|--------|------|------|
| user_id | VARCHAR(50) | 用户ID |
| username | TEXT | 用户名 |
| website | TEXT | 网站域名 |
| account | VARCHAR(50) | 账户名 |
| password | TEXT | 密码（明文存储） |
| email | TEXT | 邮箱地址 |
| first_name | TEXT | 名字 |
| last_name | TEXT | 姓氏 |
| location | TEXT | 位置信息 |
| registration_method | VARCHAR(20) | 注册方式（manual/auto） |
| auto_generated | BOOLEAN | 是否自动生成 |
| create_time | TIMESTAMP | 创建时间 |

### user_cookies 表

存储用户Cookie信息，包含以下字段：

| 字段名 | 类型 | 说明 |
|--------|------|------|
| user_id | VARCHAR(50) | 用户ID |
| username | TEXT | 用户名 |
| cookie | TEXT | Cookie内容 |
| auto_refresh | BOOLEAN | 是否自动刷新 |
| refresh_time | TIMESTAMP | 刷新时间 |
| create_time | TIMESTAMP | 创建时间 |

## 安全注意事项

1. **CORS**: 当前配置允许所有来源访问，生产环境应限制特定域名
2. **认证**: 当前未实现认证机制，生产环境应添加适当的认证
3. **HTTPS**: 生产环境建议使用HTTPS
4. **密码存储**: 当前密码以明文形式存储，生产环境建议加密存储
5. **数据保护**: 建议定期备份数据库，并设置适当的访问权限

## 启动和停止

API服务器会在B-Client启动时自动启动，在B-Client关闭时自动停止。

**手动控制:**
```javascript
// 启动服务器
await apiServer.start();

// 停止服务器
await apiServer.stop();

// 获取服务器状态
const status = apiServer.getStatus();
```

## 使用场景示例

### 场景1：新用户自动注册 (request_type=0)

当用户在NSN网站首次访问时，NSN检测到用户没有账号，向B-Client发起自动注册请求：

```javascript
// NSN网站代码
fetch('http://localhost:3000/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        domain_id: 'comp639nsn.pythonanywhere.com',
        user_id: 'user123',
        user_name: 'john_doe',
        request_type: 0,  // 自动注册
        auto_refresh: true
    })
});
```

### 场景2：已存在用户绑定 (request_type=1)

#### 方式1：直接提供Cookie

当用户已经用自己的账号密码登录到NSN时，NSN可以直接将用户的cookie传递给B-Client：

```javascript
// NSN网站代码 - 直接提供cookie，启用自动刷新
fetch('http://localhost:3000/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        domain_id: 'comp639nsn.pythonanywhere.com',
        user_id: 'user123',
        user_name: 'john_doe',
        request_type: 1,  // 绑定已存在用户
        auto_refresh: 1,  // 启用自动刷新
        cookie: 'session=eyJsb2dnZWRpbiI6dHJ1ZSwidXNlcl9pZCI6IjEyMyIsInVzZXJuYW1lIjoiam9obiIsInJvbGUiOiJ0cmF2ZWxsZXIifQ.xxx; HttpOnly; Path=/'
    })
});
```

#### 方式2：使用存储的账号密码重新登录

当无法直接获取用户cookie时，B-Client使用存储的账号密码重新登录：

```javascript
// NSN网站代码 - 不提供cookie，使用存储的账号密码
fetch('http://localhost:3000/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        domain_id: 'comp639nsn.pythonanywhere.com',
        user_id: 'user123',
        user_name: 'john_doe',
        request_type: 1,  // 绑定已存在用户
        auto_refresh: true
        // 注意：不提供cookie参数
    })
});
```

**注意：** 方式2需要用户之前已经通过request_type=0注册过账号，B-Client会使用存储的账号密码重新登录获取新的session cookie。

### 场景3：清除用户Cookie (request_type=2)

当用户登出或需要重置会话时，NSN向B-Client发起清除cookie请求：

```javascript
// NSN网站代码 - 清除用户所有cookie
fetch('http://localhost:3000/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        domain_id: 'comp639nsn.pythonanywhere.com',
        user_id: 'user123',
        user_name: 'john_doe',
        request_type: 2,  // 清除用户cookie
        auto_refresh: true
    })
});
```

#### 响应示例

**清除Cookie响应:**
```json
{
  "success": true,
  "request_type": 2,
  "result": {
    "action": "clear_user_cookies",
    "user_id": "user123",
    "user_name": "john_doe",
    "success": true,
    "cleared_count": 3,
    "message": "Successfully cleared 3 cookies for user john_doe"
  }
}
```

#### 响应示例

**方式1响应（直接提供cookie，启用自动刷新）:**
```json
{
  "success": true,
  "request_type": 1,
  "result": {
    "action": "bind_existing_user",
    "user_id": "user123",
    "user_name": "john_doe",
    "domain_id": "comp639nsn.pythonanywhere.com",
    "success": true,
    "method": "direct_cookie",
    "auto_refresh_enabled": true,
    "refresh_attempted": true,
    "refresh_success": true,
    "refresh_method": "dashboard_page",
    "refresh_error": null,
    "stored_cookie": "success",
    "message": "Successfully bound existing user with refreshed cookie"
  }
}
```

**方式2响应（使用存储的账号密码）:**
```json
{
  "success": true,
  "request_type": 1,
  "result": {
    "action": "bind_existing_user",
    "user_id": "user123",
    "user_name": "john_doe",
    "domain_id": "comp639nsn.pythonanywhere.com",
    "success": true,
    "method": "login_refresh",
    "login_success": true,
    "session_info": {
      "logged_in": true,
      "session_cookie": "session=eyJsb2dnZWRpbiI6dHJ1ZSwidXNlcl9pZCI6IjEyMyIsInVzZXJuYW1lIjoiam9obiIsInJvbGUiOiJ0cmF2ZWxsZXIifQ.xxx; HttpOnly; Path=/",
      "user_role": "traveller",
      "user_id": "123"
    },
    "stored_cookie": "success",
    "message": "Successfully bound existing user and refreshed session cookie"
  }
}
```

## 仪表板功能

B-Client API提供仪表板功能，用于展示系统状态和统计数据：

### 仪表板端点

#### 获取统计数据
```http
GET /api/stats
```

**响应示例：**
```json
{
  "autoRefreshUsers": 5,
  "autoRegisteredUsers": 12,
  "totalCookies": 8,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### 获取配置信息
```http
GET /api/config
```

**响应示例：**
```json
{
  "targetWebsites": {
    "comp639nsn.pythonanywhere.com": {
      "name": "TravelTales (NSN)",
      "realTitle": "TravelTales - Your Travel Stories",
      "images": {
        "favicon": "https://comp639nsn.pythonanywhere.com/favicon.ico",
        "ogImage": "https://comp639nsn.pythonanywhere.com/static/images/og-image.jpg",
        "logo": "https://comp639nsn.pythonanywhere.com/static/images/logo.png"
      },
      "loginUrl": "https://comp639nsn.pythonanywhere.com/login",
      "signupUrl": "https://comp639nsn.pythonanywhere.com/signup",
      "dashboardUrl": "https://comp639nsn.pythonanywhere.com/dashboard",
      "homeUrl": "https://comp639nsn.pythonanywhere.com/",
      "domain": "comp639nsn.pythonanywhere.com"
    }
  },
  "default": {
    "autoRefreshHours": 24,
    "cookieExpiryHours": 24,
    "requestTimeout": 30000,
    "userAgent": "NoMorePassword-B-Client/1.0",
    "autoRefreshIntervalMinutes": 30
  }
}
```

**注意**: 
- `realTitle`字段是通过访问目标网站首页自动获取的真实网站标题，具有24小时缓存机制
- `images`字段包含从目标网站提取的图片信息：
  - `favicon`: 网站图标
  - `ogImage`: Open Graph分享图片
  - `logo`: 网站Logo图片
- 图片信息具有7天缓存机制，如果获取失败，相应字段为`null`

## 自动刷新功能

B-Client API包含自动刷新功能，可以定期刷新用户cookie以保持会话活跃：

### 工作原理
1. **启动时**: API服务器启动后立即启动自动刷新调度器
2. **定时执行**: 每隔配置的时间间隔（默认30分钟）自动执行一次刷新任务
3. **Cookie筛选**: 只处理`user_cookies`表中`auto_refresh=1`的cookie记录
4. **刷新方法**: 通过访问NSN的dashboard页面或首页来刷新cookie
5. **结果更新**: 成功刷新后更新`user_cookies`表中的cookie和刷新时间

### 日志输出
```
[API] Starting auto-refresh scheduler (every 30 minutes)
[API] Starting auto-refresh process...
[API] Found 2 cookies that need auto-refresh
[API] Auto-refreshing cookie for user: testuser
[API] Successfully refreshed cookie for user: testuser
[API] Auto-refresh completed: 2 successful, 0 failed
```

**注意**: 日志中的间隔时间会根据配置文件中的`autoRefreshIntervalMinutes`值动态显示。

## 配置文件

B-Client API使用配置文件 `src/main/b-client/config/apiConfig.js` 来管理各种设置：

### 目标网站配置
```javascript
targetWebsites: {
    'comp639nsn.pythonanywhere.com': {
        name: 'TravelTales (NSN)',
        loginUrl: 'https://comp639nsn.pythonanywhere.com/login',
        signupUrl: 'https://comp639nsn.pythonanywhere.com/signup',
        dashboardUrl: 'https://comp639nsn.pythonanywhere.com/dashboard',
        homeUrl: 'https://comp639nsn.pythonanywhere.com/',
        domain: 'comp639nsn.pythonanywhere.com'
    }
}
```

### 默认配置
```javascript
default: {
    autoRefreshHours: 24,        // Cookie自动刷新时间（小时）
    cookieExpiryHours: 24,       // Cookie过期时间（小时）
    requestTimeout: 30000,       // HTTP请求超时时间（毫秒）
    userAgent: 'NoMorePassword-B-Client/1.0',
    autoRefreshIntervalMinutes: 30  // 自动刷新调度器间隔（分钟）
}
```

### 服务器配置
```javascript
server: {
    port: 3000,                  // API服务器端口
    cors: {                      // CORS设置
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization']
    }
}
```

要添加新的目标网站，只需在 `targetWebsites` 中添加新的配置项即可。
