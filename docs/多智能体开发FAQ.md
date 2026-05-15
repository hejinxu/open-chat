# 多智能体开发 FAQ

> 本文记录多智能体对话客户端开发过程中遇到的各类问题、根因和修复方案，供后续开发和排查参考。

---

## 1. 参数泄漏

### 1.1 发送时包含其他智能体的参数

**现象**：向智能体 B 发送消息时，请求体中的 `inputs` 包含智能体 A 的参数 key。

**根因**：
1. `handleSend` 参数回退链中 `currInputs`（当前表单状态）优先级高于智能体专属存储，切换智能体后表单状态未清零时，旧智能体参数被发送
2. `agentKey` 使用魔术字符串 `'__default__'`，当默认智能体切换后 key 不变，从 localStorage 读到了旧智能体的参数
3. 切换智能体时 `fetchAgentParams` 异步返回，旧 `promptConfig` 未更新前的窗口期内，用户填写的值被 sync effect 以旧 key 名写入新智能体的存储

**修复**：
1. `handleSend` 移除 `currInputs`，改为从 `agentInputsCacheRef[agentKey]` / `getAgentParamsSync` 读取
2. `agentKey = selectedAgentId || defaultAgentId`，始终使用实际智能体 ID，不使用魔术字符串
3. 切换智能体 effect 中立即 `setCurrInputs(null)` + `setPromptConfig(null)` 清空表单

**不变式**：`表单值 == agentInputsCacheRef[agentKey] == localStorage conv.agents[agentKey].params`

---

### 1.2 已存参数包含不存在的 key

**现象**：后端修改了智能体的参数定义（删除了某个参数），但本地仍保存着旧的参数 key。

**根因**：无清洗逻辑。

**修复**：`syncAndCleanParams(convId, agentId, promptVars)` — 对比最新 `prompt_variables` 的 key 集合，删除本地已存参数中多余的 key，写回 localStorage。

---

## 2. Dify conversation_id 泄漏 / 丢失

### 2.1 切换智能体后发送的是旧智能体的 conversation_id

**现象**：切换到智能体 B 后发送消息，Dify 返回 400 错误。

**根因**：`handleSend` 中有跨智能体 fallback——当前智能体没有 convId 时，查默认智能体的 convId 使用。智能体 A 的 conversation_id 被发送给智能体 B，Dify 无法识别。

**修复**：删除 cross-agent fallback，每个智能体独立管理自己的 `backend_conversation_id`，首次发送时 `conversation_id: null`。

---

### 2.2 默认智能体的 conversation_id 无法保存

**现象**：未选择智能体（使用默认）时，Dify 返回的 `conversation_id` 没被保存，下次发送仍为 `null`。

**根因**：`onData` 中 `if (newDifyConvId && agentId)` — 未选智能体时 `agentId=null`，条件不满足。`saveDifyConvId` 内部也有 `!agentId` 守卫。

**修复**：改为 `if (newDifyConvId)` 无条件保存，使用 `agentKey`（含默认智能体 ID）作为存储键。

---

## 3. 页面闪烁 / 刷新

### 3.1 切换智能体时整页变 Loading

**现象**：切换智能体时整页白屏，显示 Loading 动画，体验像页面刷新。

**根因**：`if (!APP_ID || !APP_INFO || !promptConfig) return <Loading />` — 切换智能体 effect 中 `setPromptConfig(null)` 触发全局 Loading 替代整页。

**修复**：
1. 全局条件去掉 `!promptConfig`：`if (!APP_ID || !APP_INFO) return <Loading />`
2. `renderSidebar` 中同样去掉 `!promptConfig`
3. `ConfigSence` / `welcome/index.tsx` 内部自行处理 `promptConfig` 为 null 的情况（加 `promptConfig?.prompt_variables` 可选链）

---

## 4. 发送阻塞

### 4.1 无参数智能体始终提示"参数加载中，请稍后重试"

**现象**：智能体不需要参数（`prompt_variables = []`），但发送时始终被 `handleSend` 拦截。

**根因**：`!promptConfig?.prompt_variables?.length` 无法区分 `null`（未加载）和 `[]`（无参数），两者都为 falsy。

**修复**：
```typescript
// 未就绪 → 阻塞
if (!promptConfig) { notify('参数加载中...'); return }

// 有参数 → 验证必填
if (promptConfig.prompt_variables.length) { ... }
```

---

## 5. 存储分散

### 5.1 一个会话数据散落多个 localStorage key

**现象**：会话参数、Dify conversation_id 分别存在独立 key 中，读写逻辑复杂，容易写错 key。

**修复**：统一到 `ConversationRecord.agents` 字段：
```
open_chat_conversations → ConversationRecord[]
  └─ id, name, timestamps
  └─ agents: {
       "agent-a": { params: {...}, backend_conversation_id: "xxx" },
       "agent-b": { params: {...}, backend_conversation_id: "yyy" }
     }
```

旧数据（`open_chat_conv_agent_params`、`open_chat_dify_conv_map`）由 `migrateOldData()` 一次性迁移到新结构，迁移后删除旧 key。

---

## 6. 语音朗读不停止

### 6.1 切换智能体 / 会话 / 发送消息 / 重新生成时朗读继续

**现象**：执行上述操作后，之前的语音朗读仍在播放。

**根因**：未调用 `window.speechSynthesis.cancel()`。

**修复**：以下时机调用 `stopReadAloud()`：
- `handleSend` 入口（发消息时立停）
- 切换智能体 effect 入口
- `handleConversationIdChange` 入口（切换会话）
- `handleRegenerate` 入口（重新生成）
- 组件卸载 cleanup（页面刷新 / 关闭）

---

## 7. 切换智能体 effect 依赖

### 7.1 页面加载时 effect 重复执行

**现象**：页面初始化后切换智能体 effect 执行一次（`inited` 从 false 变 true），但此时并非用户主动切换 Agent。

**修复**：依赖从 `[selectedAgentId, inited]` 改为 `[selectedAgentId]`，`inited` 仅作为 effect 内部的 guard：`if (!inited) return`。

---

## 8. 本地会话 vs 后端会话

### 8.1 会话列表从本地加载而非从 Dify 后端

**原则**：会话和消息的存储是本地/本库的，只有消息的发送/流式响应通过适配器打到后端智能体。

所有 API 路由（`/api/conversations`、`/api/messages`、`/api/conversations/:id/name`、`/api/messages/:id/feedbacks`）均从本地 `ConversationService` / `MessageService` 读取，不走适配器。

---

## 9. 常见排查命令

```bash
# 查看 localStorage 中的会话数据
JSON.parse(localStorage.getItem('open_chat_conversations'))

# 查看消息数据
JSON.parse(localStorage.getItem('open_chat_messages'))

# 查看迁移标记（为 "1" 表示已完成旧数据迁移）
localStorage.getItem('open_chat_v2_migrated')

# 清除所有本地数据（重置）
localStorage.removeItem('open_chat_conversations')
localStorage.removeItem('open_chat_messages')
localStorage.removeItem('conversationIdInfo')
localStorage.removeItem('open_chat_v2_migrated')
```

---

## 10. 侧边栏会话删除

### 10.1 点击侧边栏其他位置 dropdown 不关闭

**现象**：三点按钮弹出删除 dropdown 后，点击侧边栏内其他会话条目，dropdown 不关闭。

**根因**：`menuRef` 绑在 `<nav>` 上，所有会话条目都在 `ref` 范围内，`contains(e.target)` 始终返回 true。

**修复**：去掉 `useRef`，改用 `data-menu-id` 属性标记 dropdown。`useEffect` 仅在 `openMenuId` 非空时注册 document 监听，用 `target.closest('[data-menu-id="..."]')` 判断点击是否在 dropdown 内。

```typescript
useEffect(() => {
  if (openMenuId === null) return
  const handler = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest(`[data-menu-id="${openMenuId}"]`))
      setOpenMenuId(null)
  }
  document.addEventListener('mousedown', handler)
  return () => document.removeEventListener('mousedown', handler)
}, [openMenuId])
```

dropdown div 加 `data-menu-id={item.id}`，三点按钮也加，确保点击按钮时不触发关闭。

---

### 10.2 再次点击三点按钮 dropdown 重新打开而非关闭

**现象**：dropdown 已打开时再次点击三点按钮，dropdown 先关闭再重新打开。

**根因**：三点按钮不在 dropdown 的 `data-menu-id` 范围内，document mousedown handler 检测到点击不在 dropdown 内 → `setOpenMenuId(null)`。之后 onClick 执行时 `isMenuOpen` 已为 false → `setOpenMenuId(isMenuOpen ? null : item.id)` 重新设为 `item.id`。

**修复**：给三点按钮也加 `data-menu-id={item.id}`，让 `closest` 命中，document handler 跳过。

---

### 10.3 删除会话后自动出现"新的对话"

**现象**：删除当前会话后，侧边栏自动出现一个"新的对话"条目，而不是等用户手动点击"新对话"按钮。

**根因**：`handleDeleteConversation` 中，删除当前会话时自动往列表头部插入了 `{ id: '-1', name: '新的对话' }` 条目。

**修复**：删除自动插入 `-1` 条目的逻辑。删除当前会话后，只刷新列表并设置 `currConversationId='-1'`，"新的对话"仅在用户点击"新对话"按钮时才出现（通过 `createNewChat` 插入）。

```typescript
// 修复后
if (currConversationId === id) {
  setConversationList(allConversations)  // 只刷新列表，不插入 -1
  stopReadAloud()
  setCurrConversationId('-1', APP_ID)
  setConversationIdChangeBecauseOfNew(true)
  hideSidebar()
}
```

---

## 11. 主题颜色不跟随（硬编码颜色在深色模式下看不清）

### 11.1 "Before start..." / "Conversation settings" 文字和 Star 图标不可见

**现象**：深色主题（dark、tech-blue）下，welcome 页面的提示文字、标题文字和 Star 图标几乎不可见。

**根因**：多处使用硬编码 Tailwind 颜色，不跟随主题 CSS 变量：

| 位置 | 硬编码 | 值 |
|------|--------|-----|
| `welcome/index.tsx` 两处 | `text-indigo-600` | `#444CE7` |
| `welcome/index.tsx` | `border-indigo-100` | `#E0EAFF` |
| `value-panel/index.tsx` PanelTitle | `text-indigo-600` | `#444CE7` |
| `massive-component.tsx` StarIcon | `fill="#444CE7"` | `#444CE7` |

`#444CE7` 在深色背景上对比度不足。且 PanelTitle 自身的 `text-indigo-600` 覆盖了父级主题色。

**修复**：

| 文件 | 改前 | 改后 |
|------|------|------|
| `welcome/index.tsx:298` | `text-indigo-600 border-indigo-100` | `text-content-accent border-border` |
| `welcome/index.tsx:319` | `text-indigo-600` | `text-content-accent` |
| `value-panel/index.tsx:46` | `text-indigo-600` | `text-content-accent` |
| `massive-component.tsx` | `fill="#444CE7"` | `fill="currentColor"` |

---

### 11.2 删除按钮 hover 背景色不可见

**现象**：深色主题下 dropdown 删除按钮 hover 时看不到变化。

**根因**：`hover:bg-red-50 dark:hover:bg-red-950` 硬编码颜色不跟随主题。且 dark 主题下 `--surface-elevated` 和 `--surface-hover` 同值 `#374151`。

**修复**：改用语义变量。在三个主题文件中新增 `--danger-hover`，tailwind.config 注册为 `surface.danger-hover`，删除按钮 `hover:bg-surface-danger-hover`。

各主题 `--danger-hover` 值：light `#FEE2E2`（浅红），dark `rgba(239,68,68,0.15)`，tech-blue `rgba(239,68,68,0.12)`。

---

## 12. 按钮 hover 效果不明显

### 12.1 accent 按钮 hover 无背景变化

**现象**：浅色模式下 "New chat" 按钮 hover 时几乎看不到变化。

**根因**：accent 按钮 hover 仅改变边框 `#1C64F2` → `#1A56DB` + 微弱阴影，背景保持 `bg-surface`（白色）。

**修复**：`Button` 组件 accent 变体中增加 `hover:bg-accent-bg-hover`：

```diff
- hover:shadow-sm hover:border-accent-hover
+ hover:shadow-sm hover:border-accent-hover hover:bg-accent-bg-hover
```

`--accent-bg-hover` 已在三个主题中定义：light `#DBEAFE`，dark `rgba(28,100,242,0.3)`，tech-blue `rgba(0,180,255,0.3)`。

---

## 13. 直连大模型智能体

### 13.1 直连 LLM 无需请求会话参数定义

**现象**：`direct_llm` 智能体不应该请求 `/api/parameters`，也不应显示 Dify 风格的参数编辑 UI（"Conversation settings"、"Before start..." 等）。

**根因**：所有 Agent 类型共用同一套"fetch 参数定义 → 设置 `promptConfig` → 渲染参数编辑 UI"流程，`direct_llm` 无参数概念但也走了全流程。

**修复**：

1. `agentTypeMapRef`（`Record<string, string>`）在 init 时从 `agentsRes.agents` 填充每个 Agent 的 `backend_type`
2. 切换智能体 effect 中检查 `agentTypeMapRef.current[agentKey] === 'direct_llm'`，跳过 `fetchAndCachePromptVars`，同步设置 `promptVariablesCacheRef.current[agentKey] = []` 和 `promptConfig = { prompt_variables: [] }`
3. `hasSetInputs` 对 `isDirectLLM` 直接返回 `true`，跳过欢迎页（"👏 Welcome to use Chat APP"）
4. `ConfigSence` 渲染条件加 `inited &&`，防止 init 完成前闪出欢迎页
5. `isPublicVersion` 对 `isDirectLLM` 强制 `false`，不显示提示词模板面板

**不变式**：对于 `direct_llm`，`promptConfig` 始终为 `{ prompt_variables: [] }`，`hasVar` 始终 `false`，renderHeader 正常显示会话标题，renderHasSetInputs 返回 null。

---

### 13.2 直连 LLM 保持会话上下文

**现象**：直连 LLM（如硅基流动）API 无状态，每次请求仅发送当前一条用户消息，无对话历史，模型无上下文。

**根因**：`LLMAdapter.sendMessage()` 每次从 `query` 重建 messages 数组 `[system?, user_query]`，未传入历史消息。

**修复**（4 层传递）：

| 文件 | 改动 |
|------|------|
| `lib/adapters/types.ts` | `SendMessageParams` 新增 `messages?: Array<{role: string, content: string}>` |
| `app/components/index.tsx` | `handleSend` 从 `chatList` 构建完整 OpenAI 格式 messages（过滤 `isOpeningStatement`，user/assistant 交替），放入 `sendData` |
| `app/api/chat-messages/route.ts` | 从 body 提取 `messages`，转发给 `adapter.sendMessage()` |
| `lib/adapters/llm.ts` | `sendMessage` 优先使用传入的 `historyMessages`，在末尾追加当前 `query` 再调用 API |

`service/index.ts` 无需改 —— `{ ...rest }` 自动透传 `messages`。Dify 适配器忽略 `messages` 字段，继续使用 `query` + `conversation_id`。

---

## 14. 会话切换加载状态

### 14.1 切换会话时旧消息残留

**现象**：点击侧边栏切换会话后，旧会话消息仍显示一帧，然后才出现 loading 态。

**根因**：`setChatList([])` 和 `setIsChatListLoading(true)` 放在 `handleConversationSwitch`（useEffect）中，effect 在 React render **之后**才执行。时序为：

```
setCurrConversationId → render(旧chatList) → effect(清空+fetch) → render(空/loading)
```

**修复**：将清空 + 开启 loading 提前到 `handleConversationIdChange` 同步执行：

```typescript
// handleConversationIdChange
else {
  setConversationIdChangeBecauseOfNew(false)
  setChatList([])              // 立即清空
  setIsChatListLoading(true)   // 立即设 loading
}
setCurrConversationId(id, APP_ID)
```

React 18 批处理下，`setChatList([])` + `setIsChatListLoading(true)` + `setCurrConversationId(id)` 合并为单帧渲染，直接显示 loading 态。

---

### 14.2 加载中阻止发送消息

**现象**：消息列表加载中点击发送，可能引发状态混乱。

**修复**：`checkCanSend` 新增 `isChatListLoading` 守卫：

```typescript
if (isChatListLoading) {
  notify({ type: 'info', message: '消息列表加载中，请稍后' })
  return false
}
```

关键：Chat 组件中 `handleSend` 调用 `checkCanSend` 返回 false 时直接 `return`，不调 `onSend`，不清空 `queryRef.current`，用户输入保留。

---

### 14.3 快速连续切换时旧请求覆盖新数据

**现象**：快速连续点击侧边栏切换会话，后发先至的响应可能被先发后至的旧响应覆盖。

**根因**：多个异步 `fetchChatList` Promise 竞争，无过期丢弃机制。

**修复**：`chatListFetchIdRef` 递增计数器模式：

```typescript
chatListFetchIdRef.current += 1
const fetchId = chatListFetchIdRef.current
fetchChatList(currConversationId).then((res) => {
  if (chatListFetchIdRef.current !== fetchId) return  // 过期丢弃
  setChatList(newChatList)
  setIsChatListLoading(false)
}).catch(() => {
  if (chatListFetchIdRef.current !== fetchId) return
  setIsChatListLoading(false)
})
```

---

## 15. 多存储后端（SQLite）

### 15.1 better-sqlite3 原生模块编译失败

**现象**：安装 `better-sqlite3` 后启动 Next.js，报 `Could not locate the bindings file`。

**根因**：`better-sqlite3` 是 Node.js 原生 C++ 模块，需要在目标系统上编译原生代码。Windows 环境下编译失败，缺少 `binding.gyp` 生成的二进制文件。

**修复**：换用 `sql.js`（纯 JavaScript 实现，基于 WebAssembly），无需编译原生模块。API 兼容，支持所有 SQLite 操作。

```bash
pnpm remove better-sqlite3 @types/better-sqlite3
pnpm add sql.js
```

---

### 15.2 Next.js 打包 sql.js 导致 ESM/CJS 互操作冲突

**现象**：`const initSqlJs = require('sql.js')` 和 `await import('sql.js')` 都报 `Cannot set properties of undefined (setting 'exports')`。

**根因**：Next.js 服务端打包器会将动态 `import()` 转换为 webpack 的 `require()` 调用。sql.js 是 ESM 模块，被 CJS 方式引用时产生互操作冲突。

**修复**：在 `next.config.js` 中添加 `serverExternalPackages: ['sql.js']`，阻止 Next.js 打包该模块，让它作为原生 Node.js 模块在运行时加载。

```javascript
// next.config.js
const nextConfig = {
  serverExternalPackages: ['sql.js'],
  // ...
}
```

**正确用法**：
```typescript
// lib/db/sqlite.ts
const initSqlJs = require('sql.js')
const SQL = await initSqlJs()
const db = new SQL.Database(buffer)
```

---

### 15.3 RemoteStorageProvider 导入客户端组件导致服务端报错

**现象**：切换到 SQLite 后端后，现有 API 路由（`/api/conversations`）报 `Toast.notify is not a function`。

**根因**：`RemoteStorageProvider` 导入了 `@/app/components/base/toast`（客户端组件，标记 `'use client'`）。当工厂函数在服务端执行时，导入链包含了客户端组件，Webpack 打包后 `Toast.notify` 变成了 mock 对象。

**修复**：从 `RemoteStorageProvider` 移除 `Toast` 导入，改用回调通知机制。默认回调使用 `console.warn`/`console.error`，客户端组件可通过 `setStorageNotifyCallbacks` 注册自定义通知。

```typescript
// remote-storage.ts
let notifyWarning = (msg: string) => console.warn(msg)
let notifyError = (msg: string) => console.error(msg)

export function setStorageNotifyCallbacks(opts: { warn?: (msg: string) => void; error?: (msg: string) => void }) {
  if (opts.warn) notifyWarning = opts.warn
  if (opts.error) notifyError = opts.error
}
```

---

### 15.4 服务端/客户端 Provider 混用导致循环依赖

**现象**：SQLite 模式下，`ConversationService` 在服务端 API 路由中使用时创建了 `RemoteStorageProvider`，`RemoteStorageProvider` 又向 `http://localhost/api/storage/...` 发 HTTP 请求，形成循环。

**根因**：工厂函数未区分运行环境，服务和客户端都返回同一个 `RemoteStorageProvider`。服务端应直接使用数据库，不应通过 HTTP 访问自己。

**修复**：工厂函数通过 `typeof window === 'undefined'` 检测环境：
- **服务端**：直接返回 `SqliteProvider` 实例（实现 `StorageProvider` 接口）
- **客户端**：返回 `RemoteStorageProvider`（通过 HTTP 访问存储 API）

```typescript
// factory.ts
export function createStorageProvider(): StorageProvider {
  const backend = process.env.NEXT_PUBLIC_STORAGE_BACKEND
  if (backend === 'sqlite' || backend === 'postgres') {
    if (typeof window === 'undefined') {
      // 服务端：直接使用数据库
      return getDatabaseProvider() as unknown as StorageProvider
    } else {
      // 客户端：通过 HTTP API
      return new RemoteStorageProvider()
    }
  }
  return new LocalStorageProvider()
}
```

**流程图**：
```
客户端: Component → ConversationService → RemoteStorageProvider → HTTP → /api/storage/xxx → SqliteProvider → SQLite
服务端: API Route → ConversationService → SqliteProvider → SQLite
```

---

### 15.5 端口残留导致测试混乱

**现象**：测试时多次开关服务器，旧进程未完全杀死，新服务启动时端口被占用，跑到 3001、3002、3003 等随机端口。

**根因**：`pkill -f "next dev"` 在 WSL 环境中可能不会立即杀死所有子进程。

**排查**：
```bash
# 查看端口占用
lsof -ti:3000

# 强制释放所有 Next.js 相关端口
kill $(lsof -ti:3000) $(lsof -ti:3001) $(lsof -ti:3002) $(lsof -ti:3003) 2>/dev/null
```

---

### 15.6 多次开关导致 node_modules 损坏

**现象**：多次运行 `pnpm install`、删除 `node_modules` 后，Next.js 启动报 `Cannot find module '../server/require-hook'`。

**根因**：WSL 环境下 `rm -rf node_modules` 可能因文件锁无法完全删除，导致部分文件残留，`pnpm install` 未重新下载损坏的包。

**修复**：
1. 确保没有进程占用 `node_modules` 下的文件
2. 完全删除 `node_modules` 目录
3. `CI=true pnpm install --no-frozen-lockfile`
4. 注意：`pnpm install` 在此环境中编译耗时 6-10 分钟，需要足够超时时间

---

### 15.7 langium `export *` 转发导致 Webpack 命名导出解析失败

**现象**：启动 `pnpm dev` 后页面报 `Attempted import error: 'Emitter' is not exported from '../utils/event.js' (imported as 'Emitter')`。错误链：`streamdown` → `mermaid` → `@mermaid-js/parser` → `langium` → `vscode-jsonrpc`。

**根因**：`langium/lib/utils/event.js` 只是一个转发文件，内容为 `export * from 'vscode-jsonrpc/lib/common/events.js'`。`Emitter` 类真正定义在 `vscode-jsonrpc` 中。

当 Next.js 通过 `transpilePackages: ['langium']` 编译 `langium` 时，Webpack 遇到 `export *` 转发语句，需要追溯被转发的模块才能知道实际导出了什么。但 `vscode-jsonrpc` **不在** `transpilePackages` 列表中 → Webpack 无法解析 → 报 `Emitter is not exported`。

注意：`langium` 的 `package.json` 设置了 `"type": "module"`，所有 `.js` 文件都按 ESM 处理。`event.js` 的 `export *` 是合法的 ESM 语法，但被 Webpack 转编译时无法跨模块追溯。

**修复**：将 `vscode-jsonrpc` 加入 `transpilePackages`：

```javascript
// next.config.js
transpilePackages: ['langium', 'vscode-jsonrpc', '@mermaid-js/parser'],
```

**原始 `transpilePackages` 对比**：
| 原始配置 | 当前配置 |
|----------|----------|
| `['langium', 'vscode-languageserver-types', 'vscode-languageserver', 'vscode-uri', '@mermaid-js/parser']` | `['langium', 'vscode-jsonrpc', '@mermaid-js/parser']` |

变更说明：
- **移除** `vscode-languageserver-types`、`vscode-languageserver`、`vscode-uri`：这些已在 webpack client alias 中设为 `false`，不需要在服务端编译
- **新增** `vscode-jsonrpc`：`langium` 通过 `export *` 转发其导出，必须纳入编译链

---

## 16. 默认语言配置

### 16.1 页面提示显示英文而非中文

**现象**：发送消息后被 `handleSend` 拦截时，toast 提示 "Please wait for the response to the previous message to complete."，而非中文。

**根因**：i18n 默认语言配置为 `en`。`i18n/index.ts` 中 `defaultLocale: 'en'` 决定了当用户浏览器未指定语言时使用英文翻译。

**修复**：将默认语言改为 `zh-Hans`：

```typescript
// i18n/index.ts
export const i18n = {
  defaultLocale: 'zh-Hans',   // 原值: 'en'
  locales: ['zh-Hans', 'en', 'es', 'ja', 'fr'],
} as const
```

```typescript
// config/index.ts
export const APP_INFO: AppInfo = {
  default_language: 'zh-Hans',  // 原值: 'en'
  // ...
}
```

**i18n 语言加载流程**：
1. 检查 `locale` cookie → 若有则使用
2. 检查浏览器 `Accept-Language` header → 使用 intl-localematcher 匹配
3. 兜底使用 `defaultLocale`

中文翻译文件在 `i18n/lang/app.zh.ts`，对应的键为 `errorMessage.waitForResponse`。

---

## 17. 消息 agent_id / agent_name 为空

### 17.1 未选择智能体时消息记录不绑定智能体身份

**现象**：数据库中 messages 表的 `agent_id` 和 `agent_name` 字段为 `null`，无法追溯消息是哪个智能体产生的。

**根因**：`handleSend` 中三处使用 `agentId || null`（来自参数，为 null 时表示未显式选择智能体），而未改用已回退到默认智能体的 `agentKey`。

```typescript
// 修复前（index.tsx 旧代码）
const agentKey = curAgentId || defaultAgentId  // 正确：已回退到默认智能体
// ...
if (agentId) {                                   // ❌ agentId 为 null，跳过
  agentInfo = await fetchAgentInfo(agentId)
}
// ...
agent_id: agentId || null,                      // ❌ null，应为 agentKey
agent_name: agentInfo?.name || null,             // ❌ null，应为默认智能体名字
```

数据流分析：
| 场景 | `agentId`（参数） | `agentKey`（已回退） | 旧代码 `agent_id` | 正确值 |
|------|-------------------|---------------------|-------------------|--------|
| 选择了智能体 A | `"agent-a"` | `"agent-a"` | `"agent-a"` ✅ | `"agent-a"` |
| 未选择（使用默认） | `null` | `"default-agent"` | `null` ❌ | `"default-agent"` |

**修复**：所有 `agentId` 引用统一改为 `agentKey`：

```typescript
// 修复后
agentInfo = await fetchAgentInfo(agentKey)  // 始终获取智能体信息
// ...
agent_id: agentKey,                          // 始终绑定到正确的智能体
agent_name: agentInfo?.name || null,
```

涉及的三处：
1. **`saveUserMessage`** — 保存用户消息时的 `agent_id` / `agent_name`
2. **`sendData`** — 发送到后端 API 的 `agent_id` header
3. **`responseItem`** — 保存 AI 回复时的 `agent_id` / `agent_name`

---

## 18. 消息删除、滚动与交互优化

### 18.1 消息气泡删除

**现象**：AI 消息气泡下方只有 TTS 朗读、顶踩、重新生成按钮，无法删除单条消息。

**方案**：在 AI 消息气泡操作栏新增三点按钮（`MessageActionsDropdown`），展开 dropdown 含"删除"选项。点击删除弹出 `ConfirmDialog` 确认对话框，确认后同时删除该条 AI 回复及其对应的用户问题。

**实现**：

```
用户点击三点按钮
  → 展开 dropdown（仅含"删除"选项）
  → 点击"删除"
  → 弹 ConfirmDialog（标题"确认删除"，danger 红色确认按钮）
  → 用户确认
  → setChatList 移除 Q+A 对（UI 即时更新）
  → MessageService.deleteMessagesByIds([questionId, answerId])
  → remote → DELETE /api/storage/messages { ids: [...] } → SQLite
  → 成功后同步删除 localStorage
  → 关闭对话框
```

**关键文件**：
- `app/components/chat/answer/message-actions-dropdown.tsx` — 三点按钮 + dropdown 组件
- `app/components/base/confirm-dialog/index.tsx` — 确认对话框（基于 `@headlessui/react` 的 `Dialog`）
- `app/components/chat/answer/index.tsx` — `IAnswerProps` 新增 `onDeleteMessage`、`isLastMessage`
- `app/components/chat/type.ts` — `IChatProps` 新增 `onDeleteMessage`

### 18.2 删除存储链路

原有 `deleteMessages` 仅支持按 `conversation_id` 批量删除整个会话的消息。为支持精确删除单条 Q+A 对，全栈新增 `deleteMessagesByIds(ids: string[])`：

| 层 | 文件 | 说明 |
|----|------|------|
| 接口 | `lib/storage/types.ts` | `StorageProvider.deleteMessagesByIds(ids)` |
| 接口 | `lib/db/types.ts` | `DatabaseProvider.deleteMessagesByIds(ids)` |
| 实现 | `lib/storage/local-storage.ts` | `messages.filter(m => !ids.includes(m.id))` |
| 实现 | `lib/db/sqlite.ts` | `DELETE FROM messages WHERE id IN (?, ...)` |
| 实现 | `lib/storage/remote-storage.ts` | 写锁 → `DELETE /api/storage/messages { ids }` → 同步本地 |
| API | `app/api/storage/messages/route.ts` | DELETE 方法同时支持 `{ conversation_id }`（旧）和 `{ ids }`（新） |
| 服务 | `lib/services/message.ts` | `MessageService.deleteMessagesByIds(ids)` |

### 18.3 dropdown 定位策略

**问题 1**：最后一条消息的 dropdown 向下展开（`top-full`）被消息输入框遮挡。

**解决**：新增 `isLastMessage` prop。最后一条消息用 `bottom-full mb-1`（向上展开），其余用 `top-full mt-1`（向下展开）。

**问题 2**：dropdown 使用 `right-0` 向左伸展，与按钮右对齐，视觉不自然。

**解决**：统一改为 `left-0`，dropdown 左边缘对齐按钮左边缘，向右伸展。

```typescript
// message-actions-dropdown.tsx 定位逻辑
const positionClass = isLastMessage
  ? 'left-0 bottom-full mb-1'   // 最后一条：向右上展开
  : 'left-0 top-full mt-1'      // 其他：向右下展开
```

### 18.4 自动滚动到底部

**问题**：发送消息、切换会话后，消息列表不自动滚动到最下方。

**过程**（已尝试的方案及失败原因）：

| 尝试 | 方案 | 失败原因 |
|------|------|----------|
| 1 | `requestAnimationFrame` + `scrollTop = scrollHeight` | 单帧时序不足，布局计算未完成 |
| 2 | `scrollIntoView({ block: 'end' })` 哨兵元素 | `Streamdown` 异步渲染 markdown 导致二次布局，哨兵位置不准确 |
| 3 | `ResizeObserver` 监听滚动容器（`overflow-y-auto`） | 该容器高度由 flex 决定，内容溢出不改变容器自身尺寸，Observer 不触发 |

**最终方案**：`ResizeObserver` 监听**内层 content wrapper**（无 overflow 限制，高度随内容同步变化），回调中滚动外层 scroll 容器。

| # | 文件 | 改动 |
|---|------|------|
| 1 | `chat/index.tsx` | 新增 `contentWrapperRef`，指向内层 `<div className="...pb-4...">` |
| 2 | `chat/index.tsx` | `ResizeObserver` 监听 `contentWrapperRef`，回调 `chatListContainerRef.current.scrollTop = scrollHeight` |
| 3 | `chat/index.tsx` | 挂载时注册，卸载时 `disconnect()`，不依赖帧时序 |

**关键洞察**：`overflow-y-auto` 容器的 content-box 尺寸由 flex 布局决定，不会因溢出内容增多而变大。必须监听内部无 overflow 限制的子容器。

---

## 19. 嵌入式对话组件 FAQ

### 19.1 嵌入时出现 Hydration Mismatch 错误

**现象**：`/embed` 页面控制台报 `Hydration failed because the server rendered HTML didn't match the client`。

**根因**：`Main` 组件中 `isEmbed` 通过 `typeof window !== 'undefined' && window.location.pathname.startsWith('/embed')` 检测，服务端 `typeof window === 'undefined'`，客户端为 `'object'`，分支不一致。

**修复**：改为从 `props.params.isEmbed` 读取。`main-embed.tsx` 传入 `<Main params={{ isEmbed: true, embedToken }}>`，`Main` 中 `const isEmbed = !!(props?.params?.isEmbed)`。

---

### 19.2 嵌入窗口出现双层标题栏

**现象**：`embed.min.js` 外层有标题栏，iframe 内 `/embed` 页面也渲染了标题栏，出现双层。

**根因**：`main-embed.tsx` 渲染了标题栏，同时 `embed.min.js` 的外层容器也有标题栏。

**最终方案**：全部 UI 控件收归外层 `embed.min.js` 管理。`main-embed.tsx` 精简为纯 `<Main>` 渲染（`div.flex-1.min-h-0 > Main`）。iframe 只负责对话内容，不带任何标题栏。

---

### 19.3 嵌入窗口中输入框不在底部

**现象**：对话输入框悬浮在窗口中间，没有贴底。

**根因**：flex 布局高度链路断裂。`Main` 组件在嵌入模式时使用了 `h-full` + `flex-1 min-h-0` 等 hack，破坏了主应用原生的 `h-screen` + `overflow:hidden` 布局。

**修复方案**：嵌入模式完全复用主应用的布局逻辑——外层 `bg-surface`（无额外高度 class）、flex 容器 `overflow:hidden`、main content `h-screen`。标题栏在 flex 容器上方自然占位，`overflow:hidden` 裁切 `h-screen` 多出的标题栏高度。和主应用 F12 移动端模式完全一致。

**关键洞察**：不要为 embed 模式引入特殊的高度链逻辑，应复用主应用经过验证的布局。

---

### 19.4 ☰ 侧边栏按钮无响应

**现象**：外层标题栏点击 ☰ 按钮，iframe 内没有打开侧边栏。

**根因**：使用了 `iframe.contentWindow.dispatchEvent(new CustomEvent(...))`，但不同 JavaScript 上下文之间的 CustomEvent 不稳定，事件对象在跨 iframe 边界时可能丢失。

**修复**：改为 `iframe.contentWindow.postMessage({ type: 'com.openchat.embed', action: 'toggle-sidebar' }, '*')`。iframe 内 `Main` 组件通过 `window.addEventListener('message', ...)` 监听。`postMessage` 是浏览器专门为跨 frame 通信设计的 API，稳定可靠。

---

### 19.5 嵌入窗口中 theme 不生效

**现象**：`config.theme = 'tech-blue'`，但窗口内仍显示 light 主题。

**根因**：`/embed` 页面布局的 `<html>` 标签缺少主题 class（如 `tech-blue`），CSS 变量未切换。

**修复**：`embed/page.tsx` 的 `EmbedContent` 组件从 URL 读取 theme，通过 `useEffect` 将 class 应用到 `document.documentElement`，同时用 `themeApplied` state 确保 class 应用后再渲染子组件，避免闪烁。

---

### 19.6 API 认证对所有 API 的影响

**问题**：引入 middleware 认证后，是否会影响现有直接使用模式？

**防护**：三层守卫确保零影响：
1. middleware 检查 `AUTH_ENABLED` 环境变量，`false` 时放行所有请求
2. 所有 API 路由通过 `isRequestAuthenticated(request)` 检查 middleware 注入的 header（`x-auth-user-id` 或 `x-auth-integration-id`）
3. `AUTH_ENABLED=false` 时 `isRequestAuthenticated` 直接返回 `true`

现有模式（`AUTH_ENABLED=false`）请求不携带认证信息，代码路径与改动前完全一致。

---

### 19.7 内置图标系统

**问题**：如何添加或替换嵌入浮动按钮的默认图标？

**设计**：
- 内置 14 个 SVG 图标，存于 `webapp/public/images/embed-icons/`，名称分别为 `robot` / `bot` / `chat` / `sparkle` / `headset` / `message` / `brain` / `wand` / `rocket` / `puzzle` / `eye` / `code` / `gear`
- 图标规格：52×52px 圆形底 + 白色图形，背景色均取自 Tailwind 色板
- 默认使用 `robot`，通过 `config.icon = 'chat'` 切换
- `config.iconUrl` 优先级高于 `icon`，设置后直接使用外部 URL
- 图标路径：`${baseUrl}/images/embed-icons/${iconName}.svg`

**添加新图标**：
1. 创建 52×52 SVG 放入 `webapp/public/images/embed-icons/`
2. 更新 `docs/第三方应用集成指南.md` 的内置图标表
3. 更新 `embed-test/public/index.html` 的说明文字

---

### 19.8 标题栏样式配置

**问题**：`headerStyle` 不填时的默认值从哪来？

**设计**：`headerStyle` 的默认值取自 `themeColors` 映射。`embed.min.js` 中定义：

```javascript
var themeColors = {
  light:      { bg: '#ffffff',    border: '#e5e5e5' },
  dark:       { bg: '#1f2937',    border: '#374151' },
  'tech-blue':{ bg: 'rgba(14,25,51,0.98)', border: 'rgba(100,150,255,0.25)' },
}
```

标题栏各属性默认值：

| 属性 | 默认来源 |
|------|----------|
| `backgroundColor` | `themeColors[theme].bg` |
| `borderColor` | `themeColors[theme].border` |
| `textColor` | `'#333'` |
| `iconColor` | `'#666'` |
| `buttonHoverBg` | `'rgba(0,0,0,0.06)'` |

`headerStyle` 中任意属性设置即覆盖对应默认值。

---

### 19.9 嵌入窗口的通信机制

**问题**：外层 `embed.min.js` 如何控制 iframe 内的侧边栏？

**机制**：

| 方向 | 通道 | 消息 |
|------|------|------|
| 外层 → iframe（☰ 按钮） | `iframe.contentWindow.postMessage` | `{ type: 'com.openchat.embed', action: 'toggle-sidebar' }` |
| iframe 接收 | `window.addEventListener('message')` | 过滤 `type === 'com.openchat.embed' && action === 'toggle-sidebar'` → `showSidebar()` |

**为什么不用 CustomEvent**：`iframe.contentWindow.dispatchEvent(new CustomEvent(...))` 在跨 JavaScript 上下文传递时不稳定（CustomEvent 对象在创建方构造函数中，目标 window 无法正确识别），改用浏览器原生 `postMessage` API 保证可靠性。

**安全**：监听方通过 `e.data?.type === 'com.openchat.embed'` 过滤，只响应特定消息格式，忽略其他来源。未来如需扩展更多跨 frame 通信，统一使用 `com.openchat.embed` 命名空间。

---

### 19.10 嵌入窗口中语音设置面板被裁切

**现象**：点击语音设置按钮（齿轮图标）后，弹出面板左侧部分被截断，尤其在 iframe 宽度较小时明显。

**根因**：`VoiceSettings` 面板使用 `absolute` 定位，但祖先链路存在 `overflow: hidden`（`components/index.tsx` 的 main content div）。`absolute` 定位的元素在溢出 `overflow: hidden` 容器边界时会被裁切。主应用中因为面板在全屏内不超出边界所以正常，iframe 宽度受限时面板横向超出就被截。

**修复**：`voice-settings.tsx` 改为 `fixed` 定位 + 动态位置计算。

```typescript
// 读取按钮位置
const rect = btnRef.current.getBoundingClientRect()
// 计算面板位置：优先显示在上方，空间不够则显示在下方
let top = rect.top - panelH - gap
if (top < 8) { top = rect.bottom + gap }
// 左侧边界限制 8px
let left = rect.right - panelW
if (left < 8) { left = 8 }
```

关键改动：
1. 按钮加 `ref`，用于 `getBoundingClientRect()` 读取位置
2. 面板从 `absolute` 改为 `fixed`（以 iframe 视口为基准，不受祖先 `overflow` 裁切）
3. 监听 `resize` 事件，窗口大小变化时重新定位
4. 主应用和嵌入模式都使用 `fixed` 定位，兼容两者

---

## 20. 认证系统与会话管理

### 20.1 Session Cookie（关闭浏览器后需重新登录）

**需求**：关闭浏览器后，下次打开需要重新登录。

**实现**：登录 API 设置 cookie 时不指定 `maxAge`，使其成为 session cookie：

```typescript
// app/api/auth/login/route.ts
response.cookies.set('auth_token', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  // 不设置 maxAge → session cookie，关闭浏览器后自动过期
})
```

Session cookie 在浏览器关闭时自动清除，无需手动删除。

---

### 20.2 Setup 页面自动跳转到 Login

**需求**：已有用户时访问 `/setup` 应自动跳转到 `/login`。

**问题**：Next.js middleware 对 `/setup` 页面路由不生效（`experimental.nodeMiddleware` 在某些情况下不触发），导致无法通过 middleware 做重定向。

**修复**：在页面层面做 server-side 检查，不依赖 middleware：

```typescript
// app/setup/page.tsx (Server Component)
import { redirect } from 'next/navigation'
import { getDatabaseProvider } from '@/lib/db'
import { BASE_PATH } from '@/config'
import SetupForm from './setup-form'

export default async function SetupPage() {
  const db = getDatabaseProvider()
  await db.ensureReady()
  const users = await db.getUsers()
  if (users.length > 0) {
    redirect(`${BASE_PATH}/login`)
  }
  return <SetupForm />
}
```

表单逻辑提取到 `setup-form.tsx`（Client Component），创建成功后显示 3 秒倒计时跳转到登录页。

---

### 20.3 Setup API 清理孤立 user_accounts

**需求**：手动删除 `users` 表记录后，重新运行 setup 应能正常创建用户。

**问题**：`users` 表为空但 `user_accounts` 表有孤立记录时，`login_identifier` 的 UNIQUE 约束导致 INSERT 失败。

**修复**：setup API 中，当 `users` 表为空时，检查并删除孤立的 `user_accounts` 记录：

```typescript
// app/api/auth/setup/route.ts
const users = await db.getUsers()
if (users.length > 0) {
  return NextResponse.json({ error: 'Setup has already been completed' }, { status: 403 })
}

// users 表为空 — 清理孤立记录
const existingAccount = await db.getUserAccountByIdentifier(identifier)
if (existingAccount) {
  await db.deleteUserAccount(existingAccount.id)
}
```

---

### 20.4 basePath 路由跳转需动态读取

**需求**：设置 `NEXT_PUBLIC_BASE_PATH=/chat` 后，登录/设置等页面的跳转应包含 basePath 前缀。

**问题**：硬编码 `window.location.href = '/'` 或 `router.push('/login')` 会跳到 `localhost:3000/` 而非 `localhost:3000/chat/`，导致 404。

**修复**：`config/index.ts` 导出 `BASE_PATH` 常量，所有页面跳转统一使用：

```typescript
// config/index.ts
export const BASE_PATH = `${process.env.NEXT_PUBLIC_BASE_PATH || ''}`

// app/login/page.tsx
window.location.href = `${BASE_PATH}/`

// app/setup/page.tsx (Server Component)
redirect(`${BASE_PATH}/login`)
```

所有 API 调用统一使用 `${BASE_PATH}/api/...` 格式，不再使用 `API_PREFIX` 变量。

---

### 20.5 会话标题立即设置（不等 AI 回复）

**需求**：发送第一条消息后立即设置会话标题，即使 AI 回复失败也能正确显示标题。

**问题**：标题在 `onCompleted(hasError=false)` 中设置，AI 回复出错时 `hasError=true` 直接 return，标题永远是"新的对话"。

**修复**：将标题更新移到用户消息保存之后，立即异步设置：

```typescript
// app/components/index.tsx — handleSend 中
await saveUserMessage({ ... })

// 新会话首条消息：立即异步设置标题，不等 AI 回复
if (getConversationIdChangeBecauseOfNew()) {
  const title = message.slice(0, 30) + (message.length > 30 ? '...' : '')
  updateLocalConversationName(localConvId, title) // 无需 await
}

// onCompleted 中只做侧边栏刷新，不再更新标题
```

---

## 21. basePath 双重前缀

### 21.1 router.push / redirect 自动加 basePath

**现象**：`router.push('/login')` 或 `redirect('/login')` 跳转后 URL 变成 `/chat/chat/login`，404。

**根因**：Next.js 的 `router.push()` 和 `redirect()` **自动处理 basePath**，手动拼接 `BASE_PATH` 会导致双重叠加。

**规则**：

| API | 自动加 basePath | 需要手动加 `BASE_PATH` |
|-----|----------------|----------------------|
| `router.push()` | ✅ 是 | ❌ 不需要 |
| `redirect()` (Server Component) | ✅ 是 | ❌ 不需要 |
| `window.location.href` | ❌ 否 | ✅ 需要 |
| `fetch()` | ❌ 否 | ✅ 需要 |

**修复**：

```typescript
// ❌ 错误
router.push(`${BASE_PATH}/login`)
redirect(`${BASE_PATH}/admin/users`)

// ✅ 正确
router.push('/login')
redirect('/admin/users')

// ✅ 正确（window.location 需要手动加）
window.location.href = `${BASE_PATH}/`
```

---

## 22. Embed 认证 401

### 22.1 RemoteStorageProvider 不携带 x-api-key

**现象**：嵌入集成页面访问 `/api/storage/conversations` 等接口报 401，但 `/api/config/agents` 等接口正常。

**根因**：`RemoteStorageProvider` 的所有 `fetch()` 调用没有传递 `x-api-key` header。init 阶段的 `fetchConversations()` 调用链不携带认证信息。

**修复**：`RemoteStorageProvider` 新增 `setApiKey()` 方法，所有 fetch 统一携带：

```typescript
// remote-storage.ts
export class RemoteStorageProvider {
  private apiKey: string | null = null

  setApiKey(key: string | null) {
    this.apiKey = key
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.apiKey) headers['x-api-key'] = this.apiKey
    return headers
  }
}

// index.tsx init 中注入
const storageProvider = getStorageProvider()
if (storageProvider instanceof RemoteStorageProvider && apiKey) {
  storageProvider.setApiKey(apiKey)
}
```

### 22.2 /api/auth/me 返回 401（API Key 认证）

**现象**：嵌入模式下 `/api/auth/me` 返回 401，尽管请求头携带了 `x-api-key`。

**根因**：`/api/auth/me` 路由只检查 `x-auth-user-id`（JWT 认证），不识别 `x-auth-integration-id`（API Key 认证）。middleware 验证 API Key 后注入的是 `x-auth-integration-id`，不是 `x-auth-user-id`。

**修复**：路由兼容两种认证方式：

```typescript
// api/auth/me/route.ts
const userId = request.headers.get('x-auth-user-id')
const integrationId = request.headers.get('x-auth-integration-id')

if (!userId && !integrationId) {
  return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
}

if (integrationId && !userId) {
  return NextResponse.json({
    user: { id: integrationId, name: 'API User', role: 'user' },
  })
}
```

### 22.3 AgentSelector / fetchAgentInfo 不携带 apiKey

**现象**：嵌入模式下 `AgentSelector` 和 `fetchAgentInfo` 的 fetch 请求报 401。

**根因**：这两个组件独立发起 fetch，没有接收或传递 `apiKey` prop。

**修复**：

```typescript
// agent-selector.tsx — 新增 apiKey prop
interface AgentSelectorProps {
  value: string | null
  onChange: (agentId: string | null) => void
  apiKey?: string  // 新增
}

// fetch 时携带
const headers = apiKey ? { 'x-api-key': apiKey } : undefined
fetch(`${BASE_PATH}/api/config/agents`, { headers })
```

```typescript
// index.tsx fetchAgentInfo — 携带 apiKey
const headers = apiKey ? { 'x-api-key': apiKey } : undefined
const res = await fetch(`${BASE_PATH}/api/config/agents`, { headers })
```

---

## 23. Embed 图标不显示

**现象**：浮动按钮只显示背景色，图标不显示。

**根因**：`/images/embed-icons/robot.svg` 被 middleware 拦截（`AUTH_ENABLED=true`），307 重定向到 `/login`。

**修复**：在 middleware 的 `PUBLIC_PATHS` 中添加 `/images`：

```typescript
const PUBLIC_PATHS = [
  // ...existing
  '/images',  // 新增：嵌入图标等静态资源
]
```

---

## 24. Next.js 15 route params 必须 await

**现象**：API 路由中 `params.integrationId` 报错：`params should be awaited before using its properties`。

**根因**：Next.js 15 中，route handler 的 `params` 变为 Promise 类型，必须先 await。

**修复**：

```typescript
// ❌ Next.js 14
export async function GET(
  request: NextRequest,
  { params }: { params: { integrationId: string } },
) {
  const id = params.integrationId  // 直接访问
}

// ✅ Next.js 15
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ integrationId: string }> },
) {
  const { integrationId } = await params  // 先 await
}
```

---

## 25. API Key bcrypt hash 明文存储

**现象**：管理面板创建的 API Key 无法通过 middleware 验证，始终返回 401。

**根因**：旧 `embed_tokens` 表迁移到 `api_keys` 时，key 以**明文**存储而非 bcrypt hash。middleware 用 `bcrypt.compare(plainKey, hash)` 验证，明文无法匹配。

**排查**：

```sql
-- 检查 key_hash 是否为 bcrypt hash（以 $2b$ 开头）
SELECT key_prefix, key_hash FROM api_keys;
```

**修复**：重新 hash：

```javascript
const bcryptjs = require('bcryptjs')
const hash = await bcryptjs.hash('sk-xxx', 10)
db.run('UPDATE api_keys SET key_hash = ?', [hash])
```

**预防**：创建 API Key 时确保使用 `hashApiKey()` 函数生成 hash。

---

## 26. 嵌入模式下菜单权限控制

### 26.1 管理后台菜单对普通用户隐藏

**需求**：侧边栏用户菜单中的「管理后台」只对 admin 角色显示。

**实现**：

```tsx
{user.role === 'admin' && (
  <button onClick={handleAdmin}>管理后台</button>
)}
```

### 26.2 嵌入模式下隐藏管理后台和退出登录

**需求**：嵌入 iframe 中不显示「管理后台」和「退出登录」。

**实现**：Sidebar 新增 `isEmbed` prop：

```tsx
{user.role === 'admin' && !isEmbed && (
  <button onClick={handleAdmin}>管理后台</button>
)}
{!isEmbed && (
  <button onClick={handleLogout}>退出登录</button>
)}
```

---

## 27. 嵌入窗口四边拉伸

**需求**：嵌入弹窗支持上下左右四边及四个角的拖拽拉伸。

**实现**：`embed.min.js` 中创建 8 个方向的 resize handle：

| 方向 | cursor | 拉伸时改变的属性 |
|------|--------|-----------------|
| n/s | ns-resize | height + top |
| e/w | ew-resize | width + left |
| nw/ne/sw/se | nwse/nesw-resize | width + height + left + top |

**状态持久化**：按钮位置和窗口状态（大小 + 位置）统一存储在单个 localStorage key `open_chat_embed_state`：

```json
{
  "btn": { "x": 1868, "y": 1028 },
  "win": { "w": 420, "h": 640, "x": 1476, "y": 416 }
}
```

- **无保存数据**：窗口位置默认右下角（`viewport - width - 24`），窗口大小取 `windowSize` 配置
- **拖拽/resize 后**：`{w, h, x, y}` 覆盖写入，下次打开恢复上次状态
- **`openWindow()` 每次打开时实时读取 localStorage**，不依赖缓存变量，确保拖拽后立即生效

**关键实现细节**：

| 事件 | 保存内容 | 说明 |
|------|----------|------|
| 浮动按钮拖拽结束 | `btn: {x, y}` | `saveState({ btn: {...} })` |
| 窗口标题栏拖拽结束 | `win: {w, h, x, y}` | 从 `container.offsetWidth/Height` 和 `style.left/top` 读取 |
| 窗口 resize 过程中 | `win: {w, h, x, y}` | 实时保存，拖拽过程中也写入 |

**边界 clamp**：`openWindow()` 用实际窗口宽高 `fw`/`fh` 做 clamp，确保窗口不会超出屏幕：

```js
container.style.left = Math.max(0, Math.min(window.innerWidth - fw, fx)) + 'px'
container.style.top = Math.max(0, Math.min(window.innerHeight - fh, fy)) + 'px'
```

**不要犯的错**：
1. `onWinDragEnd` 必须保存窗口位置（之前遗漏导致每次打开回到默认位置）
2. `openWindow()` 必须每次从 localStorage 读最新值，不能用页面加载时缓存的变量
3. clamp 必须用窗口实际宽高，不能硬编码 `100` 或其他常量
