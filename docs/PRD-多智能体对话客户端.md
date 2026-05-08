# PRD: 多智能体对话客户端 (v2.0)

> **版本**: v2.0  
> **状态**: Draft  
> **日期**: 2026-05-08  
> **作者**: opencode + user

---

## 1. 背景与目标

### 1.1 背景

当前 webapp-conversation 是单智能体应用，配置硬编码于 `.env.*`，仅支持 Dify 后端。用户希望通过一个统一的对话界面，便捷接入多种智能体（Dify、FastGPT、n8n、直连大模型等），无需修改代码或重新部署即可切换使用。

同时，项目需要扩展为一个完整的平台，包含：
- 多智能体对话客户端
- 管理后台（用户、组织、模型、知识库等管理）
- 可复用的 AI 对话组件库（支持 Vue 2/3、React）

### 1.2 目标

| 目标 | 描述 |
|------|------|
| **对话体验** | 统一对话界面，支持多种后端智能体的接入和对话 |
| **便捷接入** | 通过后台配置即可接入新智能体，无需修改代码 |
| **多后端适配** | 统一抽象层，支持 Dify + Direct LLM（MVP），预留 FastGPT/n8n 扩展 |
| **多环境配置** | 每个智能体支持 dev/prod/test 等环境，独立的 baseUrl/apiKey |
| **模型管理** | 集中管理大模型元信息（baseUrl、apiKey、模型名、上下文长度等） |
| **完整管理** | 用户管理、组织管理、对话记录、模型管理、知识库管理、API 密钥管理 |
| **认证系统** | 登录认证 + 权限控制（RBAC） |
| **多租户** | 不同组织/用户数据隔离 |
| **组件复用** | 提供可复用的 AI 对话组件库，支持多种技术栈 |

### 1.3 非目标（v1.0 不包含）

- 用户注册/登录系统（仅管理员简单 Token 认证）
- 模型调用统计/费用追踪
- 智能体权限管理（多用户角色）
- api_key 加密存储（v1.0 依赖数据库文件权限控制）
- 自动模型路由/负载均衡

---

## 2. 项目架构

### 2.1 Monorepo 结构

项目采用 pnpm workspace 管理的 monorepo 结构：

```
open-chat/
├── package.json                  ← workspace 根配置
├── pnpm-workspace.yaml           ← 定义所有子项目
├── .gitignore                    ← 合并后的 gitignore
├── .husky/                       ← git hooks
├── webapp/                       ← Next.js 主应用（对话 + admin）
│   ├── app/
│   │   ├── login/                ← 登录页面
│   │   ├── (authenticated)/      ← 需要认证的路由组
│   │   │   ├── layout.tsx        ← 认证布局
│   │   │   ├── (chat)/           ← 对话客户端
│   │   │   ├── admin/            ← 管理界面
│   │   │   └── settings/         ← 用户设置
│   │   └── layout.tsx            ← 根布局
│   ├── middleware.ts             ← 认证中间件
│   └── ...
├── ws-server/                    ← WebSocket 服务（语音识别）
├── chat-component-vue2/          ← Vue 2 AI 对话组件（npm 发布）
├── chat-component-vue3/          ← 未来：Vue 3 版本
└── chat-component-react/         ← 未来：React 版本
```

### 2.2 项目定位

| 项目 | 类型 | 用途 | 发布方式 |
|------|------|------|----------|
| webapp | 产品 | 多智能体对话客户端 + 管理后台 | Docker 部署 |
| ws-server | 服务 | WebSocket 语音识别服务 | Docker 部署 |
| chat-component-vue2 | 组件库 | 让已有 Vue 2 项目快速集成 AI 对话 | npm 包 |
| chat-component-vue3 | 组件库 | Vue 3 版本 | npm 包 |
| chat-component-react | 组件库 | React 版本 | npm 包 |

---

## 3. 用户角色

### 3.1 系统角色

| 角色 | 描述 | 权限 |
|------|------|------|
| **系统管理员** | 平台运维人员 | 全部管理功能（用户、组织、模型、系统配置） |
| **普通用户** | 使用对话功能的用户 | 选择智能体、发起对话、查看对话历史 |

### 3.2 组织角色

| 角色 | 描述 | 权限 |
|------|------|------|
| **组织所有者 (owner)** | 组织创建者 | 管理组织成员、配置、对话 |
| **组织管理员 (admin)** | 组织管理者 | 管理成员、对话，查看统计 |
| **组织成员 (member)** | 普通成员 | 使用对话功能 |

---

## 4. 核心设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 数据库 | PostgreSQL + Prisma ORM | 生产级数据库，支持多租户 |
| 认证方式 | JWT + bcrypt | 安全可靠，支持角色权限 |
| 密码存储 | bcrypt | 成熟稳定，广泛使用 |
| JWT 密钥 | 环境变量 `JWT_SECRET` | 简单直接，适合当前规模 |
| 多租户 | 组织级数据隔离 | 满足多组织使用场景 |
| 请求路由 | 服务端统一代理，`X-Agent-Id` Header | 安全（密钥不暴露前端），灵活 |
| 后端适配 | 统一抽象层，MVP 实现 Dify + DirectLLM | 可扩展，覆盖主要场景 |
| 配置获取 | 运行时 API | 动态切换，无需重新构建 |
| 环境配置 UI | 可视化表单（非 JSON 编辑器） | 用户友好 |
| 智能体切换 | 保留旧对话，隔离存储 | 不丢失历史，不同 agent 对话独立 |
| 对话标题 | LLM 根据对话主题自动生成 | 自然语言标题 |
| 用户注册 | 管理员创建 | 控制用户访问权限 |

---

## 5. 功能需求

### 5.1 认证系统

#### 5.1.1 登录页面

**路由**: `/login`

**交互流程**:
1. 用户输入邮箱和密码
2. 点击登录 → 调用 `/api/auth/login`
3. 成功 → 跳转到对话页面
4. 失败 → 显示错误信息

**UI 规格**:
- 居中卡片布局
- 邮箱输入框
- 密码输入框
- 登录按钮
- 错误提示

#### 5.1.2 认证中间件

**实现**: Next.js Middleware

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value
  
  // 公开路由
  if (isPublicRoute(request.nextUrl.pathname)) {
    return NextResponse.next()
  }
  
  // 无 token → 重定向登录
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  
  // 验证 token
  const payload = verifyJWT(token)
  if (!payload) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  
  // 注入用户信息到请求头
  const headers = new Headers(request.headers)
  headers.set('x-user-id', payload.userId)
  headers.set('x-user-role', payload.role)
  headers.set('x-org-id', payload.orgId)
  
  return NextResponse.next({ request: { headers } })
}
```

#### 5.1.3 认证 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/auth/login` | POST | 登录（邮箱 + 密码） |
| `/api/auth/logout` | POST | 登出（清除 cookie） |
| `/api/auth/me` | GET | 获取当前用户信息 |

### 5.2 智能体选择器（前端）

**位置**: 对话输入框，语音录入按钮旁边

**交互流程**:
1. 点击智能体按钮 → 向上弹出选择面板
2. 显示所有已启用的智能体：图标 + 名称 + 后端类型标签（如 "Dify"、"LLM"）
3. 选择智能体 → 关闭面板，切换当前对话的后端配置
4. 页面加载时自动选择 `isDefault` 的智能体

**状态管理**:
- `localStorage` 存储 `current-agent-id`
- 切换智能体时 **保留旧对话**，每个 agent 的对话独立隔离
- 通过 `/api/config/agent/:id` 获取当前智能体配置（api_key 不返回前端）

**UI 规格**:
- 按钮图标：机器人/脑图标
- 弹出面板：向上弹出，最大高度 400px，可滚动
- 智能体卡片：图标 + 名称 + 后端类型标签
- 选中态：高亮边框/背景色
- 空状态：引导用户去后台创建智能体

### 5.3 后台配置界面 (`/admin`)

**路由**: `/admin`

**权限要求**: 需要管理员角色

**布局**: 左侧导航 + 右侧内容区

#### 5.3.1 仪表盘 (`/admin`)

**功能**:
- 用户总数、组织总数、对话总数
- 活跃用户数（最近 7 天）
- 对话趋势图（最近 30 天）
- 系统状态

#### 5.3.2 用户管理 (`/admin/users`)

**列表页**: 表格展示，支持搜索、分页

**操作**:
- 创建用户
- 编辑用户信息
- 禁用/启用用户
- 重置密码
- 分配组织角色

**编辑表单**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | ✅ | 邮箱（登录凭证） |
| name | string | ✅ | 显示名称 |
| password | string | ✅ | 密码（创建时） |
| role | enum | ✅ | admin / user |
| is_enabled | switch | ✅ | 是否启用 |

#### 5.3.3 组织管理 (`/admin/organizations`)

**列表页**: 表格展示，支持搜索、分页

**操作**:
- 创建组织
- 编辑组织信息
- 管理组织成员
- 删除组织

**编辑表单**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | ✅ | 组织名称 |
| description | string | ❌ | 描述 |

#### 5.3.4 智能体管理 (`/admin/agents`)

**列表页**: 表格展示，支持新建、编辑、删除、启用/停用切换、设为默认、排序

**编辑表单**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | ✅ | 智能体名称 |
| icon | emoji/url | ❌ | 图标 |
| description | string | ❌ | 描述 |
| backend_type | enum | ✅ | `dify` / `fastgpt` / `n8n` / `direct_llm` |
| environments | 表单数组 | ✅ | 多环境配置（可视化表单） |
| default_environment | select | ✅ | 默认环境 |
| models | 多选 | ✅ | 关联模型（可多选） |
| default_model | select | ❌ | 默认模型 |
| is_default | switch | ❌ | 是否为默认智能体 |
| is_enabled | switch | ✅ | 是否启用 |
| sort_order | number | ❌ | 排序 |
| extra_config | key-value | ❌ | 后端特有配置 |

**环境配置可视化表单**:

每个环境条目包含：
```
┌──────────────────────────────────────────────┐
│ 环境名称: [开发环境          ]               │
│ 环境标识: [development        ]               │
│ 后端地址: [http://10.3.10.183/v1]            │
│ API 密钥: [app-xxxx                           ] │
│ 应用 ID:  [ca33c581-42fa-4554-a628-...]      │
│ [删除]                        [激活此环境]    │
└──────────────────────────────────────────────┘
[+ 添加环境]
```

#### 5.3.5 模型管理 (`/admin/models`)

**列表页**: 表格展示，支持按后端类型筛选

**编辑表单**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | ✅ | 显示名称 |
| model_id | string | ✅ | 模型标识（如 `gpt-4o`） |
| provider | string | ❌ | 提供商 |
| base_url | string | ✅ | API 基础 URL |
| api_key | string | ✅ | API 密钥 |
| api_type | enum | ✅ | `openai` / `dify` / `custom` |
| context_length | number | ❌ | 上下文窗口 tokens |
| max_output_tokens | number | ❌ | 最大输出 tokens |
| supports_streaming | switch | ❌ | 流式输出 |
| supports_vision | switch | ❌ | 图像输入 |
| supports_function_calling | switch | ❌ | 函数调用 |
| supports_voice | switch | ❌ | 语音输入 |
| extra_params | key-value | ❌ | 其他参数 |
| is_enabled | switch | ✅ | 是否启用 |

**安全**: api_key 在列表和详情 API 中脱敏（前 4 位 + `****`），仅编辑时返回完整值。

#### 5.3.6 知识库管理 (`/admin/knowledge`)

**列表页**: 表格展示，支持搜索、分页

**操作**:
- 创建知识库
- 上传文档
- 管理文档分段
- 检索测试

#### 5.3.7 API 密钥管理 (`/admin/api-keys`)

**列表页**: 表格展示，支持搜索、分页

**操作**:
- 生成新密钥
- 禁用/启用密钥
- 删除密钥
- 查看使用统计

### 5.4 服务端统一代理

**API 路由**:

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/v1/chat-messages` | POST | 发送消息（流式） |
| `/api/v1/chat-messages/:taskId/stop` | POST | 停止响应 |
| `/api/v1/conversations` | GET | 对话列表 |
| `/api/v1/conversations/:id/name` | POST | 生成对话标题 |
| `/api/v1/messages` | GET | 消息列表 |
| `/api/v1/messages/:id/feedbacks` | POST | 消息反馈 |
| `/api/v1/parameters` | GET | 应用参数 |
| `/api/v1/file-upload` | POST | 文件上传 |

**请求格式**: 所有请求携带 Header:
```
X-Agent-Id: <agent-uuid>
```

**处理流程**:
```
前端请求 → /api/v1/*
  ↓
验证 X-Agent-Id 有效性
  ↓
从 DB 加载 Agent + Environment + Model 配置
  ↓
根据 backend_type 创建适配器实例
  ↓
适配器转换请求 → 调用目标后端
  ↓
统一响应格式 → 返回前端
```

### 5.5 后端适配器抽象层

**接口定义**:

```typescript
interface BackendAdapter {
  type: string
  sendMessage(params: SendMessageParams): AsyncGenerator<StreamChunk>
  stopMessage(taskId: string): Promise<void>
  getConversations(params: ListParams): Promise<PaginatedResult<Conversation>>
  getMessages(params: ListMessagesParams): Promise<PaginatedResult<Message>>
  renameConversation(id: string, name: string): Promise<void>
  getParameters(): Promise<AppParameters>
  fileUpload(file: File): Promise<UploadedFile>
}
```

**MVP 实现**:

| 适配器 | 后端 | 状态 |
|--------|------|------|
| DifyAdapter | Dify AI | ✅ 实现 |
| DirectLLMAdapter | OpenAI 兼容 API | ✅ 实现 |
| FastGPTAdapter | FastGPT | 🔜 预留接口 |
| N8NAdapter | n8n Webhook | 🔜 预留接口 |

**DirectLLMAdapter 特殊处理**:
- 对话历史：本地 DB 存储（新增 LLMConversation/LLMMessage 表）
- 流式输出：直接调用 OpenAI 兼容 API
- 对话标题：LLM 根据对话主题自动生成
- 文件上传：不支持或转 base64

---

## 6. 数据模型

### 6.1 ER 图

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────┐
│    Agent      │──────<│  AgentModel      │>──────│    Model     │
│              │  M:N  │                  │  M:N  │              │
│  name        │       │  agent_id        │       │  name        │
│  backend_type│       │  model_id        │       │  model_id    │
│  environments│       │  is_default      │       │  base_url    │
│  ...         │       │  sort_order      │       │  api_key     │
└──────────────┘       └──────────────────┘       └──────────────┘

┌──────────────────┐       ┌──────────────────┐
│ LLMConversation  │──────<│   LLMMessage     │
│ (DirectLLM专用)  │       │ (DirectLLM专用)  │
│  agent_id        │       │  conversation_id │
│  title           │       │  role            │
│  model_id        │       │  content         │
└──────────────────┘       └──────────────────┘

┌──────────────┐       ┌──────────────────┐       ┌──────────────┐
│    User      │──────<│OrganizationMember │>──────│ Organization │
│              │  M:N  │                  │  M:N  │              │
│  email       │       │  user_id         │       │  name        │
│  name        │       │  organization_id │       │  description │
│  role        │       │  role            │       │  ...         │
│  ...         │       │  ...             │       │              │
└──────────────┘       └──────────────────┘       └──────────────┘
```

### 6.2 Prisma Schema

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// 用户表
model User {
  id             String   @id @default(uuid())
  email          String   @unique
  passwordHash   String   @map("password_hash")
  name           String
  role           String   @default("user") // admin | user
  isEnabled      Boolean  @default(true) @map("is_enabled")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")
  organizationMembers OrganizationMember[]
  conversations  Conversation[]
  @@map("users")
}

// 组织表
model Organization {
  id          String   @id @default(uuid())
  name        String
  description String?
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  members     OrganizationMember[]
  conversations Conversation[]
  @@map("organizations")
}

// 组织成员表
model OrganizationMember {
  id             String       @id @default(uuid())
  userId         String       @map("user_id")
  organizationId String       @map("organization_id")
  role           String       @default("member") // owner | admin | member
  createdAt      DateTime     @default(now()) @map("created_at")
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  @@unique([userId, organizationId])
  @@map("organization_members")
}

// 对话表
model Conversation {
  id             String       @id @default(uuid())
  userId         String       @map("user_id")
  organizationId String?      @map("organization_id")
  title          String?
  createdAt      DateTime     @default(now()) @map("created_at")
  updatedAt      DateTime     @updatedAt @map("updated_at")
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  organization   Organization? @relation(fields: [organizationId], references: [id], onDelete: SetNull)
  messages       Message[]
  @@map("conversations")
}

// 消息表
model Message {
  id             String       @id @default(uuid())
  conversationId String       @map("conversation_id")
  role           String       // user | assistant | system
  content        String
  createdAt      DateTime     @default(now()) @map("created_at")
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  @@map("messages")
}

// 智能体表
model Agent {
  id                 String   @id @default(uuid())
  name               String
  icon               String?
  description        String?
  backendType        String   @map("backend_type") // dify | fastgpt | n8n | direct_llm
  environments       String   @default("[]") // JSON array
  defaultEnvironment String   @default("development") @map("default_environment")
  defaultModelId     String?  @map("default_model_id")
  isDefault          Boolean  @default(false) @map("is_default")
  isEnabled          Boolean  @default(true) @map("is_enabled")
  sortOrder          Int      @default(0) @map("sort_order")
  extraConfig        String   @default("{}") @map("extra_config")
  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @updatedAt @map("updated_at")
  agentModels        AgentModel[]
  llmConversations   LLMConversation[]
  @@map("agents")
}

// 模型表
model Model {
  id                      String   @id @default(uuid())
  name                    String
  modelId                 String   @map("model_id")
  provider                String?
  baseUrl                 String   @map("base_url")
  apiKey                  String   @map("api_key")
  apiType                 String   @default("openai") @map("api_type")
  contextLength           Int?     @map("context_length")
  maxOutputTokens         Int?     @map("max_output_tokens")
  supportsStreaming       Boolean  @default(true) @map("supports_streaming")
  supportsVision          Boolean  @default(false) @map("supports_vision")
  supportsFunctionCalling Boolean  @default(false) @map("supports_function_calling")
  supportsVoice           Boolean  @default(false) @map("supports_voice")
  extraParams             String   @default("{}") @map("extra_params")
  isEnabled               Boolean  @default(true) @map("is_enabled")
  createdAt               DateTime @default(now()) @map("created_at")
  updatedAt               DateTime @updatedAt @map("updated_at")
  agentModels             AgentModel[]
  llmConversations        LLMConversation[]
  @@map("models")
}

// 智能体-模型关联表
model AgentModel {
  id        String  @id @default(uuid())
  agentId   String  @map("agent_id")
  modelId   String  @map("model_id")
  isDefault Boolean @default(false) @map("is_default")
  sortOrder Int     @default(0) @map("sort_order")
  agent     Agent   @relation(fields: [agentId], references: [id], onDelete: Cascade)
  model     Model   @relation(fields: [modelId], references: [id], onDelete: Cascade)
  @@unique([agentId, modelId])
  @@map("agent_models")
}

// DirectLLMAdapter 专用：对话历史
model LLMConversation {
  id        String       @id @default(uuid())
  agentId   String       @map("agent_id")
  modelId   String       @map("model_id")
  title     String?
  createdAt DateTime     @default(now()) @map("created_at")
  updatedAt DateTime     @updatedAt @map("updated_at")
  agent     Agent        @relation(fields: [agentId], references: [id], onDelete: Cascade)
  model     Model        @relation(fields: [modelId], references: [id], onDelete: Cascade)
  messages  LLMMessage[]
  @@map("llm_conversations")
}

// DirectLLMAdapter 专用：消息历史
model LLMMessage {
  id             String          @id @default(uuid())
  conversationId String          @map("conversation_id")
  role           String          // user | assistant | system
  content        String
  createdAt      DateTime        @default(now()) @map("created_at")
  conversation   LLMConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  @@map("llm_messages")
}
```

### 6.3 环境变量

```bash
# 数据库
DATABASE_URL="postgresql://user:password@localhost:5432/openchat"

# JWT 认证
JWT_SECRET="your-secret-key-here"

# 保留原有（向后兼容，无 agent 时 fallback）
NEXT_PUBLIC_APP_ID=
NEXT_PUBLIC_APP_KEY=
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_DEFAULT_THEME=tech-blue
```

---

## 7. 技术架构

### 7.1 整体架构图

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (Frontend)                   │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────────┐   │
│  │ Agent     │  │ Chat     │  │ Admin Panel         │   │
│  │ Selector  │  │ Component│  │ /admin              │   │
│  └─────┬────┘  └─────┬────┘  └──────────┬──────────┘   │
│        │              │                   │              │
│        └──────────────┴───────────────────┘              │
│                       │                                  │
│               fetch / API calls                          │
└───────────────────────┼──────────────────────────────────┘
                        │
┌───────────────────────┼──────────────────────────────────┐
│                Next.js Server                            │
│                       │                                  │
│  ┌────────────────────┴────────────────────────────┐    │
│  │              Middleware (Auth)                    │    │
│  │              JWT 验证 + 用户信息注入               │    │
│  └────────────────────┬────────────────────────────┘    │
│                       │                                  │
│  ┌────────────────────┴────────────────────────────┐    │
│  │              API Routes                          │    │
│  │                                                   │    │
│  │  /api/auth/*       /api/v1/*       /api/admin/*  │    │
│  │  (认证路由)          (代理路由)      (管理路由)     │    │
│  │      │                  │               │         │    │
│  │      ▼                  ▼               ▼         │    │
│  │  ┌─────────┐    ┌─────────┐    ┌──────────────┐ │    │
│  │  │ JWT     │    │ Adapter │    │ Prisma ORM   │ │    │
│  │  │ Verify  │    │ Router  │    │ (PostgreSQL) │ │    │
│  │  └─────────┘    └────┬────┘    └──────────────┘ │    │
│  │                      │                           │    │
│  │  ┌───────────────────┴──────────────────────┐   │    │
│  │  │           Backend Adapters               │   │    │
│  │  │  ┌───────┐  ┌─────────┐  ┌──────────┐  │   │    │
│  │  │  │ Dify  │  │ Direct  │  │ FastGPT  │  │   │    │
│  │  │  │Adapter│  │ LLM     │  │ Adapter  │  │   │    │
│  │  │  └───┬───┘  └────┬────┘  └──────────┘  │   │    │
│  │  └──────┼───────────┼──────────────────────┘   │    │
│  └─────────┼───────────┼───────────────────────────┘    │
└────────────┼───────────┼────────────────────────────────┘
             │           │
     ┌───────▼───┐ ┌─────▼──────┐
     │ Dify API  │ │ OpenAI API │
     │ Backend   │ │ (or equiv) │
     └───────────┘ └────────────┘
```

### 7.2 目录结构

```
open-chat/
├── webapp/
│   ├── prisma/
│   │   ├── schema.prisma              # 数据模型定义
│   │   └── seed.ts                    # 初始数据填充
│   ├── lib/
│   │   ├── prisma.ts                  # Prisma Client 单例
│   │   ├── auth.ts                    # JWT 工具
│   │   ├── password.ts                # bcrypt 工具
│   │   └── adapters/
│   │       ├── types.ts               # 适配器接口定义
│   │       ├── index.ts               # 适配器工厂
│   │       ├── dify.ts                # Dify 适配器
│   │       └── direct-llm.ts          # 直连 LLM 适配器
│   ├── middleware.ts                  # 认证中间件
│   ├── app/
│   │   ├── login/                     # 登录页面
│   │   ├── (authenticated)/           # 需要认证的路由组
│   │   │   ├── layout.tsx             # 认证布局
│   │   │   ├── (chat)/                # 对话客户端
│   │   │   │   ├── page.tsx           # 对话列表
│   │   │   │   └── [id]/              # 具体对话
│   │   │   ├── admin/                 # 管理界面
│   │   │   │   ├── layout.tsx         # admin 布局
│   │   │   │   ├── page.tsx           # 仪表盘
│   │   │   │   ├── users/             # 用户管理
│   │   │   │   ├── organizations/     # 组织管理
│   │   │   │   ├── agents/            # 智能体管理
│   │   │   │   ├── models/            # 模型管理
│   │   │   │   ├── knowledge/         # 知识库管理
│   │   │   │   └── api-keys/          # API 密钥管理
│   │   │   └── settings/              # 用户设置
│   │   ├── api/
│   │   │   ├── auth/                  # 认证 API
│   │   │   │   ├── login/route.ts
│   │   │   │   ├── logout/route.ts
│   │   │   │   └── me/route.ts
│   │   │   ├── v1/                    # 统一代理路由
│   │   │   │   ├── chat-messages/
│   │   │   │   ├── conversations/route.ts
│   │   │   │   ├── messages/route.ts
│   │   │   │   ├── parameters/route.ts
│   │   │   │   └── file-upload/route.ts
│   │   │   ├── admin/                 # Admin CRUD API
│   │   │   │   ├── users/route.ts
│   │   │   │   ├── organizations/route.ts
│   │   │   │   ├── agents/route.ts
│   │   │   │   ├── models/route.ts
│   │   │   │   └── ...
│   │   │   └── config/                # 运行时配置 API
│   │   │       ├── agents/route.ts
│   │   │       └── agent/[id]/route.ts
│   │   └── components/
│   │       └── chat/
│   │           └── agent-selector.tsx  # 智能体选择器组件
│   ├── .env.local
│   └── package.json
├── ws-server/
├── chat-component-vue2/
├── chat-component-vue3/
└── chat-component-react/
```

### 7.3 关键技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| ORM | Prisma | 类型安全，迁移方便，支持 PostgreSQL |
| 数据库 | PostgreSQL | 生产级，支持多租户、JSON 字段 |
| 认证 | JWT + bcrypt | 安全可靠，支持角色权限 |
| Admin UI | React + Tailwind | 与现有技术栈一致，复用组件 |
| API 路由 | Next.js App Router | 已有架构，无需额外框架 |
| Monorepo | pnpm workspace | 统一依赖管理，支持 workspace 链接 |

---

## 8. API 设计

### 8.1 认证 API

#### 登录

```
POST /api/auth/login
Body: { "email": "user@example.com", "password": "xxx" }
Response: { 
  "success": true, 
  "user": { "id": "xxx", "email": "...", "name": "...", "role": "..." },
  "token": "jwt-token"
}
```

#### 登出

```
POST /api/auth/logout
Response: { "success": true }
```

#### 获取当前用户

```
GET /api/auth/me
Response: {
  "id": "xxx",
  "email": "user@example.com",
  "name": "John",
  "role": "admin",
  "organizations": [
    { "id": "xxx", "name": "Org A", "role": "owner" }
  ]
}
```

### 8.2 Admin API

#### 用户 CRUD

```
GET    /api/admin/users              # 列表
POST   /api/admin/users              # 创建
GET    /api/admin/users/:id          # 详情
PUT    /api/admin/users/:id          # 更新
DELETE /api/admin/users/:id          # 删除
PATCH  /api/admin/users/:id/toggle   # 启用/停用
```

#### 组织 CRUD

```
GET    /api/admin/organizations              # 列表
POST   /api/admin/organizations              # 创建
GET    /api/admin/organizations/:id          # 详情
PUT    /api/admin/organizations/:id          # 更新
DELETE /api/admin/organizations/:id          # 删除
GET    /api/admin/organizations/:id/members  # 成员列表
POST   /api/admin/organizations/:id/members  # 添加成员
DELETE /api/admin/organizations/:id/members/:userId  # 移除成员
```

#### 智能体 CRUD

```
GET    /api/admin/agents              # 列表
POST   /api/admin/agents              # 创建
GET    /api/admin/agents/:id          # 详情
PUT    /api/admin/agents/:id          # 更新
DELETE /api/admin/agents/:id          # 删除
PATCH  /api/admin/agents/:id/toggle   # 启用/停用
PATCH  /api/admin/agents/:id/default  # 设为默认
```

#### 模型 CRUD

```
GET    /api/admin/models              # 列表
POST   /api/admin/models              # 创建
GET    /api/admin/models/:id          # 详情（api_key 脱敏）
PUT    /api/admin/models/:id          # 更新
DELETE /api/admin/models/:id          # 删除
```

### 8.3 运行时 API

#### 获取智能体配置（前端用）

```
GET /api/config/agent/:id
Response: {
  "id": "xxx",
  "name": "My Agent",
  "backendType": "dify",
  "environment": { "key": "development", "baseUrl": "..." },
  "models": [...],
  "defaultModelId": "xxx"
}
```

注意：`api_key` 不返回给前端。

#### 获取所有启用的智能体（选择器用）

```
GET /api/config/agents
Response: [
  { "id": "xxx", "name": "Agent A", "icon": "🤖", "backendType": "dify", "isEnabled": true },
  ...
]
```

### 8.4 代理 API（替代现有 /api/* 路由）

所有请求携带 `X-Agent-Id` Header：

```
POST /api/v1/chat-messages
Headers: { "X-Agent-Id": "agent-uuid" }
Body: { "query": "...", "conversation_id": "...", ... }
```

服务端根据 `X-Agent-Id` 加载配置，路由到对应后端。

---

## 9. 前端实现细节

### 9.1 智能体选择器组件

**文件**: `app/components/chat/agent-selector.tsx`

**Props**:
```typescript
interface AgentSelectorProps {
  currentAgentId: string | null
  onAgentChange: (agentId: string) => void
}
```

**实现要点**:
- 使用 Popover/PopoverContent 组件（参考 `voice-settings.tsx` 的弹出模式）
- 向上弹出（`side: 'top'`）
- 列表从 `/api/config/agents` 获取
- 选中态用 `localStorage` 持久化
- 切换智能体时回调 `onAgentChange`，父组件切换对话列表

### 9.2 现有路由兼容

**策略**: 保留现有 `/api/chat-messages/*` 路由作为 fallback，新增 `/api/v1/*` 路由处理多智能体场景。

- **无 `X-Agent-Id`**: 使用 `.env` 中的默认配置（向后兼容）
- **有 `X-Agent-Id`**: 从 DB 加载智能体配置

### 9.3 Admin 页面

**布局**: 左侧导航 + 右侧内容区
- 仪表盘
- 用户管理
- 组织管理
- 智能体管理
- 模型管理
- 知识库管理
- API 密钥管理

**技术方案**: React + Tailwind，复用现有组件库。

---

## 10. 实施计划

### Phase 1: 基础设施（预计 3-5 天）

| 任务 | 说明 |
|------|------|
| Monorepo 结构搭建 | 创建 open-chat/ 目录，配置 pnpm workspace |
| Prisma Schema 定义 | User, Organization, Agent, Model 等表 |
| 数据库初始化 | PostgreSQL + seed 数据 |
| Prisma Client 配置 | 单例模式 |
| JWT 认证中间件 | `middleware.ts` + `lib/auth.ts` |
| 登录页面 | `/login` 路由 |

### Phase 2: 认证系统（预计 2-3 天）

| 任务 | 说明 |
|------|------|
| 登录 API | `/api/auth/login` |
| 登出 API | `/api/auth/logout` |
| 获取当前用户 API | `/api/auth/me` |
| 密码加密 | bcrypt |
| Token 管理 | JWT 签发、验证、刷新 |

### Phase 3: Admin CRUD API（预计 3-4 天）

| 任务 | 说明 |
|------|------|
| 用户 CRUD API | `/api/admin/users` |
| 组织 CRUD API | `/api/admin/organizations` |
| 智能体 CRUD API | `/api/admin/agents` |
| 模型 CRUD API | `/api/admin/models` |
| 模型 api_key 脱敏 | 响应处理 |

### Phase 4: Admin UI（预计 5-7 天）

| 任务 | 说明 |
|------|------|
| Admin 布局 | 左侧导航 + 右侧内容区 |
| 仪表盘 | 统计数据、图表 |
| 用户管理页 | 列表 + 创建 + 编辑 |
| 组织管理页 | 列表 + 创建 + 编辑 + 成员管理 |
| 智能体管理页 | 列表 + 创建 + 编辑 + 环境配置 |
| 模型管理页 | 列表 + 创建 + 编辑 |

### Phase 5: 后端适配器（预计 3-4 天）

| 任务 | 说明 |
|------|------|
| 适配器接口定义 | `lib/adapters/types.ts` |
| DifyAdapter 实现 | 迁移现有 `dify-client` 逻辑 |
| DirectLLMAdapter 实现 | OpenAI 兼容 API |
| 适配器工厂 | 根据 `backend_type` 创建实例 |
| 运行时配置 API | `/api/config/agent/:id` |

### Phase 6: 前端集成（预计 3-4 天）

| 任务 | 说明 |
|------|------|
| 智能体选择器组件 | Popover UI + 状态管理 |
| 代理路由 `/api/v1/*` | 路由 + 适配器调用 |
| 现有路由兼容 | 添加 `X-Agent-Id` 支持 |
| Main 组件集成 | agent state + 对话切换 |

### Phase 7: 测试与优化（预计 2-3 天）

| 任务 | 说明 |
|------|------|
| 端到端测试 | 多智能体切换 + 对话 |
| 权限测试 | RBAC 权限控制 |
| 安全审查 | api_key 存储、Token 验证 |
| 文档更新 | README + AGENTS.md |

---

## 11. 风险与注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 现有路由兼容性 | 切换 agent 后旧会话可能异常 | 无 `X-Agent-Id` 时 fallback 到 `.env` 配置 |
| api_key 安全 | 数据库泄露导致密钥暴露 | 依赖 DB 权限控制，后续版本加密 |
| DirectLLM 对话历史 | 无原生对话管理 | 本地 DB 存储对话/消息（LLMConversation/LLMMessage） |
| 性能 | 每次请求查 DB 加载配置 | 内存缓存（LRU），TTL 5 分钟 |
| PostgreSQL 并发 | 多用户同时写入 | 生产环境 PostgreSQL 原生支持 |
| JWT 密钥泄露 | 账号被盗用 | 环境变量存储，定期轮换 |

---

## 12. 附录

### 12.1 环境配置数据结构

```json
[
  {
    "name": "开发环境",
    "key": "development",
    "base_url": "http://10.3.10.183/v1",
    "api_key": "app-xxxx",
    "app_id": "ca33c581-...",
    "is_active": true
  },
  {
    "name": "生产环境",
    "key": "production",
    "base_url": "https://api.dify.ai/v1",
    "api_key": "app-yyyy",
    "app_id": "bb44d582-...",
    "is_active": false
  }
]
```

### 12.2 后端适配器请求/响应格式

**Dify 适配器**:
- 请求格式：与 Dify API v1 完全一致
- 响应格式：Dify 原生格式

**DirectLLM 适配器**:
- 请求格式：OpenAI Chat Completions API 格式
- 响应格式：OpenAI 流式格式（SSE）
- 对话历史：从本地 DB 加载，构建 messages 数组

### 12.3 组件库规划

| 组件库 | 技术栈 | 用途 |
|--------|--------|------|
| chat-component-vue2 | Vue 2 | 让已有 Vue 2 项目快速集成 AI 对话 |
| chat-component-vue3 | Vue 3 | Vue 3 版本 |
| chat-component-react | React | React 版本 |

组件库功能：
- AI 对话界面
- 智能体选择器
- 语音输入
- 消息渲染（Markdown、代码高亮）
- 文件上传
