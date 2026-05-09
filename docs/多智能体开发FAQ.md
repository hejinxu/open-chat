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
