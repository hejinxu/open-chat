# PRD: 多智能体对话客户端 (v1.0)

> **版本**: v1.0  
> **状态**: Draft  
> **日期**: 2026-04-30  
> **作者**: opencode + user

---

## 1. 背景与目标

### 1.1 背景

当前 webapp-conversation 是单智能体应用，配置硬编码于 `.env.*`，仅支持 Dify 后端。用户希望通过一个统一的对话界面，便捷接入多种智能体（Dify、FastGPT、n8n、直连大模型等），无需修改代码或重新部署即可切换使用。

### 1.2 目标

| 目标 | 描述 |
|------|------|
| **对话体验** | 统一对话界面，支持多种后端智能体的接入和对话 |
| **便捷接入** | 通过后台配置即可接入新智能体，无需修改代码 |
| **多后端适配** | 统一抽象层，支持 Dify + Direct LLM（MVP），预留 FastGPT/n8n 扩展 |
| **多环境配置** | 每个智能体支持 dev/prod/test 等环境，独立的 baseUrl/apiKey |
| **模型管理** | 集中管理大模型元信息（baseUrl、apiKey、模型名、上下文长度等） |
| **后台配置** | 可视化配置智能体和模型（辅助工具，非核心产品） |

### 1.3 非目标（v1.0 不包含）

- 用户注册/登录系统（仅管理员简单 Token 认证）
- 模型调用统计/费用追踪
- 智能体权限管理（多用户角色）
- api_key 加密存储（v1.0 依赖数据库文件权限控制）
- 自动模型路由/负载均衡

---

## 2. 用户角色

| 角色 | 描述 | 权限 |
|------|------|------|
| **访客/终端用户** | 使用对话功能的普通用户 | 选择智能体、发起对话 |
| **管理员** | 配置智能体和模型的运维人员 | 全部管理功能（简单 Token 认证） |

---

## 3. 核心设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 数据库 | SQLite (dev) + Prisma ORM | 零部署开发，生产可切 PostgreSQL |
| 认证 | Bearer Token（`ADMIN_TOKEN` 环境变量） | 无需用户系统，简单有效 |
| 请求路由 | 服务端统一代理，`X-Agent-Id` Header | 安全（密钥不暴露前端），灵活 |
| 后端适配 | 统一抽象层，MVP 实现 Dify + DirectLLM | 可扩展，覆盖主要场景 |
| 配置获取 | 运行时 API | 动态切换，无需重新构建 |
| 环境配置 UI | 可视化表单（非 JSON 编辑器） | 用户友好 |
| 智能体切换 | 保留旧对话，隔离存储 | 不丢失历史，不同 agent 对话独立 |
| 对话标题 | LLM 根据对话主题自动生成 | 自然语言标题 |
| api_key 加密 | v1.0 暂不加密 | 简化实现，依赖 DB 文件权限 |

---

## 4. 功能需求

### 4.1 智能体选择器（前端）

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

### 4.2 后台配置界面 (`/admin`)

**路由**: `/admin`

**认证方式**: 简单 Token 认证
- 环境变量 `ADMIN_TOKEN` 存储管理员令牌
- 首次访问 `/admin` 需输入 Token，存储于 `localStorage`
- 所有 `/api/admin/*` 请求携带 `Authorization: Bearer <token>` 头
- Token 验证失败返回 `401 Unauthorized`

#### 4.2.1 智能体管理

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

#### 4.2.2 模型管理

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

### 4.3 服务端统一代理

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

### 4.4 后端适配器抽象层

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

## 5. 数据模型

### 5.1 ER 图

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
```

### 5.2 Prisma Schema

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Agent {
  id                 String   @id @default(uuid())
  name               String
  icon               String?
  description        String?
  backendType        String   // dify | fastgpt | n8n | direct_llm
  environments       String   @default("[]") // JSON array
  defaultEnvironment String   @default("development")
  defaultModelId     String?
  isDefault          Boolean  @default(false)
  isEnabled          Boolean  @default(true)
  sortOrder          Int      @default(0)
  extraConfig        String   @default("{}")
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  agentModels        AgentModel[]
  llmConversations   LLMConversation[]
  @@map("agents")
}

model Model {
  id                      String   @id @default(uuid())
  name                    String
  modelId                 String
  provider                String?
  baseUrl                 String
  apiKey                  String
  apiType                 String   @default("openai")
  contextLength           Int?
  maxOutputTokens         Int?
  supportsStreaming       Boolean  @default(true)
  supportsVision          Boolean  @default(false)
  supportsFunctionCalling Boolean  @default(false)
  supportsVoice           Boolean  @default(false)
  extraParams             String   @default("{}")
  isEnabled               Boolean  @default(true)
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
  agentModels             AgentModel[]
  llmConversations        LLMConversation[]
  @@map("models")
}

model AgentModel {
  id        String  @id @default(uuid())
  agentId   String
  modelId   String
  isDefault Boolean @default(false)
  sortOrder Int     @default(0)
  agent     Agent   @relation(fields: [agentId], references: [id], onDelete: Cascade)
  model     Model   @relation(fields: [modelId], references: [id], onDelete: Cascade)
  @@unique([agentId, modelId])
  @@map("agent_models")
}

model AdminToken {
  id        String    @id @default(uuid())
  token     String    @unique
  name      String?
  lastUsed  DateTime?
  createdAt DateTime  @default(now())
  @@map("admin_tokens")
}

// DirectLLMAdapter 专用：对话历史
model LLMConversation {
  id        String       @id @default(uuid())
  agentId   String
  modelId   String
  title     String?
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
  agent     Agent        @relation(fields: [agentId], references: [id], onDelete: Cascade)
  model     Model        @relation(fields: [modelId], references: [id], onDelete: Cascade)
  messages  LLMMessage[]
  @@map("llm_conversations")
}

model LLMMessage {
  id             String          @id @default(uuid())
  conversationId String
  role           String          // user | assistant | system
  content        String
  createdAt      DateTime        @default(now())
  conversation   LLMConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  @@map("llm_messages")
}
```

### 5.3 环境变量变更

```bash
# 新增
DATABASE_URL="file:./dev.db"
ADMIN_TOKEN="your-secret-token"

# 保留原有（向后兼容，无 agent 时 fallback）
NEXT_PUBLIC_APP_ID=
NEXT_PUBLIC_APP_KEY=
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_DEFAULT_THEME=tech-blue
```

---

## 6. 技术架构

### 6.1 整体架构图

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
│  │              API Routes                          │    │
│  │                                                   │    │
│  │  /api/v1/*          /api/admin/*                  │    │
│  │  (代理路由)          (管理路由)                     │    │
│  │      │                  │                         │    │
│  │      ▼                  ▼                         │    │
│  │  ┌─────────┐    ┌──────────────┐                 │    │
│  │  │ Adapter │    │ Prisma ORM   │                 │    │
│  │  │ Router  │    │ (SQLite/PG)  │                 │    │
│  │  └────┬────┘    └──────────────┘                 │    │
│  │       │                                           │    │
│  │  ┌────┴─────────────────────┐                    │    │
│  │  │    Backend Adapters       │                    │    │
│  │  │  ┌───────┐  ┌─────────┐ │                    │    │
│  │  │  │ Dify  │  │ Direct  │ │                    │    │
│  │  │  │Adapter│  │ LLM     │ │                    │    │
│  │  │  └───┬───┘  └────┬────┘ │                    │    │
│  │  └──────┼───────────┼──────┘                    │    │
│  └─────────┼───────────┼───────────────────────────┘    │
└────────────┼───────────┼────────────────────────────────┘
             │           │
     ┌───────▼───┐ ┌─────▼──────┐
     │ Dify API  │ │ OpenAI API │
     │ Backend   │ │ (or equiv) │
     └───────────┘ └────────────┘
```

### 6.2 目录结构变更

```
webapp-conversation/
├── prisma/
│   ├── schema.prisma              # 数据模型定义
│   └── seed.ts                    # 初始数据填充
├── lib/
│   ├── prisma.ts                  # Prisma Client 单例
│   ├── auth.ts                    # Admin Token 验证
│   └── adapters/
│       ├── types.ts               # 适配器接口定义
│       ├── index.ts               # 适配器工厂
│       ├── dify.ts                # Dify 适配器
│       └── direct-llm.ts          # 直连 LLM 适配器
├── app/
│   ├── admin/
│   │   ├── layout.tsx             # Admin 布局（侧边栏 + 认证）
│   │   ├── page.tsx               # Admin 首页/仪表盘
│   │   ├── agents/
│   │   │   ├── page.tsx           # 智能体列表
│   │   │   └── [id]/page.tsx      # 智能体编辑
│   │   └── models/
│   │       ├── page.tsx           # 模型列表
│   │       └── [id]/page.tsx      # 模型编辑
│   ├── api/
│   │   ├── v1/                    # 统一代理路由
│   │   │   ├── chat-messages/
│   │   │   │   ├── route.ts
│   │   │   │   └── [taskId]/stop/route.ts
│   │   │   ├── conversations/route.ts
│   │   │   ├── messages/route.ts
│   │   │   ├── parameters/route.ts
│   │   │   └── file-upload/route.ts
│   │   ├── admin/                 # Admin CRUD API
│   │   │   ├── agents/route.ts
│   │   │   ├── agents/[id]/route.ts
│   │   │   ├── models/route.ts
│   │   │   ├── models/[id]/route.ts
│   │   │   └── auth/route.ts
│   │   └── config/                # 运行时配置 API
│   │       ├── agents/route.ts
│   │       └── agent/[id]/route.ts
│   └── components/
│       └── chat/
│           └── agent-selector.tsx # 智能体选择器组件
├── .env.local                     # 修改：增加 DATABASE_URL, ADMIN_TOKEN
└── package.json                   # 修改：增加 prisma 依赖
```

### 6.3 关键技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| ORM | Prisma | 类型安全，迁移方便，支持 SQLite ↔ PostgreSQL |
| 数据库（开发） | SQLite | 零部署，单文件，开发友好 |
| 数据库（生产） | PostgreSQL | 用户选择，Prisma 无缝切换 |
| Admin UI | React 组件 | 与现有技术栈一致，复用 Tailwind |
| 简单认证 | Bearer Token | 无需用户系统，环境变量配置 |
| API 路由 | Next.js App Router | 已有架构，无需额外框架 |

---

## 7. API 设计

### 7.1 Admin API

#### 认证

```
POST /api/admin/auth
Body: { "token": "xxx" }
Response: { "success": true, "token": "xxx" }
```

所有 `/api/admin/*` 请求需要:
```
Authorization: Bearer <ADMIN_TOKEN>
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

### 7.2 运行时 API

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

### 7.3 代理 API（替代现有 /api/* 路由）

所有请求携带 `X-Agent-Id` Header：

```
POST /api/v1/chat-messages
Headers: { "X-Agent-Id": "agent-uuid" }
Body: { "query": "...", "conversation_id": "...", ... }
```

服务端根据 `X-Agent-Id` 加载配置，路由到对应后端。

---

## 8. 前端实现细节

### 8.1 智能体选择器组件

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

### 8.2 现有路由兼容

**策略**: 保留现有 `/api/chat-messages/*` 路由作为 fallback，新增 `/api/v1/*` 路由处理多智能体场景。

- **无 `X-Agent-Id`**: 使用 `.env` 中的默认配置（向后兼容）
- **有 `X-Agent-Id`**: 从 DB 加载智能体配置

### 8.3 Admin 页面

**布局**: 左侧导航 + 右侧内容区
- 智能体管理
- 模型管理
- 系统设置（预留）

**技术方案**: React + Tailwind，无需额外 UI 框架。

---

## 9. 实施计划

### Phase 1: 基础设施（预计 2-3 天）

| 任务 | 说明 |
|------|------|
| Prisma Schema 定义 | Agent, Model, AgentModel, AdminToken |
| 数据库初始化 | SQLite + seed 数据 |
| Prisma Client 配置 | 单例模式 |
| Admin Token 验证中间件 | `lib/auth.ts` |
| Admin 布局和路由 | `/admin` 页面框架 |

### Phase 2: Admin CRUD API（预计 2-3 天）

| 任务 | 说明 |
|------|------|
| 智能体 CRUD API | `/api/admin/agents` |
| 模型 CRUD API | `/api/admin/models` |
| 模型 api_key 脱敏 | 响应处理 |
| Admin 认证 API | `/api/admin/auth` |

### Phase 3: Admin UI（预计 3-4 天）

| 任务 | 说明 |
|------|------|
| Admin 登录页 | Token 输入 + 验证 |
| 智能体列表页 | 表格 + 启用/停用 + 排序 |
| 智能体编辑页 | 表单 + 环境配置可视化表单 |
| 模型列表页 | 表格 + 筛选 |
| 模型编辑页 | 表单 |

### Phase 4: 后端适配器（预计 3-4 天）

| 任务 | 说明 |
|------|------|
| 适配器接口定义 | `lib/adapters/types.ts` |
| DifyAdapter 实现 | 迁移现有 `dify-client` 逻辑 |
| DirectLLMAdapter 实现 | OpenAI 兼容 API |
| 适配器工厂 | 根据 `backend_type` 创建实例 |
| 运行时配置 API | `/api/config/agent/:id` |

### Phase 5: 前端集成（预计 2-3 天）

| 任务 | 说明 |
|------|------|
| 智能体选择器组件 | Popover UI + 状态管理 |
| 代理路由 `/api/v1/*` | 路由 + 适配器调用 |
| 现有路由兼容 | 添加 `X-Agent-Id` 支持 |
| Main 组件集成 | agent state + 对话切换 |

### Phase 6: 测试与优化（预计 1-2 天）

| 任务 | 说明 |
|------|------|
| 端到端测试 | 多智能体切换 + 对话 |
| 生产环境 PostgreSQL 切换测试 | Prisma provider 切换 |
| 安全审查 | api_key 存储、Token 验证 |
| 文档更新 | README + AGENTS.md |

---

## 10. 风险与注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 现有路由兼容性 | 切换 agent 后旧会话可能异常 | 无 `X-Agent-Id` 时 fallback 到 `.env` 配置 |
| api_key 安全 | 数据库文件泄露导致密钥暴露 | v1.0 依赖 DB 文件权限，后续版本加密 |
| DirectLLM 对话历史 | 无原生对话管理 | 本地 DB 存储对话/消息（LLMConversation/LLMMessage） |
| 性能 | 每次请求查 DB 加载配置 | 内存缓存（LRU），TTL 5 分钟 |
| SQLite 并发 | 多用户同时写入冲突 | 生产切换 PostgreSQL |

---

## 11. 附录

### 11.1 环境配置数据结构

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

### 11.2 后端适配器请求/响应格式

**Dify 适配器**:
- 请求格式：与 Dify API v1 完全一致
- 响应格式：Dify 原生格式

**DirectLLM 适配器**:
- 请求格式：OpenAI Chat Completions API 格式
- 响应格式：OpenAI 流式格式（SSE）
- 对话历史：从本地 DB 加载，构建 messages 数组
