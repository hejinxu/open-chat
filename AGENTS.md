# AGENTS.md

## Project
Open Chat - 开放对话平台。pnpm workspace 管理的 monorepo，包含 Next.js 对话客户端 + WebSocket 语音识别服务。支持多种 AI 智能体后端（Dify、FastGPT、n8n、直连大模型等）。

## Monorepo Structure
```
open-chat/
├── webapp/          # Next.js 15 + React 19（对话 + admin）
├── ws-server/       # Socket.IO WebSocket 服务（语音识别）
├── test-projects/    # 通用测试/演示工程（嵌入集成、Socket 测试等）
├── chat-component-vue2/   # 未来：Vue 2 组件库
├── chat-component-vue3/   # 未来：Vue 3 组件库
└── chat-component-react/  # 未来：React 组件库
```

## Commands（在根目录执行）
- `pnpm dev` — 同时启动 webapp + ws-server
- `pnpm dev:webapp` — 只启动 webapp（port 3000）
- `pnpm dev:ws` — 只启动 ws-server（port 8787）
- `pnpm dev:test-projects` — 只启动 test-projects（port 3001，测试页面）
- `pnpm build` — 构建 webapp
- `pnpm start` — 启动生产版本
- `pnpm lint` — ESLint 检查
- `pnpm fix` — 自动修复 lint
- `pnpm typecheck` — TypeScript 类型检查
- `pnpm download-whisper` — 下载 Whisper 模型
- `pnpm download-funasr` — 下载 FunASR 模型

Pre-commit hook 运行 `pnpm lint-staged`（ESLint on staged `.ts`/`.tsx` files）。

## Architecture

### webapp (Next.js)
- **App Router**: Entry is `app/layout.tsx` → `app/page.tsx` → `app/components/index.tsx`
- **API proxy**: Routes in `app/api/**/route.ts` use adapter pattern to forward requests to various backends
- **Client streaming**: `service/base.ts` exports `ssePost` for SSE streaming; `service/index.ts` wraps domain calls
- **State**: Zustand + immer for state management; ahooks for utility hooks
- **Config**: `config/index.ts` holds `APP_ID`, `API_KEY`, `API_URL` from env vars
- **basePath**: `NEXT_PUBLIC_BASE_PATH` 环境变量驱动 `next.config.js` 的 `basePath`（页面路由 + 静态资源）和 `config/index.ts` 的 `BASE_PATH` 常量（客户端 API 调用），默认为空（根路径）。所有客户端 `fetch('/api/...')` 统一使用 `${BASE_PATH}/api/...` 格式
- **认证系统**: JWT + bcrypt，Next.js Middleware 全局验证。支持两种认证级别：Level 1 (API Key: `sk-xxx`) 用于简单嵌入集成，Level 2 (OAuth: `app_id` + `app_secret`) 用于服务端到服务端用户身份映射。认证始终启用，对话页面必须登录，嵌入式弹窗必须携带 apiKey。登录 JWT 有效期 2 小时（`AUTH_TOKEN_TTL_SECONDS`，同时作为 cookie `maxAge`），middleware 滑动续期：剩余有效期 < 1 小时（`AUTH_TOKEN_REFRESH_THRESHOLD_SECONDS`）时重签 JWT 并写回 cookie，活跃用户不掉线、闲置 2 小时后失效。常量与 `getAuthCookieOptions()` 定义在 `lib/auth/jwt.ts`。详见 `docs/开发指南/认证系统.md`
- **多租户**: 组织级数据隔离（规划中，`users` 表已预留 `org_id` 字段）

### Setup & Login
- **Setup 页面**: Server Component，查询 DB 检查用户是否存在，有用户则 `redirect('/login')`，无用户则渲染客户端表单。创建用户成功后显示 3 秒倒计时跳转到登录页。
- **Setup API**: 当 `users` 表为空时，自动清理 `user_accounts` 中的孤立记录（防止手动删用户后 identifier 冲突）。
- **Login 页面**: 登录成功后使用 `window.location.href` 跳转，路径包含 `BASE_PATH` 前缀。
- **Auth Cookie**: 登录 cookie `maxAge = 2h`（与 JWT `exp` 一致，由 `getAuthCookieOptions()` 统一配置）。middleware 滑动续期：剩余有效期 < 1 小时时重签 JWT 并写回 cookie。活跃用户不掉线，闲置 2 小时后失效需重新登录。

### Multi-Agent System
- **适配器模式**: `lib/adapters/` 定义 `ChatAdapter` 接口，不同后端类型有独立适配器实现
- **智能体配置**: 智能体存储在 SQLite 数据库中，通过 Admin UI 管理（CRUD），支持动态增删改查无需重启
- **配置读取**: `app/api/utils/agents.ts` 提供 `getAllAgents()`、`getDefaultAgent()`、`getAgentById()` 等函数
- **API 路由**: 所有 API 路由通过 `getAdapterForRequest()` 获取适配器，根据 `x-agent-id` header 选择智能体
- **前端选择器**: `app/components/chat/agent-selector.tsx` 在输入框内提供智能体选择下拉菜单
- **消息绑定**: 每条消息记录 `agent_id` 和 `agent_name`，用于显示消息来源
- **参数同步**: 切换智能体时同步清洗参数（对比最新 prompt_variables 定义，删除多余 key），发送时不再滤波
- **参数缓存**: `promptVariablesCacheRef` 缓存已使用 Agent 的参数定义，再次切换同步读取
- **agentKey**: 始终使用实际智能体 ID，不使用魔术字符串

**ConversationRecord 结构：**
```typescript
interface ConversationRecord {
  id: string                    // 本地 ID
  name: string                  // 标题（首条用户消息前 30 字，发送时立即设置）
  created_at: number            // Unix 时间戳
  updated_at: number            // Unix 时间戳
  agents: Record<string, {      // 每个智能体在此会话中的状态
    params: Record<string, any>            // 最后参数值
    backend_conversation_id?: string       // Dify 等后端返回的会话 ID
  }>
}
```

**agentKey 规则：永远使用实际智能体 ID**，不使用 `'__default__'` 魔术字符串。`agentKey = selectedAgentId || defaultAgentId`。切换默认智能体时 key 自然变化，旧参数不会泄漏。

**消息保存中的 agent_id**：始终使用 `agentKey`（而非 `agentId`），确保未显式选择智能体时也能正确绑定到默认智能体。涉及 `saveUserMessage`、`sendData`、`responseItem` 三处。

**参数同步不变式：** `表单值 == agentInputsCacheRef[agentKey]`，两者永远相等。参数持久化到远程存储（SQLite），无 localStorage 缓存。

**参数定义懒加载：** 使用到哪个 Agent 才 fetch 其 `prompt_variables`，取后缓存到 `promptVariablesCacheRef`，再次使用时从缓存同步读取。

**切换智能体：** 始终从服务端 fetch 最新参数定义，清空旧表单，同步清洗已存参数，恢复表单。

**智能体选择恢复：** `app/components/index.tsx` 用 localStorage key `selected-agent-id` 记住"最后一次选择的智能体"（`handleAgentChange` 切换时写入）。刷新页面（init effect）时恢复全局记忆；用户主动切换到已有会话（`handleConversationIdChange` 非 `-1` 分支）时，按该会话**最后一条消息的 `agent_id`** 恢复选中。优先级：`embedAgentId`（嵌入固定）> 会话最后消息 `agent_id` > localStorage 全局记忆 > 默认智能体。

**handleSend 守卫：** 区分 `promptConfig === null`（未加载 → 阻塞）与 `prompt_variables === []`（无参数 → 放行）。

**Dify conversation_id 隔离：** 每个智能体独立管理自己的 `backend_conversation_id`，首次发送 `conversation_id: null`，不跨 Agent 共享。

**停止朗读时机：** `handleSend` 入口、切换智能体、切换会话、重新生成、页面卸载。

**旧数据迁移：** `migrateOldData()` 一次性将 `open_chat_conv_agent_params` + `open_chat_dify_conv_map` 合并到 `ConversationRecord.agents`，迁移后删除旧 key。

**welcome 组件安全：** `promptConfig` 可为 null，所有访问使用可选链 `promptConfig?.prompt_variables`。

**直连 LLM 智能体（`backend_type: 'direct_llm'`）：**
- **无参数定义**：不需要 `prompt_variables`，不请求 `/api/parameters`。切换时跳过 `fetchAndCachePromptVars`，同步设 `promptConfig = { prompt_variables: [] }`
- **类型感知**：`agentTypeMapRef`（`Record<string, string>`）在 init 时填充每个 Agent 的 `backend_type`，切换智能体 effect 中检查 `=== 'direct_llm'` 做分支
- **`isDirectLLM` 状态**：控制 `hasSetInputs`（直接返回 true，跳过欢迎页）、`ConfigSence`（强制 `isPublicVersion = false`，不显示提示词模板面板）
- **会话上下文**：直连 LLM API 无状态，每次请求需携带完整对话历史。`handleSend` 从 `chatList` 构建 OpenAI 格式 `messages` 数组（过滤 `isOpeningStatement`，user/assistant 交替）→ `SendMessageParams.messages` → `route.ts` 转发 → `LLMAdapter.sendMessage()` 拼接历史 + 当前 query 后调用 API
- **模型关联**：通过 `model_id` 外键严格关联模型库，`loadAgents()` 解析 `model_id` → 填充 `model`（模型名）、`api_key`、`api_url`（Agent 自身字段优先于 Provider 默认值）
- **执行模式**：`execution_mode` 字段控制 Agent 行为（`chat` / `react` / `plan_and_execute`），Admin UI 配置
- **工具系统**：`ToolRegistry` 管理内置工具、MCP 工具、自定义工具；`AgentExecutor` 根据执行模式调用对应工具
- **LangGraph 集成**：`lib/langgraph/` 目录包含状态定义、ReAct 图、Plan-And-Execute 图；使用 `@langchain/langgraph` 和 `@langchain/openai`
- **tiktoken 预加载**：首次请求时下载 tiktoken 编码数据到 `lib/langgraph/tiktoken/o200k_base.json`，后续从本地加载，避免网络超时

**会话切换加载状态：**
- **同步清空**：`handleConversationIdChange` 中先执行 `setChatList([])` + `setIsChatListLoading(true)`，再 `setCurrConversationId`，React 18 批处理合并为单帧
- **竞争防护**：`chatListFetchIdRef` 递增计数器，每轮 fetch 记录 `fetchId`，回调中检查 `chatListFetchIdRef.current !== fetchId` 丢弃过期响应
- **发送拦截**：`checkCanSend` 中 `isChatListLoading` 守卫，阻止发送（toast 提示 + return false），不清空输入
- **侧边栏删除**：`sidebar/index.tsx` 会话条目悬停显示三点按钮，点击弹出删除 dropdown。`data-menu-id` + `target.closest()` 实现 click-outside 关闭。删除当前会话后不自动插入"新的对话"条目，需用户手动点击"新对话"按钮。

**消息气泡删除**：AI 消息气泡操作栏含三点按钮（`MessageActionsDropdown`），使用 `EllipsisHorizontalIcon`，click-outside 关闭模式同侧边栏。展开 dropdown 含"删除"选项，触发 `ConfirmDialog` 确认后删除该条 AI 回复及对应的用户问题。删除同时移除 UI（`setChatList`）和存储（`MessageService.deleteMessagesByIds`）。dropdown 使用 `isLastMessage` 控制方向：最后一条向上展开（`bottom-full`），其余向下（`top-full`），统一 `left-0` 向右伸展。

**ConfirmDialog**：`app/components/base/confirm-dialog/index.tsx` 基于 `@headlessui/react` 的 `Dialog`，支持 `danger`/`default` 两种 variant。按钮和面板使用语义化主题类（`bg-surface-elevated`、`text-content`、`bg-red-500` 等），无硬编码主题色。

#### 服务层
- `lib/services/conversation.ts` — `ConversationService`（对话 CRUD）
- `lib/services/message.ts` — `MessageService`（消息保存/删除，区分用户消息和 AI 回复；`deleteMessagesByIds` 按 ID 精确删除）

#### 问数链路（`data_query` 智能体）
- `lib/services/data-query-pipeline.ts` — 链路编排：查询规范化 → 表选择 → 实时 DDL 注入 → 构建 systemPrompt + 工具上下文（route 只做 HTTP/认证/流式）
- `lib/services/query-normalize.ts` — 查询规范化（多轮指代消解 + 相对时间换算，产物 `canonicalQuery` 替换 agent 最新用户消息）
- `lib/services/schema-select.ts` — 实时 Schema 拉取（information_schema，TTL 缓存 60s）+ 渐进式表选择 + DDL 构建（注释优先级：用户自定义 > 实时 > 快照）
- `lib/services/datasource.ts` — 数据源工具：`parseSchemas`（逗号分隔 schema 解析，默认 `public`）+ `postgresSearchPathOption`（生成 `-c search_path=...` 连接参数，等价 JDBC `currentSchema`）
- `lib/services/dialects.ts` — 数据库方言层：`DatabaseDialect` 接口（`type`/`displayName`/`family`/`dialectPrompt`/`setupReadOnly`）+ 注册表 `getDialect()` + `isPostgresFamily()`。PG 族基类 `PostgresDialect` 承载默认实现，`VastbaseDialect` / `KingbaseDialect` 继承并覆写 `dialectPrompt()` 强制 PG 风格分页（禁用 Oracle ROWNUM 伪列），未来新增 PG 系库建独立方言类覆写特有差异即可，无需改散落分派点
- `lib/tools/builtin/execute-sql.ts` — SQL 执行前做**代码级结构校验**（零 LLM）：解析 SQL 引用的表/列，与实时 schema 比对，拦截不存在的表或列（如 YEAR），返回友好错误让模型修正；同请求内相同 SQL 命中缓存直接返回结果，成功结果附带引导避免模型重复查询。执行按 `dialect.family` 分派，只读保护用 `dialect.setupReadOnly()`

**数据库类型**：`DatasourceConfig.type = 'mysql' | 'postgresql' | 'vastbase' | 'kingbase'`。所有分派点（schema 拉取、SQL 执行、Admin 连接测试/表/字段、动态提示词、语义审计方言名）统一走方言层 `getDialect()` / `isPostgresFamily()`，PG 系（postgresql/vastbase/kingbase）复用 `pg` 驱动与 PG 查询逻辑。Admin UI 切换类型时端口自动联动（mysql→3306，postgresql/vastbase→5432，kingbase→54321，仅当端口为任一默认端口时替换）。

**PostgreSQL 多 Schema**：数据源配置 `schemas` 字段（逗号分隔，仅 PG 生效，默认 `public`）贯穿全链路——Admin 表/字段选择与运行时 schema 拉取用 `table_schema = ANY($1)` 参数化，SQL 执行用连接级 `options: '-c search_path=a,b'`，模型 SQL 无需 schema 前缀。老配置无该字段自动按 `public` 处理。假定不同 schema 间无同名表。

**问数配置开关**（`agent_config`，默认开）：`enable_query_normalization` / `enable_semantic_check`。表选择为强制流程（实时选表 + 实时 schema，失败时配置范围全量实时拉取，无开关）。任一步失败自动降级，不阻断请求。`lib/services/sql-semantic-check.ts` 保留为可选的人工/深度 LLM 审计工具，运行时不再调用。

#### 存储层（远程存储优先）
- **StorageProvider 接口**: `lib/storage/types.ts` 定义统一的存储接口
- **RemoteStorageProvider**: `lib/storage/remote-storage.ts` 实现 HTTP API 存储（客户端使用）
- **存储工厂**: `lib/storage/factory.ts` 根据 `typeof window` 区分服务端（直接用 DB）/ 客户端（HTTP API）
- **数据库适配器**: `lib/db/sqlite.ts` 使用 `sql.js`（纯 JS WebAssembly，无需原生编译）；`lib/db/postgres.ts` 预留
- **API 路由**: `app/api/storage/` 提供存储 API（conversations, messages, feedback, agent-params, backend-conv-id）

**存储后端切换**: 通过 `NEXT_PUBLIC_STORAGE_BACKEND` 环境变量选择（sqlite/postgres）。SQLite 使用时需在 `next.config.js` 中配置 `serverExternalPackages: ['sql.js']` 避免 ESM/CJS 互操作冲突。

**数据流原则**: 客户端只使用远程存储，无 localStorage 缓存。服务端不可用时页面功能受限。

**服务端 vs 客户端路径**:
```
客户端: Component → RemoteStorageProvider → HTTP → /api/storage/xxx → SqliteProvider → SQLite
服务端: API Route → SqliteProvider → SQLite
```

**读操作流程**: ref 缓存 → 远程存储（10s 超时，超时直接 throw）
**写操作流程**: ref 缓存 → 远程存储（关键路径 throw，非关键路径静默失败）
**删除操作流程**: 远程删除（失败 throw）
**初始化流程**: 远程获取（失败 throw，页面不可用）

**会话 ID 隔离**: 同一本地会话中的同一智能体共享 `backend_conversation_id`，不同本地会话中的同一智能体各自独立。

**智能体类型与会话 ID**:
- Dify 类型：在 `onData` 第一个 chunk 中保存 `conversation_id`（通过 `agentTypeMapRef` 判断类型）
- 直连 LLM 类型：无后端会话 ID，上下文通过前端 `messages` 数组保持（包含所有智能体对话）

**详细设计**: `docs/开发指南/多存储后端.md`
**FAQ**: `docs/FAQ.md` §15（多存储后端实施 FAQ）

#### 数据流
```
用户发送消息（可选选择智能体）
  → 同步取当前智能体已存参数 + 验证必填项
  → 前端携带 agent_id 调用 /api/chat-messages
  → 后端根据 agent_id 获取 AgentConfig
  → 根据 backend_type 创建对应适配器
  → 适配器调用对应的后端 API
  → 返回 SSE 流
  → 前端统一处理响应
  → 保存消息到远程存储（携带 agent_id）
  → 更新界面显示
```

### ws-server (Socket.IO)
- **Handler 注册**：`handlers/` 目录下的 `.mjs` 文件自动加载注册
- **命名空间**：`/speech`（语音识别）、`/push`（后端推送，预留）
- **扩展方式**：在 `handlers/` 目录创建新 `.mjs` 文件即可自动注册
- **环境变量**：`WS_PORT`（默认 8787）
- **认证系统**：ws-server 始终作为独立服务，不依赖任何特定项目。支持两种认证模式：
  - `AUTH_MODE=self`（默认）：本地 JSON 配置文件验证（`config/auth.json`）
  - `AUTH_MODE=remote`：调用外部验证 API（`VERIFY_ENDPOINT`）
  - `AUTH_ENABLED=false` 时跳过认证（向后兼容）
  - 详见 `docs/开发指南/认证系统.md`

### Agent 执行模式

**执行模式**（`execution_mode` 字段）控制 Agent 的行为：

| 模式 | 说明 | 工具调用 | 适用场景 |
|------|------|----------|----------|
| `chat` | 纯对话模式 | ❌ 不支持 | 简单问答 |
| `react` | ReAct 模式 | ✅ 支持 | 单步工具调用，动态决策 |
| `plan_and_execute` | Plan-And-Execute 模式 | ✅ 支持 | 复杂多步任务 |

**文件结构**：
```
webapp/lib/langgraph/
├── state.ts                    # 状态 Schema 定义
├── prompts.ts                  # 统一提示词管理
├── tiktoken-preload.ts         # tiktoken 编码预加载
├── tiktoken/
│   └── o200k_base.json         # tiktoken 编码文件（提交到 git）
├── graphs/
│   ├── react-agent.ts          # ReAct 模式图
│   └── plan-and-execute.ts     # Plan-And-Execute 模式图
└── index.ts                    # 导出入口
```

### 工具系统

**ToolRegistry**：工具注册中心，管理所有可用工具。`pendingToolCalls` 使用 `globalThis` 存储，确保 HMR 安全。

**内置工具**：
| 工具名称 | 执行位置 | 描述 |
|----------|----------|------|
| `get_page_content` | client | 获取宿主页面 DOM 内容 |
| `get_selected_text` | client | 获取用户选中的文本 |
| `get_element_by_selector` | client | 按 CSS 选择器获取元素 |
| `fetch_url` | server | 抓取网页内容或搜索互联网 |
| `http_request` | server | 发送 HTTP 请求 |
| `get_current_time` | server | 获取当前时间 |

**工具分类**：
- **客户端工具**（`execution: 'client'`）：通过 SSE 通知客户端执行，客户端回传结果
- **服务端工具**（`execution: 'server'`）：在服务端直接执行

**文件结构**：
```
webapp/lib/tools/
├── types.ts                    # 工具类型定义
├── registry.ts                 # 工具注册中心
└── builtin/
    ├── index.ts                # 内置工具导出
    ├── browser-tools.ts        # 浏览器工具（客户端执行）
    ├── server-tools.ts         # 服务端工具
    ├── fetch-url.ts            # 网页抓取/搜索工具
    └── time-tools.ts           # 时间工具
```

**联网开关（`enable_network`）约定：**
- `enable_network === true` 才允许联网搜索；`!== true`（`false` 或未配置）一律视为关闭。
- 判断规则（`fetch_url` / `http_request` 一致）：URL 带 `http://` 或 `https://` 前缀 = 抓取/请求（不受限，可能是内网/用户指定 URL）；**无协议前缀 = 搜索关键词**，受开关控制，关闭时拒绝并提示。
- `web_search` 当前**未注册**（`allBuiltinTools` 不含 `webSearchTools`）：需搜索引擎 API key（Bing/SerpAPI）且 DuckDuckGo 不可达；若配置 API key 可注册，并由 `agent-executor.ts` 的 `getExcludedTools()` 在关闭时从模型工具列表剔除。
- System prompt：`lib/prompts/index.ts` 的 `getNetworkStatusPrompt` 在 `enable_network !== true` 时提示"不支持联网搜索，只能访问用户明确提供的具体 URL"。

### MCP 集成

**MCP (Model Context Protocol)**：开放标准协议，支持动态工具加载。

**文件结构**：
```
webapp/lib/mcp/
├── client-manager.ts           # MCP Client 管理器
├── tool-adapter.ts             # MCP 工具转 LangChain 工具
├── types.ts                    # MCP 类型定义
└── index.ts                    # 导出入口
```

**Admin UI**：
- `/admin/tools` — 工具管理页面
- `/admin/mcp-servers` — MCP Server 管理页面（CRUD API：`/api/admin/mcp-servers`，GET/POST/PUT/DELETE，`DatabaseProvider` 提供 `getMCPServers`/`getMCPServerById`/`saveMCPServer`/`deleteMCPServer`）

### Theme System (CSS Custom Properties)
- **方案**: CSS Custom Properties，每个主题一个 CSS 变量文件
- **目录结构**: `webapp/app/styles/themes/`（light.css, dark.css, tech-blue.css）
- **工作原理**: Tailwind 配置将语义化类名映射到 CSS 变量，`useTheme` Hook 切换 `<html>` class
- **添加新主题步骤**:
  1. `webapp/app/styles/themes/` 创建新 CSS 文件（如 `ocean.css`），定义 `.ocean { --xxx: ... }`
  2. `webapp/app/styles/globals.css` 添加 `@import './themes/ocean.css'`
  3. `webapp/config/theme.ts` 添加 `OCEAN: 'ocean'`
  4. `webapp/hooks/use-theme.ts` 的 `toggleTheme` 循环中添加
  5. `webapp/app/components/theme-toggle-button/index.tsx` 添加选项
- **语义化类名**: `bg-surface`、`text-content`、`border-border`、`accent`
- **弹出层**: 使用 `bg-surface-elevated`（完全不透明）
- **Focus 样式**: 通过 `--ring` CSS 变量控制
- **文档**: `docs/开发指南/添加新主题.md`

## Voice Recognition

Two engines in `webapp/app/components/chat/voice-recognition/`:
- **browser** (`browser-recognition.ts`): Web Speech API. Hardcoded `lang: 'zh-CN'`. Auto-restarts on `onend`.
- **whisper** (`whisper-recognition.ts`): Socket.IO client (namespace: `/speech`). Supports: whisper-tiny/base/small, funasr-paraformer-zh, funasr-sensevoice. 支持 `authToken` 参数用于 ws-server 认证。

### Core Components
- **`voice-input.tsx`**: Core orchestrator — owns `isActive`, `isListening`, engine callbacks, timers, countdown, pending send logic. 接收 `authToken` prop 传递给 WhisperRecognition。
- **`index.tsx`**: Parent — manages state, per-engine localStorage, prop passing. 将 `apiKey` 作为 `authToken` 传递给 VoiceInput。
- **`voice-settings.tsx**: Settings UI — engine selector, timeout input, checkboxes.

### Auto-Stop & Timer Design
- **`autoStopOnNoInput`**: Stops recording after N seconds of silence.
- **`speechTimerRef`**: Fires once from recording start. Reset on **every** engine callback (final + interim).
- **`noInputMs`**: Per-engine timeout stored in localStorage:
  - Browser: `voice-no-input-ms-browser` (default 5000ms)
  - Whisper: `voice-no-input-ms-whisper` (default 10000ms)
- **`sendTimerRef`**: Debounce before auto-send. Each new result resets the 5s countdown.

### Whisper Server Details
- **`processBuffer`**: Transcribes audio, returns result, does NOT clear buffer until `stop` message
- **Silence detection**: `SILENCE_THRESHOLD=0.03` (RMS amplitude)
- **Result dedup**: Only sends result if text differs from `lastResult`
- **Model preloading**: All three Whisper models loaded in parallel at startup

### Key Gotchas
1. **Server `text !== lastResult` dedup is required**: Prevents duplicate results from resetting client auto-stop timer.
2. **DO NOT trim audio buffer on silence**: Buffer grows ~64KB/s at 16kHz. Cleared only on `stop`.
3. **Speech timer must reset on ALL results** (both final and interim): Never create new timers.
4. **Browser recognition auto-restarts**: `onend` handler calls `engineRef.current.start()` again.
5. **Per-engine timeout in localStorage**: Switching engines loads from the engine's own key.
6. **opencc-js API**: Use `Converter({ from: 'tw', to: 'cn' })` — NOT `createConverter`.
7. **`SEND_DELAY_MS = 5000`**: Debounce delay before auto-sending after timeout.

## Conventions
- **ESLint**: No semicolons, single quotes, 2-space indent (`@antfu/eslint-config`). Run `pnpm fix` to auto-format.
- **Imports**: Use `@/*` alias (maps to `webapp/`). Absolute imports preferred.
- **Components**: `'use client'` required for client components. Server components are the default.
- **Styling**: Tailwind-first. SCSS only for markdown/code. `classnames` or `tailwind-merge` for conditional classes.
- **Theme colors**: Use semantic CSS custom property classes (`text-content-accent`, `border-border`, `hover:bg-surface-hover`) exclusively. Never hardcode theme-specific colors — this includes Tailwind literals (`text-indigo-600`, `bg-red-50`, `border-indigo-100`), SVG fills (`fill="#444CE7"`), and `dark:` variant overrides. When a component needs a color not covered by existing variables: (1) add the CSS variable to all three theme files (`light.css`, `dark.css`, `tech-blue.css`), (2) register it in `tailwind.config.js` under the appropriate semantic group, (3) use the generated class in components. Hover/danger/interactive states each need their own variable — avoid piggybacking on existing variables that happen to share a value.
- **Chat layout**: Chat input uses flex layout (`shrink-0`) to stay at bottom. Scrollbar at screen edge via full-width scrollable container. Auto-scroll: `ResizeObserver` on inner content wrapper (no overflow) triggers `scrollTop = scrollHeight` on outer scroll container — handles message loading, streaming, async markdown rendering.
- **Build**: `next.config.js` disables ESLint and TypeScript errors during build.
- **Turbopack**: 开发模式使用 Turbopack（`next dev --turbopack`），编译速度比 Webpack 快 5-20 倍。注意：CSS `@import` 规则必须在所有规则之前（Turbopack 使用 Lightning CSS，规范要求更严格）。
- **Multi-Agent**: 后端 API 通过 `x-agent-id` header 选择智能体；前端 `AgentSelector` 组件在输入框内与语音按钮同排；
- **After coding**: 每次编写完代码后，运行 `pnpm lint` 和 `pnpm typecheck` 检查，主动询问用户是否需要更新 AGENTS.md。

### Dify 智能体 user 参数规范

Dify 的会话是按 `user` 参数隔离的。**必须使用登录用户 ID 作为 `user` 参数**，不能使用 `session_id` 或其他随机值。

**原因**：Dify 的 `conversation_id` 与 `user` 绑定，不同 `user` 无法访问同一个会话。

**实现**（`app/api/utils/common.ts`）：
```typescript
export const getInfo = (request: NextRequest) => {
  const userId = request.headers.get('x-auth-user-id')
  const integrationId = request.headers.get('x-auth-integration-id')
  const sessionId = request.cookies.get('session_id')?.value || v4()

  // Dify user 优先级：登录用户 > API Key 集成 > session_id
  const difyUser = userId || integrationId || sessionId

  return { sessionId, user: difyUser }
}
```

**容错处理**：当 Dify 返回 `Conversation Not Exists`（404）时，后端应自动重试（不带 `conversation_id`），让 Dify 创建新会话。详见 `lib/adapters/dify.ts` 的 `ConversationNotFoundError`。

### 删除操作确认提示规范

所有删除操作（删除会话、删除消息等）**必须在执行前显示确认对话框**，防止用户误操作。

**实现方式**：使用 `ConfirmDialog` 组件（`app/components/base/confirm-dialog/index.tsx`）。

**示例**：
```tsx
// 1. 添加状态
const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<string | null>(null)

// 2. 删除按钮点击时显示确认
const handleDelete = (id: string) => {
  setDeleteConfirmTarget(id)
}

// 3. 确认后执行删除
const handleDeleteConfirm = async () => {
  if (!deleteConfirmTarget) { return }
  const id = deleteConfirmTarget
  setDeleteConfirmTarget(null)
  // 执行删除逻辑
}

// 4. 渲染确认对话框
<ConfirmDialog
  open={deleteConfirmTarget !== null}
  onClose={() => setDeleteConfirmTarget(null)}
  onConfirm={handleDeleteConfirm}
  title="确认删除"
  message="确定要删除吗？删除后无法恢复。"
  variant="danger"
/>
```

### API 错误响应格式

所有 API 错误响应必须使用标准化格式，包含 `code` 字段供前端翻译：

```typescript
// 正确 ✓
return NextResponse.json(
  { error: 'Invalid captcha', code: 'INVALID_CAPTCHA' },
  { status: 400 }
)

// 错误 ✗ — 硬编码英文字符串，前端无法翻译
return NextResponse.json(
  { error: 'Invalid captcha' },
  { status: 400 }
)
```

**规则**：
- `error`：英文错误描述（用于服务端日志和调试）
- `code`：错误代码常量（用于前端国际化翻译）
- 前端根据 `code` 查找翻译，fallback 到 `error` 或默认提示
- 错误代码使用 UPPER_SNAKE_CASE 命名

**前端处理模式**：
```tsx
const errorCodeMap: Record<string, string> = {
  'INVALID_CAPTCHA': t('common.auth.invalidCaptcha'),
  'INVALID_CREDENTIALS': t('common.auth.invalidCredentials'),
  'ACCOUNT_DISABLED': t('common.auth.accountDisabled'),
}
setError(errorCodeMap[data.code] || data.error || t('common.auth.defaultError'))
```

### basePath 路由规则
- `router.push()` / `redirect()` **自动处理 basePath**，不要手动拼接 `BASE_PATH`
- `window.location.href` / `fetch()` **不自动处理**，需要手动加 `${BASE_PATH}` 前缀
- 所有 API 调用统一使用 `${BASE_PATH}/api/...` 格式，`API_PREFIX` 变量已删除

### middleware 中 basePath 注意事项
- **`request.nextUrl.pathname` 不含 basePath**：Next.js 已自动 strip。例如 `/chat/login` 的 `pathname` 是 `/login`
- **`PUBLIC_PATHS` 不要加 basePath 前缀**：应定义为 `['/login', '/api/auth/verify-token', ...]`，不是 `['/chat/login', ...]`
- **`getLoginUrl` / `getSetupUrl` 需要手动加 basePath**：用 `new URL(\`${basePath}/login\`, request.url)`
- **确保 env 文件一致**：`.env.local` 和 `.env.development` 中 `NEXT_PUBLIC_BASE_PATH` 值应保持一致，避免加载顺序导致的不可预期行为

### Embed 认证
- `RemoteStorageProvider` 需通过 `setApiKey()` 注入 API key，所有 fetch 自动携带 `x-api-key`
- middleware 验证 API Key 后注入 `x-auth-integration-id`（非 `x-auth-user-id`），路由需兼容
- `AgentSelector` / `fetchAgentInfo` 需接收 `apiKey` prop 并在 fetch 中携带
- middleware `PUBLIC_PATHS` 需包含 `/images`（嵌入图标静态资源）
- API Key 必须用 `hashApiKey()` 生成 bcrypt hash 存储，明文无法通过验证

### Next.js 15
- Route handler 的 `params` 是 Promise 类型，必须先 `await` 再访问属性
- **Turbopack 配置**：`next.config.js` 中使用 `turbopack` 字段（非 `webpack`），`resolveAlias` 使用空字符串 `''` 替代 `false`
- **CSS @import 规则**：必须在所有规则之前（`@tailwind`、自定义规则等），Turbopack 使用 Lightning CSS，规范要求更严格

## Environment

### webapp (.env.local)
```
JWT_SECRET="your-secret-key-here"

NEXT_PUBLIC_DEFAULT_THEME=tech-blue

# 项目前缀路径（留空则无前缀，例如 /chat）
NEXT_PUBLIC_BASE_PATH=

# 存储后端：sqlite | postgres
NEXT_PUBLIC_STORAGE_BACKEND=sqlite
# SQLite 数据库路径（仅服务端，相对于 webapp 目录或绝对路径）
SQLITE_DB_PATH=data/openchat.db
# PostgreSQL 连接字符串（仅服务端，后续实现）
# POSTGRES_URL=postgresql://user:password@localhost:5432/openchat
```

### Model Management
- **模型提供商**: `model_providers` 表存储 AI 提供商配置（API key、端点），通过 Admin UI 管理
- **模型库**: `models` 表存储可用模型（关联提供商），支持能力标签、定价、默认参数等完整配置
- **Agent 关联**: `direct_llm` 类型 Agent 通过 `model_id` 外键严格关联模型库，不允许手动输入
- **凭证解析**: `app/api/utils/agents.ts` 的 `loadAgents()` 在加载时自动解析 `model_id` → 填充 `model`、`api_key`、`api_url`（`direct_llm` 类型始终用 Provider 凭证覆盖，避免旧值残留；其他类型 Agent 自身字段优先于 Provider 默认值）
- **Admin UI**: 后台管理新增"模型提供商"和"模型库"两个 tab
- **预置数据**: 首次启动时自动插入 13 个供应商 + 45 个模型（OpenAI、Anthropic、DeepSeek、硅基流动、Google、阿里云百炼、智谱、Kimi、MiniMax、零一万物、百川、小米 MiMo、腾讯混元），仅在表为空时插入
- **DB 迁移**: 旧 `agents.model` 文本字段已移除，迁移时自动匹配 `model_name` → `model_id`；`embed_tokens` 表及相关代码已清理

### System Config
- **系统配置页面**: `/admin/system-config`，单页表单式（非列表式），易于扩展新配置项
- **系统模型**: `system_config` 表中 `system_model_id` 配置项，从 `models` 表选择一个模型用于系统级 AI 功能（如对话标题自动生成）。留空则不启用 AI 功能
- **对话标题生成**: 新对话首条消息发送时立即设置临时标题（前 30 字截取）；AI 回复完成后异步调用 `/api/system/summarize-title`，若配置了系统模型则用模型生成语义化标题覆盖临时标题，未配置或失败则保留临时标题。无需手动开关，配置模型即生效
- **配置迁移**: 旧配置 `title_summarization_model_id` 自动迁移为 `system_model_id`，旧 `title_summarization_enabled` 开关已废弃（不再读取）
- **Admin UI**: 后台管理"系统管理"分组下"系统配置"tab（原"系统模型设置"页面已删除，合并至此）

### ws-server
```
WS_PORT=8787
SPEECH_MODEL=whisper-tiny
AUTH_ENABLED=true       # false = 跳过认证（向后兼容）
AUTH_MODE=remote        # self | remote（主应用使用 remote）
VERIFY_ENDPOINT=http://127.0.0.1:3000/chat/api/auth/verify-token  # remote 模式必填，需包含 basePath
VERIFY_TIMEOUT=5000     # 远程验证超时 ms
AUTO_DOWNLOAD_MODELS=false  # 是否允许自动下载模型（默认 false，不自动下载）
```
配置文件：`ws-server/.env`（从 `.env.example` 复制创建，gitignored）

**语音模型下载**：

启动时不会自动下载模型，需预先下载到 `ws-server/models/` 目录：

```bash
# 下载 Whisper 模型（whisper-tiny、whisper-base、whisper-small）
pnpm download-whisper

# 下载 FunASR 模型（funasr-paraformer-zh、funasr-sensevoice）
pnpm download-funasr
```

### 嵌入式对话组件 (Embed)

**架构**: iframe + postMessage，所有 UI 控件由外层 `embed.min.js` 管理，iframe 仅渲染纯对话内容。

```
embed.min.js (外层, ~450行 vanilla JS)
├── [浮动按钮]      — 可拖动，位置持久化
└── [窗口容器]
     ├── [标题栏]   — ☰ + 标题 + × + 拖拽窗口
     ├── [iframe]   — /embed?apiKey=...&theme=...
     └── [resize]   — 右下角拖拽，min/max 约束
```

**核心文件**:
| 文件 | 作用 |
|------|------|
| `webapp/public/embed.min.js` | 外层脚本（浮动按钮、标题栏、拖拽、resize、postMessage、指令分发） |
| `webapp/app/embed/page.tsx` | `/embed` 页面入口（读取 URL 参数、应用 theme） |
| `webapp/app/embed/main-embed.tsx` | 纯 Main 渲染包装（无标题栏） |
| `webapp/app/components/index.tsx` | `isEmbed` 模式 + `com.openchat.embed` 监听 + 指令提取/postMessage |
| `webapp/app/components/base/streamdown-markdown.tsx` | Markdown 渲染（含指令注释兜底清理） |
| `webapp/lib/command-parser.ts` | 指令解析工具（`extractCommands` + `stripCommands`） |
| `webapp/app/api/utils/common.ts` | `getAdapterForRequest()` — 适配器获取 + 认证校验 |
| `webapp/lib/db/sqlite.ts` | `app_integrations` + `api_keys` 表 |
| `webapp/public/images/embed-icons/` | 14 个内置 SVG 图标（robot/bot/chat/sparkle/headset/message/brain/wand/rocket/puzzle/eye/code/gear） |

**认证流程**: 嵌入请求携带 `x-api-key: sk-xxx` header → 中间件验证 API Key → 查找 `api_keys` 表 → 校验 `is_enabled` + `expires_at` + `allowed_agent_ids`。详见 `docs/开发指南/认证系统.md`。

**嵌入测试**: `test-projects/public/embed-integration.html` — 模拟真实网站，配置 `window.openChatConfig` 后引入 `embed.min.js`。

**配置接口**: `window.openChatConfig = { baseUrl, apiKey, agentId?, icon?, iconUrl?, windowTitle?, theme?, locale?, windowSize?, headerStyle?, bubbleStyle?, bubblePosition?, onCommand?, getAgentParams?, inputs? }`

**AI 指令**: AI 回复中 `<!-- COMMAND:{...} -->` 注释格式的操作指令，`onCompleted` 中提取并剥离后存储；嵌入模式通过 postMessage 发送给宿主（`onCommand` 回调优先，否则触发 `com.openchat.embed` DOM 事件）。

**参数注入**: `getAgentParams` 回调在切换智能体、切换会话、每次发送前调用，宿主返回参数值与表单合并。Vue/React SPA 可注册 `window.__getAgentConversationParams` 全局桥接函数。

**相关文档**:
- `docs/开发指南/嵌入式对话组件.md` — 技术方案全文
- `docs/开发指南/第三方应用集成指南.md` — 面向集成方的使用教程
- `docs/FAQ.md` §16 — 嵌入组件开发 FAQ

## 已知问题和解决方案

### ChatOpenAI API Key 参数
**问题**：`openAIApiKey` 参数不起作用，导致 "Missing credentials" 错误。
**解决方案**：使用 `apiKey` 参数（不是 `openAIApiKey`）。
```typescript
// 正确 ✓
const model = new ChatOpenAI({ apiKey: 'sk-xxx', ... })

// 错误 ✗
const model = new ChatOpenAI({ openAIApiKey: 'sk-xxx', ... })
```
**注意**：不要使用 `process.env.OPENAI_API_KEY`，会有竞争条件问题（多用户并发时 API Key 互相覆盖）。

### tiktoken 网络超时
**问题**：LangChain 尝试从 `https://tiktoken.pages.dev/js/` 下载编码数据，网络不通时超时。
**解决方案**：预先下载编码文件到 `lib/langgraph/tiktoken/o200k_base.json`，代码自动从本地加载。

### 搜索结果解析
**问题**：用正则表达式解析搜索引擎 HTML 不可靠，结构变化会导致解析失败。
**解决方案**：直接返回页面文本内容，让 AI 自己提取和总结信息。

### Plan-And-Execute 状态拼写
**问题**：`'execuring'` 拼写错误（应为 `'executing'`），会导致无限循环。
**解决方案**：确保状态值拼写正确。

### 客户端工具执行
**问题**：Plan-And-Execute 模式最初没有正确处理客户端工具（如 `get_page_content`）。
**解决方案**：将 `context`（包含 SSE controller）传入 executor 节点，使用 `tools.executeClientTool()` 执行客户端工具。

### ToolRegistry pendingToolCalls HMR 丢失
**问题**：`pendingToolCalls` 作为 `ToolRegistry` 实例变量存储，Next.js Turbopack HMR 模块重载时 `globalRegistry` 被重置为 `null`，新建的 `ToolRegistry` 实例与之前存 pending call 的实例不是同一个，导致 `resolveClientToolResult()` 找不到 `tool_call_id`，返回 404。
**解决方案**：`pendingToolCalls` 使用 `globalThis` 挂载，确保跨模块重载和跨实例共享同一个 Map。
```typescript
// registry.ts — 模块级 globalThis 存储
const g = globalThis as any
if (!g.__openchat_pendingToolCalls) {
  g.__openchat_pendingToolCalls = new Map<string, (result: ToolResult) => void>()
}
const pendingToolCalls: Map<string, (result: ToolResult) => void> = g.__openchat_pendingToolCalls

export class ToolRegistry {
  // 不要将 pendingToolCalls 作为实例变量
  // executeClientTool() 和 resolveClientToolResult() 直接使用全局 pendingToolCalls
}
```
**注意**：`tool_call_id` 格式为 `tc_${Date.now()}_${Math.random()}`，唯一性保证不同浏览器不会互相干扰，无需担心跨用户串扰。

## Docs
- **README.md**: 根目录，用户面向的项目文档
- **webapp/README.md**: webapp 详细文档
- **ws-server/README.md**: ws-server 详细文档
- **AGENTS.md**: AI 面向的工程上下文（本文件）
- **docs/**: PRD、系统设计、开发指南、FAQ 等专项文档（根目录）
