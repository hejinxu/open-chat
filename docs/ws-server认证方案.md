# ws-server 认证方案

## 设计原则

1. **ws-server 始终作为独立服务** — 不依赖任何特定项目
2. **webapp 只是一个可替换的验证服务提供者** — 不特殊对待
3. **其他项目也可提供验证服务** — 只要按统一格式响应即可
4. **ws-server 支持自验证** — 验证 token 配置在本地 JSON 文件中

## 架构

```
ws-server（始终独立服务）
  │
  ├── AUTH_MODE=remote
  │   → POST {VERIFY_ENDPOINT} { token }
  │   ← { success, code, msg, data: { id, name, role } }
  │
  ├── AUTH_MODE=self
  │   → 匹配 config/auth.json 中的 token 列表
  │
  └── AUTH_ENABLED=false
      → 跳过认证（向后兼容）
```

## 统一验证协议

### 请求

`POST {VERIFY_ENDPOINT}`

```json
{
  "token": "客户端传来的原始 token"
}
```

### 成功响应（HTTP 200）

```json
{
  "success": true,
  "code": 200,
  "msg": "ok",
  "data": {
    "id": "user-uuid",
    "name": "张三",
    "role": "admin"
  }
}
```

### 失败响应（HTTP 401）

```json
{
  "success": false,
  "code": 401,
  "msg": "Invalid token"
}
```

ws-server 只认 `success` 字段，`data` 附着到 `socket.data.user` 供 handler 使用。

## ws-server 配置

### 环境变量

ws-server 通过 `ws-server/.env` 文件配置（模板文件 `ws-server/.env.example`，开发者从模板创建）。

```bash
WS_PORT=8787
AUTH_ENABLED=true       # false = 跳过认证（向后兼容）
AUTH_MODE=self          # self | remote
VERIFY_ENDPOINT=        # remote 模式必填：验证服务 URL（需包含 basePath）
VERIFY_TIMEOUT=5000     # 远程验证超时 ms
```

- `AUTH_MODE=self`（默认）：本地 JSON 文件验证
- `AUTH_MODE=remote`：调用外部验证 API，`VERIFY_ENDPOINT` 必填
- `AUTH_MODE=remote` 且 `VERIFY_ENDPOINT` 为空时，启动报错并退出

**VERIFY_ENDPOINT 需包含 basePath**：如果 webapp 配置了 `NEXT_PUBLIC_BASE_PATH=/chat`，则 `VERIFY_ENDPOINT` 应为 `http://127.0.0.1:3000/chat/api/auth/verify-token`（带 `/chat` 前缀）。

**使用 127.0.0.1 而非 localhost**：Windows 上 `localhost` 可能解析到 IPv6（`::1`），而 webapp 通常只监听 IPv4。使用 `127.0.0.1` 可避免连接失败。

### self 模式：`ws-server/config/auth.json`（gitignored）

```json
{
  "tokens": [
    {
      "token": "sk-dev-key-001",
      "name": "开发测试",
      "enabled": true,
      "description": "本地开发用"
    },
    {
      "token": "sk-old-key-xxx",
      "name": "旧密钥",
      "enabled": false,
      "description": "已废弃，待清理"
    }
  ]
}
```

- `enabled: false` 的 token 不会被验证通过
- 每个 token 有 `name` 和 `description` 字段便于管理

## webapp 验证端点

### `POST /api/auth/verify-token`（供任何 ws-server 实例调用）

**处理流程**：
1. 读取请求 body 中的 `token`
2. 尝试 JWT 验证（用 `JWT_SECRET`）
3. 尝试 API Key 验证（查 DB，bcrypt 比对）
4. 返回统一格式 `{ success, code, msg, data }`

**响应示例**：

```json
// JWT 验证成功
{
  "success": true,
  "code": 200,
  "msg": "ok",
  "data": {
    "id": "user-uuid",
    "name": "张三",
    "role": "admin"
  }
}

// API Key 验证成功
{
  "success": true,
  "code": 200,
  "msg": "ok",
  "data": {
    "id": "integration-id",
    "name": "API User",
    "role": "user"
  }
}

// 验证失败
{
  "success": false,
  "code": 401,
  "msg": "Invalid token"
}
```

## 客户端

### whisper-recognition.ts

`WhisperRecognition` 不自己获取 token，由调用方传入：

```ts
class WhisperRecognition {
  constructor(callback, modelName, options?: {
    authToken?: string  // 调用方负责获取
  })
}
```

- 主应用 `voice-input.tsx`：先调 webapp 获取 token，传给 `WhisperRecognition`
- embed 模式：直接用 `apiKey` 作为 `authToken`
- 其他项目：自行决定 token 来源

### Socket.IO 连接

```ts
this.socket = socketIo(`${url}/speech`, {
  auth: authToken ? { token: authToken } : undefined,
  transports: ['websocket'],
  reconnection: false,
})
```

## ws-server 认证中间件

```js
// server.mjs 中注册命名空间认证中间件
const authMode = process.env.AUTH_MODE || 'self'
const authEnabled = process.env.AUTH_ENABLED !== 'false'

if (authEnabled) {
  const ns = io.of('/speech')
  ns.use(async (socket, next) => {
    const token = socket.handshake.auth?.token
    if (!token) {
      return next(new Error('Authentication required'))
    }

    try {
      let result
      if (authMode === 'remote') {
        result = await verifyRemote(token)
      } else {
        result = verifySelf(token)
      }

      if (result.success) {
        socket.data.user = result.data
        next()
      } else {
        next(new Error(result.msg || 'Authentication failed'))
      }
    } catch (e) {
      next(new Error('Authentication error: ' + e.message))
    }
  })
}
```

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `ws-server/package.json` | 修改 | 添加 `dotenv` |
| `ws-server/lib/auth.mjs` | 新建 | `verifySelf()` + `verifyRemote()` |
| `ws-server/server.mjs` | 修改 | 加载 auth 配置，注册 namespace 认证中间件 |
| `ws-server/config/auth.json.example` | 新建 | 自验证 token 配置模板（含 enabled、description） |
| `webapp/app/api/auth/verify-token/route.ts` | 新建 | 统一格式验证端点 |
| `webapp/app/components/chat/voice-recognition/whisper-recognition.ts` | 修改 | 接收 `authToken` 参数，传入 `auth` |
| `webapp/app/components/chat/voice-recognition/types.ts` | 修改 | 添加 `authToken` 到 options |
| `webapp/app/components/chat/voice-input.tsx` | 修改 | 获取 token 并传给 `WhisperRecognition` |

## 设计决策

| 决策 | 理由 |
|------|------|
| ws-server 不依赖任何特定项目 | 独立服务原则 |
| 统一 HTTP 协议 | 任何语言/框架都能实现验证服务 |
| self 模式用 JSON 文件 | 零依赖、简单、运维友好 |
| 默认 `AUTH_MODE=self` | 向后兼容，开箱即用 |
| `AUTH_ENABLED` 默认 `true` | 新部署默认启用认证 |
| `authToken` 由调用方传入 | ws-server 不关心 token 来源 |
| `VERIFY_ENDPOINT` 无默认值 | remote 模式必须显式配置 |
| JSON 中 enabled 字段 | 支持禁用 token 而不删除 |
| 响应格式 `{success, code, msg, data}` | 行业通用格式 |
