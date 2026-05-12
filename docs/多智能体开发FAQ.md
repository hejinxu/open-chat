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

### 10.3 删除会话后侧边栏列表不更新（需刷新页面）

**现象**：删除会话后 localStorage 已更新，但侧边栏仍显示被删除的会话，刷新页面才消失。

**根因**：删除当前会话时调用 `handleConversationIdChange('-1')` → `createNewChat()`。`createNewChat` 闭包捕获的是删除前的旧 `conversationList`（仍含被删除项），其内部的 `setConversationList(produce(旧列表, ...))` 覆盖了之前 `setConversationList(过滤后列表)` 的结果。

React 18 自动批处理下，同一异步函数内的多次 `setState` 合并为单次渲染，最后一次调用（`createNewChat` 内）覆盖前面的结果。

**修复**：不调 `handleConversationIdChange`，改为删除后重新从 localStorage 拉取全量列表，手动插入 `-1` 条目后 `setConversationList` 只调一次：

```typescript
const handleDeleteConversation = async (id: string) => {
  await getConversationService().deleteConversation(id)
  const { data: allConversations } = await fetchConversations()
  if (currConversationId === id) {
    if (!allConversations.some(c => c.id === '-1'))
      allConversations.unshift({ id: '-1', ... })
    setConversationList(allConversations)
    stopReadAloud()
    setCurrConversationId('-1', APP_ID)
    setConversationIdChangeBecauseOfNew(true)
    hideSidebar()
  } else {
    setConversationList(allConversations)
  }
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
