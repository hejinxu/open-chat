# AGENTS.md

## Project
Open Chat - 开放对话平台。pnpm workspace 管理的 monorepo，包含 Next.js 对话客户端 + WebSocket 语音识别服务。支持多种 AI 智能体后端（Dify、FastGPT、n8n、直连大模型等）。

## Monorepo Structure
```
open-chat/
├── webapp/          # Next.js 15 + React 19（对话 + admin）
├── ws-server/       # Socket.IO WebSocket 服务（语音识别）
├── chat-component-vue2/   # 未来：Vue 2 组件库
├── chat-component-vue3/   # 未来：Vue 3 组件库
└── chat-component-react/  # 未来：React 组件库
```

## Commands（在根目录执行）
- `pnpm dev` — 同时启动 webapp + ws-server
- `pnpm dev:webapp` — 只启动 webapp（port 3000）
- `pnpm dev:ws` — 只启动 ws-server（port 8787）
- `pnpm build` — 构建 webapp
- `pnpm start` — 启动生产版本
- `pnpm lint` — ESLint 检查
- `pnpm fix` — 自动修复 lint
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
- **认证系统**: JWT + bcrypt，Next.js Middleware 验证（规划中）
- **多租户**: 组织级数据隔离（规划中）

### Multi-Agent System
- **适配器模式**: `lib/adapters/` 定义 `ChatAdapter` 接口，不同后端类型有独立适配器实现
- **智能体配置**: `webapp/config/agents.config.json`（gitignored）配置多个智能体的 API key、URL、后端类型
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
  name: string                  // 标题（第一条消息前 30 字）
  created_at: number            // Unix 时间戳
  updated_at: number            // Unix 时间戳
  agents: Record<string, {      // 每个智能体在此会话中的状态
    params: Record<string, any>            // 最后参数值
    backend_conversation_id?: string       // Dify 等后端返回的会话 ID
  }>
}
```

**localStorage 布局：**
| Key | 结构 | 说明 |
|-----|------|------|
| `open_chat_conversations` | `ConversationRecord[]` | 会话 + 参数 + backend convId 统一在一处 |
| `open_chat_messages` | `MessageRecord[]` | 消息独立存储，通过 conversation_id 关联 |

**agentKey 规则：永远使用实际智能体 ID**，不使用 `'__default__'` 魔术字符串。`agentKey = selectedAgentId || defaultAgentId`。切换默认智能体时 key 自然变化，旧参数不会泄漏。

**参数同步不变式：** `表单值 == agentInputsCacheRef[agentKey] == localStorage conv.agents[agentKey].params`，三者永远相等。

**参数定义懒加载：** 使用到哪个 Agent 才 fetch 其 `prompt_variables`，取后缓存到 `promptVariablesCacheRef`，再次使用时从缓存同步读取。

**切换智能体：** 始终从服务端 fetch 最新参数定义，清空旧表单，同步清洗已存参数，恢复表单。

**handleSend 守卫：** 区分 `promptConfig === null`（未加载 → 阻塞）与 `prompt_variables === []`（无参数 → 放行）。

**Dify conversation_id 隔离：** 每个智能体独立管理自己的 `backend_conversation_id`，首次发送 `conversation_id: null`，不跨 Agent 共享。

**停止朗读时机：** `handleSend` 入口、切换智能体、切换会话、重新生成、页面卸载。

**旧数据迁移：** `migrateOldData()` 一次性将 `open_chat_conv_agent_params` + `open_chat_dify_conv_map` 合并到 `ConversationRecord.agents`，迁移后删除旧 key。

**welcome 组件安全：** `promptConfig` 可为 null，所有访问使用可选链 `promptConfig?.prompt_variables`。

#### 服务层
- `lib/services/conversation.ts` — `ConversationService`（对话 CRUD）
- `lib/services/message.ts` — `MessageService`（消息保存，区分用户消息和 AI 回复）

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
  → 保存消息到本地存储（携带 agent_id）
  → 更新界面显示
```

### ws-server (Socket.IO)
- **Handler 注册**：`handlers/` 目录下的 `.mjs` 文件自动加载注册
- **命名空间**：`/speech`（语音识别）、`/push`（后端推送，预留）
- **扩展方式**：在 `handlers/` 目录创建新 `.mjs` 文件即可自动注册
- **环境变量**：`WS_PORT`（默认 8787）

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
- **文档**: `docs/添加新主题开发指南.md`

## Voice Recognition

Two engines in `webapp/app/components/chat/voice-recognition/`:
- **browser** (`browser-recognition.ts`): Web Speech API. Hardcoded `lang: 'zh-CN'`. Auto-restarts on `onend`.
- **whisper** (`whisper-recognition.ts`): Socket.IO client (namespace: `/speech`). Supports: whisper-tiny/base/small, funasr-paraformer-zh, funasr-sensevoice.

### Core Components
- **`voice-input.tsx`**: Core orchestrator — owns `isActive`, `isListening`, engine callbacks, timers, countdown, pending send logic.
- **`index.tsx`**: Parent — manages state, per-engine localStorage, prop passing.
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
- **Theme classes**: Use semantic classes (`bg-surface`, `text-content`, `border-border`). Never use `dark:` prefix or hardcoded colors.
- **Chat layout**: Chat input uses flex layout (`shrink-0`) to stay at bottom. Scrollbar at screen edge via full-width scrollable container.
- **Build**: `next.config.js` disables ESLint and TypeScript errors during build.
- **Multi-Agent**: 后端 API 通过 `x-agent-id` header 选择智能体；前端 `AgentSelector` 组件在输入框内与语音按钮同排；`agents.config.json` 包含 API key 不可提交 git。
- **After coding**: 每次编写完代码后，主动询问用户是否需要更新 AGENTS.md。

## Environment

### webapp (.env.local)
```
DATABASE_URL="postgresql://user:password@localhost:5432/openchat"
JWT_SECRET="your-secret-key-here"
NEXT_PUBLIC_DEFAULT_THEME=tech-blue
NEXT_PUBLIC_APP_ID=<dify-app-id>
NEXT_PUBLIC_APP_KEY=<dify-api-key>
NEXT_PUBLIC_API_URL=https://api.dify.ai/v1
```

### webapp/config/agents.config.json（gitignored）
```json
{
  "agents": [
    {
      "id": "default",
      "name": "Dify AI 助手",
      "icon": "🤖",
      "backend_type": "dify",
      "api_key": "app-xxxxx",
      "api_url": "https://api.dify.ai/v1",
      "is_default": true,
      "is_enabled": true
    }
  ]
}
```
模板文件：`webapp/config/agents.config.json.example`（已提交 git）

### ws-server
```
WS_PORT=8787
SPEECH_MODEL=whisper-tiny
```

## Docs
- **README.md**: 根目录，用户面向的项目文档
- **webapp/README.md**: webapp 详细文档
- **ws-server/README.md**: ws-server 详细文档
- **AGENTS.md**: AI 面向的工程上下文（本文件）
- **docs/**: PRD、多智能体实现计划、开发 FAQ、语音识别系统等专项文档（根目录）
