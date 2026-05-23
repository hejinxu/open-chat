---
theme: default
themeName: "默认主题"
title: "系统设计-open-chat"
---

# 系统设计: Open Chat

> **版本**: v2.0  
> **状态**: Draft  
> **日期**: 2026-05-08  
> **作者**: opencode + user  
> **产品需求**: [PRD-open-chat.md](./PRD-open-chat.md)

---

## 1. 项目架构

### 1.1 Monorepo 结构

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

### 1.2 项目定位

| 项目 | 类型 | 用途 | 发布方式 |
|------|------|------|----------|
| webapp | 产品 | Open Chat 主应用（对话 + admin） | Docker 部署 |
| ws-server | 服务 | WebSocket 语音识别服务 | Docker 部署 |
| chat-component-vue2 | 组件库 | 让已有 Vue 2 项目快速集成 AI 对话 | npm 包 |
| chat-component-vue3 | 组件库 | Vue 3 版本 | npm 包 |
| chat-component-react | 组件库 | React 版本 | npm 包 |

---

## 2. 核心设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 数据库 | SQLite（sql.js）+ 预留 PostgreSQL | 纯 JS 实现无需原生编译，适合嵌入式场景；PostgreSQL 预留生产扩展 |
| 认证方式 | JWT + bcrypt | 安全可靠，支持角色权限 |
| 密码存储 | bcrypt | 成熟稳定，广泛使用 |
| JWT 密钥 | 环境变量 `JWT_SECRET` | 简单直接，适合当前规模 |
| 多租户 | 组织级数据隔离（规划中） | 满足多组织使用场景 |
| 请求路由 | 服务端统一代理，`X-Agent-Id` Header | 安全（密钥不暴露前端），灵活 |
| 后端适配 | 统一抽象层，MVP 实现 Dify + DirectLLM | 可扩展，覆盖主要场景 |
| 配置获取 | 运行时 API | 动态切换，无需重新构建 |
| 智能体切换 | 保留旧对话，隔离存储 | 不丢失历史，不同 agent 对话独立 |
| 对话标题 | 首条用户消息前 30 字 | 简单高效，无需 LLM 调用 |
| 用户注册 | 管理员创建 | 控制用户访问权限 |
| 智能编排 | 独立编排层 + LLM 路由 | 灵活扩展，不侵入现有适配器架构 |
| Skill 系统 | 全局注册 + 声明式调用 | 跨智能体共享，统一管理，按需启用 |
| 任务规划 | LLM 规划 + DAG 执行 | 支持并行分支、依赖关系、多智能体分工 |
| 结果汇总 | LLM 汇总 + 流式输出 | 多步骤结果统一整合，实时反馈 |

---

## 3. 数据模型

### 3.1 ER 图

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

┌──────────────┐       ┌──────────────────┐
│AppIntegration│──────<│    ApiKey        │
│              │  1:N  │                  │
│  app_id      │       │  key_hash        │
│  app_secret  │       │  allowed_agent_ids│
│  ...         │       │  ...             │
└──────────────┘       └──────────────────┘
```

### 3.2 SQL Schema（SQLite）

```sql
-- 用户表
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',
  org_id TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 用户账号表（多登录方式）
CREATE TABLE user_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  login_type TEXT NOT NULL,
  login_identifier TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL DEFAULT '',
  is_primary INTEGER NOT NULL DEFAULT 0,
  is_verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 智能体表
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '🤖',
  description TEXT DEFAULT '',
  backend_type TEXT NOT NULL DEFAULT 'dify',
  api_key TEXT NOT NULL DEFAULT '',
  api_url TEXT NOT NULL DEFAULT '',
  model TEXT,
  extra_config TEXT DEFAULT '{}',
  is_default INTEGER NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 应用集成表
CREATE TABLE app_integrations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  app_id TEXT NOT NULL UNIQUE,
  app_secret TEXT NOT NULL DEFAULT '',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- API 密钥表
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  allowed_agent_ids TEXT NOT NULL DEFAULT '[]',
  expires_at INTEGER,
  last_used_at INTEGER,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (integration_id) REFERENCES app_integrations(id) ON DELETE CASCADE
);

-- 对话表
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  agents TEXT NOT NULL DEFAULT '{}'
);

-- 消息表
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  agent_id TEXT,
  agent_name TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  is_answer INTEGER NOT NULL DEFAULT 0,
  feedback TEXT,
  message_files TEXT NOT NULL DEFAULT '[]',
  agent_thoughts TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);

-- Skill 表（全局技能注册中心）
CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  type TEXT NOT NULL,              -- 'tool' | 'api' | 'function'
  config TEXT NOT NULL DEFAULT '{}', -- JSON: 调用方式、参数 schema、端点等
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Agent-Skill 关联表（声明智能体可调用的 skills）
CREATE TABLE agent_skills (
  agent_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (agent_id, skill_id)
);

-- 执行计划表（Plan）
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  user_query TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning', -- 'planning' | 'executing' | 'completed' | 'failed' | 'cancelled'
  steps TEXT NOT NULL DEFAULT '[]',        -- JSON: [{step_id, agent_id, skill_id?, input, status, output, started_at, finished_at}]
  result TEXT,                             -- 最终汇总结果
  model TEXT,                              -- 规划使用的模型
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### 3.3 环境变量

```bash
# 数据库
SQLITE_DB_PATH=data/openchat.db

# JWT 认证
JWT_SECRET="your-secret-key-here"

# 认证系统开关（默认关闭，向后兼容）
AUTH_ENABLED=false

# 保留原有（向后兼容，无 agent 时 fallback）
NEXT_PUBLIC_APP_ID=
NEXT_PUBLIC_APP_KEY=
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_DEFAULT_THEME=tech-blue

# 项目前缀路径
NEXT_PUBLIC_BASE_PATH=

# 存储后端
NEXT_PUBLIC_STORAGE_BACKEND=local
```

---

## 4. 技术架构

### 4.1 整体架构图

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
│  │              JWT/API Key 验证 + 用户信息注入       │    │
│  └────────────────────┬────────────────────────────┘    │
│                       │                                  │
│  ┌────────────────────┴────────────────────────────┐    │
│  │              API Routes                          │    │
│  │                                                   │    │
│  │  /api/auth/*       /api/chat-messages/*  /api/admin/* │
│  │  (认证路由)          (代理路由)      (管理路由)     │    │
│  │      │                  │               │         │    │
│  │      ▼                  ▼               ▼         │    │
│  │  ┌─────────┐    ┌─────────┐    ┌──────────────┐ │    │
│  │  │ JWT     │    │ Adapter │    │ SQLite       │ │    │
│  │  │ Verify  │    │ Router  │    │ (sql.js)     │ │    │
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

     ┌─────────────────────────────────────────┐
     │          WebSocket Server (独立)         │
     │  ┌──────────────────────────────────┐   │
     │  │ /speech (语音识别)                │   │
     │  │ /push   (后端推送，预留)           │   │
     │  └──────────────────────────────────┘   │
     │  Auth: self (JSON) / remote (HTTP验证)  │
     └─────────────────────────────────────────┘
```

### 4.2 目录结构

```
open-chat/
├── webapp/
│   ├── lib/
│   │   ├── auth/
│   │   │   ├── jwt.ts                  # JWT 签发/验证（jose）
│   │   │   ├── password.ts             # bcrypt 工具
│   │   │   ├── token.ts                # API Key 生成/验证
│   │   │   └── setup-cache.ts          # 初始化状态缓存
│   │   ├── db/
│   │   │   ├── types.ts                # DatabaseProvider 接口
│   │   │   ├── sqlite.ts               # SQLite 实现（sql.js）
│   │   │   └── index.ts                # 存储工厂
│   │   ├── storage/
│   │   │   ├── types.ts                # StorageProvider 接口
│   │   │   ├── local-storage.ts        # localStorage 实现
│   │   │   ├── remote-storage.ts       # HTTP API 实现
│   │   │   └── factory.ts              # 存储工厂
│   │   └── adapters/
│   │       ├── types.ts                # 适配器接口定义
│   │       ├── index.ts                # 适配器工厂
│   │       ├── dify.ts                 # Dify 适配器
│   │       └── llm.ts                  # 直连 LLM 适配器
│   ├── middleware.ts                    # 认证中间件（Node.js runtime）
│   ├── config/
│   │   ├── index.ts                    # BASE_PATH, APP_ID 等配置
│   │   └── agents.config.json          # 智能体配置（可选，已迁移至 DB）
│   ├── app/
│   │   ├── login/                      # 登录页面
│   │   ├── setup/                      # 初始设置（Server Component）
│   │   ├── admin/
│   │   │   ├── layout.tsx              # admin 布局（Tab 导航）
│   │   │   ├── users/                  # 用户管理
│   │   │   ├── agents/                 # 智能体管理
│   │   │   └── integrations/           # 应用集成管理
│   │   ├── embed/                      # 嵌入式对话页面
│   │   ├── api/
│   │   │   ├── auth/                   # 认证 API
│   │   │   │   ├── login/route.ts
│   │   │   │   ├── logout/route.ts
│   │   │   │   ├── me/route.ts
│   │   │   │   ├── setup/route.ts
│   │   │   │   ├── verify-token/route.ts
│   │   │   │   ├── ws-token/route.ts
│   │   │   │   └── exchange/route.ts
│   │   │   ├── admin/                  # Admin CRUD API
│   │   │   │   ├── users/route.ts
│   │   │   │   ├── agents/route.ts
│   │   │   │   └── integrations/
│   │   │   │       └── [integrationId]/keys/route.ts
│   │   │   ├── chat-messages/          # 代理路由
│   │   │   │   ├── route.ts
│   │   │   │   └── [taskId]/stop/route.ts
│   │   │   ├── parameters/route.ts
│   │   │   ├── file-upload/route.ts
│   │   │   ├── config/agents/route.ts  # 运行时配置 API
│   │   │   └── storage/                # 存储 API
│   │   └── components/
│   │       ├── chat/
│   │       │   ├── index.tsx           # 主对话组件
│   │       │   ├── agent-selector.tsx  # 智能体选择器
│   │       │   └── voice-input.tsx     # 语音输入
│   │       └── base/
│   │           ├── form-dialog/        # 表单弹窗组件
│   │           └── confirm-dialog/     # 确认弹窗组件
│   ├── public/
│   │   ├── embed.min.js               # 嵌入式组件脚本
│   │   └── images/embed-icons/        # 嵌入图标
│   ├── types/
│   │   ├── agent.ts                    # AgentConfig, AgentRecord
│   │   ├── auth.ts                     # UserRecord, ApiKeyRecord
│   │   └── embed.ts                    # EmbedTokenRecord
│   ├── i18n/lang/
│   │   ├── common.zh.ts
│   │   └── common.en.ts
│   └── service/
│       ├── base.ts                     # baseFetch, ssePost
│       └── index.ts                    # 业务 API 封装
├── ws-server/
│   ├── server.mjs                      # Socket.IO 入口
│   ├── lib/
│   │   ├── auth.mjs                    # 认证（self/remote）
│   │   ├── model-loader.mjs            # Whisper 模型加载
│   │   ├── funasr.mjs                  # FunASR Python sidecar
│   │   └── audio-utils.mjs             # RMS 静音检测 + 幻觉过滤
│   ├── handlers/
│   │   ├── speech.mjs                  # 语音识别 handler
│   │   └── push.mjs                    # 推送 handler（预留）
│   └── config/auth.json                # self 模式 token 配置
└── test-projects/
    └── public/
        ├── index.html                  # 测试导航页
        ├── socket-test.html            # Socket.IO 测试
        └── embed-integration.html      # 嵌入集成测试
```

### 4.3 关键技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| ORM | sql.js（纯 JS SQLite） | 无需原生编译，WebAssembly 实现 |
| 数据库 | SQLite | 轻量级，适合单机部署；预留 PostgreSQL 扩展 |
| 认证 | JWT (jose) + bcrypt (bcryptjs) | 安全可靠，支持角色权限 |
| Admin UI | React + Tailwind + Headless UI | 与现有技术栈一致，复用组件 |
| API 路由 | Next.js App Router | 已有架构，无需额外框架 |
| Monorepo | pnpm workspace | 统一依赖管理，支持 workspace 链接 |
| 嵌入组件 | Vanilla JS (postMessage) | 零依赖，第三方一键引入 |
| WebSocket | Socket.IO | 自动重连，命名空间隔离 |
| 语音引擎 | Whisper (ONNX) / FunASR (Python) | 开源，支持中英文 |

---

## 5. 功能性设计

### 5.1 认证系统

#### 5.1.1 双级别认证

**Level 1: API Key 认证（嵌入式集成）**
- 前端携带 `x-api-key: sk-xxx` header
- 中间件验证 API Key（bcrypt hash 比对）
- 注入 `x-auth-integration-id` 到请求头
- 支持 `allowed_agent_ids` 控制可访问的智能体范围
- 支持 `expires_at` 过期时间

**Level 2: OAuth 认证（服务端集成）**
- 第三方服务端用 `app_id` + `app_secret` 换取 JWT
- JWT 携带用户身份信息
- 注入 `x-auth-user-id` 到请求头

#### 5.1.2 认证中间件

**实现**: Next.js Middleware（Node.js runtime）

```
请求进入
  → 检查 PUBLIC_PATHS（/login, /setup, /api/auth/*, /images/*, /embed）
  → 已认证？放行
  → 检查 x-api-key header
  → 有 API Key？验证 → 注入 x-auth-integration-id
  → 检查 JWT cookie
  → 有效？注入 x-auth-user-id + x-auth-user-role
  → 无效？重定向到 /login
```

**关键细节**:
- `request.nextUrl.pathname` 自动剥离 basePath，PUBLIC_PATHS 不含前缀
- `AUTH_ENABLED=false` 时跳过所有认证（向后兼容）
- Session Cookie（无 maxAge），关闭浏览器自动过期

#### 5.1.3 认证 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/auth/login` | POST | 登录（用户名 + 密码） |
| `/api/auth/logout` | POST | 登出（清除 cookie） |
| `/api/auth/me` | GET | 获取当前用户（支持 JWT 和 API Key） |
| `/api/auth/setup` | POST | 初始设置（创建管理员） |
| `/api/auth/exchange` | POST | Level 2 OAuth 令牌交换 |
| `/api/auth/verify-token` | POST | 统一 token 验证（ws-server 远程调用） |
| `/api/auth/ws-token` | GET | 签发 WebSocket 短期 JWT |

### 5.2 智能体管理

#### 5.2.1 智能体配置（DB 表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 唯一标识（如 `dify-assistant`） |
| name | TEXT | 显示名称 |
| icon | TEXT | Emoji 图标 |
| description | TEXT | 描述 |
| backend_type | TEXT | `dify` / `direct_llm` / `fastgpt` / `n8n` |
| api_key | TEXT | 后端 API 密钥 |
| api_url | TEXT | 后端 API 地址 |
| model | TEXT | 模型名（direct_llm 必填） |
| extra_config | TEXT | 扩展配置 JSON |
| is_default | INTEGER | 是否为默认（唯一约束） |
| is_enabled | INTEGER | 是否启用 |

#### 5.2.2 智能体加载流程

```
getAllAgents()
  → 检查内存缓存
  → 缓存未命中？从 SQLite 读取
  → DB 空？fallback 到 env vars (API_KEY/API_URL)
  → 过滤 is_enabled → 返回 AgentConfig[]
```

#### 5.2.3 自动迁移

首次启动时检测 DB agents 表为空 + 旧 `agents.config.json` 存在 → 自动导入所有智能体到 DB。

### 5.3 服务端统一代理

**API 路由**:

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/chat-messages` | POST | 发送消息（流式） |
| `/api/chat-messages/:taskId/stop` | POST | 停止响应 |
| `/api/parameters` | GET | 应用参数 |
| `/api/file-upload` | POST | 文件上传 |

**请求流程**:
```
前端请求（携带 x-agent-id header）
  → 中间件认证
  → getAdapterForRequest()
    → 根据 x-agent-id 查找 AgentConfig
    → createAdapter(agent) 创建对应适配器
  → 适配器调用目标后端 API
  → 流式响应返回前端
```

### 5.4 后端适配器抽象层

**接口定义**:

```typescript
interface ChatAdapter {
  type: string
  sendMessage(params: SendMessageParams): AsyncGenerator<StreamChunk>
  stopMessage(taskId: string, user: string): Promise<void>
  getParameters(appId: string, user: string): Promise<AppParameters>
  fileUpload(file: File, user: string): Promise<UploadedFile>
}
```

**已实现适配器**:

| 适配器 | 后端 | 状态 |
|--------|------|------|
| DifyAdapter | Dify AI | ✅ 实现 |
| LLMAdapter | OpenAI 兼容 API | ✅ 实现 |
| FastGPTAdapter | FastGPT | 🔜 预留接口 |
| N8NAdapter | n8n Webhook | 🔜 预留接口 |

**LLMAdapter 特殊处理**:
- 对话历史：本地 DB 存储（conversations + messages 表）
- 流式输出：直接调用 OpenAI 兼容 API
- 对话标题：首条用户消息前 30 字

### 5.5 嵌入式对话组件

**架构**: iframe + postMessage

```
embed.min.js (外层, vanilla JS)
├── [浮动按钮]      — 可拖动，位置持久化
└── [窗口容器]
     ├── [标题栏]   — ☰ + 标题 + × + 拖拽窗口
     ├── [iframe]   — /embed?apiKey=...&theme=...
     └── [resize]   — 8 方向拖拽，位置+尺寸持久化
```

**认证流程**: 嵌入请求携带 `x-api-key: sk-xxx` → 中间件验证 → 查找 api_keys 表 → 校验 is_enabled + expires_at + allowed_agent_ids

**配置接口**:
```javascript
window.openChatConfig = {
  baseUrl,        // 必填：应用地址
  apiKey,         // 必填：API Key
  agentId,        // 可选：指定智能体
  icon,           // 可选：自定义图标
  theme,          // 可选：主题
  windowSize,     // 可选：窗口尺寸
  inputs,         // 可选：预填参数
}
```

### 5.6 语音识别服务（ws-server）

**架构**: 独立 Socket.IO 服务，不依赖任何特定项目

**认证模式**:
- `AUTH_MODE=self`: 本地 JSON 配置文件验证（`config/auth.json`）
- `AUTH_MODE=remote`: 调用主应用 `/api/auth/verify-token` 远程验证
- `AUTH_ENABLED=false`: 跳过认证（向后兼容）

**支持引擎**:
| 引擎 | 模型 | 说明 |
|------|------|------|
| whisper-tiny | whisper-tiny.onnx | 轻量级 |
| whisper-base | whisper-base.onnx | 基础版 |
| whisper-small | whisper-small.onnx | 小型版 |
| funasr-paraformer-zh | Paraformer | 中文优化 |
| funasr-sensevoice | SenseVoice | 多语言 |

---

## 6. API 设计

### 6.1 认证 API

#### 登录

```
POST /api/auth/login
Body: { "identifier": "admin", "password": "xxx" }
Response: {
  "success": true,
  "user": { "id": "xxx", "name": "Admin", "role": "admin" }
}
Set-Cookie: auth_token=jwt; HttpOnly; SameSite=Lax
```

#### 获取当前用户

```
GET /api/auth/me
Headers: Cookie: auth_token=jwt  或  x-api-key: sk-xxx
Response: {
  "user": { "id": "xxx", "name": "Admin", "role": "admin" }
}
```

#### 统一 token 验证（ws-server 调用）

```
POST /api/auth/verify-token
Body: { "token": "any-format-token" }
Response: {
  "success": true,
  "code": 200,
  "msg": "ok",
  "data": { "id": "xxx", "name": "Admin", "role": "admin" }
}
```

### 6.2 Admin API

#### 用户 CRUD

```
GET    /api/admin/users              # 列表
POST   /api/admin/users              # 创建
PUT    /api/admin/users              # 更新（body 含 id）
DELETE /api/admin/users              # 删除（body 含 id）
```

#### 智能体 CRUD

```
GET    /api/admin/agents              # 列表
POST   /api/admin/agents              # 创建（body 含 id）
PUT    /api/admin/agents              # 更新（body 含 id）
DELETE /api/admin/agents              # 删除（body 含 id，不允许删默认）
```

#### 应用集成 CRUD

```
GET    /api/admin/integrations              # 列表
POST   /api/admin/integrations              # 创建
PUT    /api/admin/integrations              # 更新
DELETE /api/admin/integrations              # 删除

# API Key 管理
GET    /api/admin/integrations/:id/keys     # 列表
POST   /api/admin/integrations/:id/keys     # 生成
DELETE /api/admin/integrations/:id/keys     # 吊销
```

### 6.3 运行时 API

```
GET /api/config/agents              # 所有启用的智能体（前端选择器用）
Response: [{ id, name, icon, description, backend_type, is_default }]
```

### 6.4 存储 API

```
GET    /api/storage/conversations    # 对话列表
POST   /api/storage/conversations    # 保存对话
DELETE /api/storage/conversations    # 删除对话

GET    /api/storage/messages         # 消息列表
POST   /api/storage/messages         # 保存消息
DELETE /api/storage/messages         # 删除消息

POST   /api/storage/merge            # 合并远程+本地数据
```

---

## 7. 前端实现细节

### 7.1 智能体选择器组件

**文件**: `app/components/chat/agent-selector.tsx`

- 从 `${BASE_PATH}/api/config/agents` 获取智能体列表
- 单智能体：显示静态标签
- 多智能体：下拉菜单，图标 + 名称 + 描述
- 点击已选智能体可取消选择（恢复默认）
- 嵌入模式通过 `apiKey` prop 传递认证

### 7.2 消息流式响应

**SSE 流式处理**:
- `ssePost()` 函数处理 SSE 流
- 逐 chunk 解析，实时更新消息内容
- 支持 `message_end`、`message_file`、`message_replace` 等事件
- Dify 和 LLM 适配器返回统一格式

### 7.3 状态管理

- **Zustand + immer**: 全局状态管理
- **ahooks**: 实用 hooks（useRequest, useDebounceFn 等）
- **localStorage**: 对话列表、消息、智能体参数本地缓存
- **远程存储优先**: 新增/编辑/删除优先操作远程存储，失败降级到 localStorage

---

## 8. 部署配置

### 8.1 webapp (.env.local)

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/openchat"
JWT_SECRET="your-secret-key-here"
AUTH_ENABLED=false
NEXT_PUBLIC_DEFAULT_THEME=tech-blue
NEXT_PUBLIC_STORAGE_BACKEND=local
SQLITE_DB_PATH=data/openchat.db
NEXT_PUBLIC_BASE_PATH=
```

### 8.2 ws-server (.env)

```bash
WS_PORT=8787
SPEECH_MODEL=whisper-tiny
AUTH_ENABLED=true
AUTH_MODE=remote
VERIFY_ENDPOINT=http://127.0.0.1:3000/chat/api/auth/verify-token
VERIFY_TIMEOUT=5000
```

---

## 9. 智能编排系统（规划中）

### 9.1 架构总览

编排层位于用户与智能体之间，作为"大脑"协调整个对话流程：

```
用户提问
  ↓
┌─────────────────────────────────────────────┐
│              编排层 (Orchestrator)            │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
│  │ 意图识别  │→│ 路由决策  │→│ 计划生成  │ │
│  │ (LLM)    │  │ (LLM)    │  │ (LLM)     │ │
│  └──────────┘  └────┬─────┘  └─────┬─────┘ │
│                     │              │         │
│              ┌──────▼──────┐ ┌────▼─────┐  │
│              │ Skill 调用   │ │ 任务分配  │  │
│              │ (按需)       │ │ (多Agent) │  │
│              └─────────────┘ └────┬─────┘  │
└───────────────────────────────────┼─────────┘
                                    │
              ┌─────────────────────▼─────────┐
              │         执行层                  │
              │  Agent A  Agent B  Agent C     │
              │  Skill X  Skill Y              │
              └─────────────┬─────────────────┘
                            │
              ┌─────────────▼─────────────────┐
              │         结果汇总 (LLM)         │
              │  → 流式输出给用户               │
              └───────────────────────────────┘
```

### 9.2 智能路由

**流程**：

```
用户提问
  → LLM 分析意图（从 agents 列表 + descriptions 中选择）
  → 返回: { agent_id, confidence, reason }
  → confidence > 阈值？直接路由到该 agent
  → confidence < 阈值？进入规划模式（多步骤任务）
```

**路由决策输入**：
- 用户原始问题
- 所有可用 agent 的 `{ id, name, description, backend_type }` 列表
- 当前对话上下文（历史消息摘要）

**路由决策输出**：
```json
{
  "agent_id": "translator",
  "confidence": 0.92,
  "reason": "用户要求翻译一段文字，translator 擅长多语言翻译",
  "need_skills": false,
  "need_planning": false
}
```

### 9.3 全局 Skill 注册中心

**Skill 类型**：

| 类型 | 说明 | 示例 |
|------|------|------|
| `tool` | 本地工具调用 | 代码执行、文件解析、计算器 |
| `api` | 外部 API 调用 | 搜索引擎、天气查询、股票行情 |
| `function` | LLM function calling | 结构化数据提取、格式转换 |

**Skill 数据结构**（`config` JSON）：

```json
{
  "type": "api",
  "endpoint": "https://api.search.example.com/search",
  "method": "POST",
  "params_schema": {
    "query": { "type": "string", "required": true },
    "num_results": { "type": "integer", "default": 5 }
  },
  "response_mapping": {
    "results": "$.data.results"
  },
  "timeout_ms": 10000,
  "cost_per_call": 0.001
}
```

**Skill 调用协议**：

```
POST /api/skills/{skill_id}/invoke
Body: { "params": { "query": "..." }, "context": { "conversation_id": "..." } }
Response: { "success": true, "result": { ... } }
```

**Agent-Skill 关联**：
- 每个 agent 通过 `agent_skills` 表声明可调用的 skills
- 编排层在路由时同时决定是否需要调用 skill
- Skill 调用结果注入到 agent 的输入上下文中

### 9.4 任务规划引擎

**触发条件**：
- 路由决策 `need_planning = true`
- 用户问题涉及多个领域（如"搜索最新论文并总结"→ 搜索 + 总结两个 agent）
- 问题复杂度超过单 agent 能力

**Plan 生成流程**：

```
用户问题 + agent 列表 + skill 列表
  → LLM 生成执行计划
  → Plan = {
      steps: [
        { agent_id: "searcher", skill_id: "web_search", input: "搜索 query" },
        { agent_id: "summarizer", input: "总结上一步结果" }
      ],
      strategy: "sequential"  // sequential | parallel | conditional
    }
  → 存入 plans 表
  → 实时推送给前端展示
```

**Plan 步骤数据结构**：

```json
{
  "step_id": "step_1",
  "agent_id": "searcher",
  "skill_id": "web_search",
  "skill_params": { "query": "最新 AI 论文" },
  "input": "搜索关于大语言模型最新进展的论文",
  "depends_on": [],
  "status": "pending",
  "output": null
}
```

**执行策略**：

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| `sequential` | 步骤按顺序执行，后一步依赖前一步输出 | 流水线任务 |
| `parallel` | 无依赖的步骤并行执行 | 多维度查询 |
| `conditional` | 根据前一步结果决定下一步 | 分支逻辑 |

### 9.5 多智能体协作

**执行流程**：

```
Plan 生成完毕
  → 按 DAG 拓扑排序执行
  → 并行步骤：同时发起多个 agent 调用
  → 每步完成后：结果存入 plan.steps[i].output
  → 下一步的 input = 引用上一步的 output
  → 所有步骤完成 → 汇总 agent 整合结果
  → 最终结果流式输出给用户
```

**结果汇总**：

```json
{
  "plan_id": "xxx",
  "status": "completed",
  "steps_summary": [
    { "step_id": "step_1", "agent": "searcher", "status": "success", "summary": "找到 5 篇相关论文" },
    { "step_id": "step_2", "agent": "summarizer", "status": "success", "summary": "已生成摘要" }
  ],
  "final_result": "根据搜索结果，以下是最新 AI 论文的摘要：..."
}
```

**错误处理**：
- 单步失败：标记该步骤为 `failed`，尝试跳过或重试
- 关键步骤失败：整个 plan 标记为 `failed`，返回已执行步骤的部分结果
- 超时：单步超时自动终止，不影响其他并行步骤

### 9.6 用户可见性

**规划阶段展示**：

```
🤖 正在分析您的问题...

我将分 3 步完成：
1. 🔍 搜索相关论文（searcher + web_search）
2. 📄 获取论文摘要（fetcher + paper_api）
3. ✍️ 生成总结报告（summarizer）

[开始执行]
```

**执行阶段展示**（实时更新）：

```
1. ✅ 搜索相关论文 — 找到 5 篇相关论文
2. 🔄 获取论文摘要 — 正在获取第 3/5 篇...
3. ⏳ 生成总结报告 — 等待中...
```

**前端交互**：
- Plan 步骤列表实时渲染（SSE 推送）
- 每步可展开查看详细输入/输出
- 用户可取消正在执行的 plan
- 历史 plan 可在对话中回溯查看
