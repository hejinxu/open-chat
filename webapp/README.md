# Conversation Web App

基于 Next.js 15 + React 19 的 Dify AI 对话 Web 应用，支持流式对话、语音输入、工作流可视化和多语言。

## 技术栈

- **框架**: Next.js 15 (App Router) + React 19
- **语言**: TypeScript 5.9
- **样式**: Tailwind CSS 3 + SCSS + CSS Custom Properties（多主题）
- **状态管理**: Zustand + Immer
- **国际化**: i18next（支持中文、英文、日文、法文、西班牙文、越南语）
- **语音识别**: Web Speech API (浏览器端) / Whisper (服务端)
- **实时通信**: Socket.IO（语音识别、后端推送）
- **代码规范**: @antfu/eslint-config（无分号、单引号、2 空格缩进）

## 功能特性

- 流式对话（SSE Streaming）
- Markdown 渲染（代码高亮、数学公式 KaTeX）
- 工作流可视化（Mermaid 图表）
- 语音输入（浏览器 Speech Recognition + Whisper）
- 语音输入自动停止 & 自动发送
- 繁体/简体中文转换（opencc-js）
- 多主题支持（浅色 / 深色 / 科技蓝）
- 多语言 i18n
- Docker 部署
- **多智能体支持**：Dify、FastGPT、n8n、直连大模型等多种后端
- **Agent 执行模式**：纯对话、ReAct、Plan-And-Execute 三种模式
- **工具系统**：内置工具 + MCP 工具 + 自定义工具
- **客户端工具**：通过 SSE 协议支持客户端执行（如读取宿主页面 DOM）
- **LangGraph 集成**：基于 LangGraph.js 的 Agent 编排框架
- **智能问数**：问数智能体（`data_query`）支持渐进式表选择、查询规范化（多轮指代消解 + 相对时间换算）、实时 Schema 注入、SQL 执行前代码级结构校验（拦截不存在的表/列，零 LLM）

## 前置要求

- Node.js >= 18
- pnpm（根目录）
- npm（ws-server/ 子目录）

## 快速开始

### 1. 安装依赖

```bash
pnpm install
cd ws-server && npm install && cd ..
```

### 2. 配置环境变量

创建 `.env.local` 文件：

```bash
# 项目前缀路径（留空则无前缀，例如 /chat）
NEXT_PUBLIC_BASE_PATH=

JWT_SECRET=your-secret-key-here

# 默认主题
NEXT_PUBLIC_DEFAULT_THEME=tech-blue

# 存储后端：sqlite | postgres
NEXT_PUBLIC_STORAGE_BACKEND=sqlite
SQLITE_DB_PATH=data/openchat.db
```

> 智能体配置（Dify、FastGPT、直连大模型等）通过后台管理界面进行配置，无需在环境变量中设置。

### 3. 启动开发服务器

```bash
pnpm dev
```

访问 http://localhost:3000

## 语音识别服务

语音识别是独立的 Socket.IO 服务，需要单独启动。

### 下载 Whisper 模型

```bash
pnpm download-whisper
```

### 启动语音服务

```bash
pnpm ws-server
```

服务运行在 `ws://localhost:8787/speech`，启动时会自动加载全部 Whisper 模型（tiny、base、small）。

### 处理机制

- **完整 buffer 转写**：保留完整音频上下文供 Whisper 识别，避免碎片化
- **结果去重**：只在转写结果与上次不同时才发送，避免重复结果重置客户端 timer
- **静音检测**：RMS 阈值 0.03，低于阈值的音频段跳过转写
- **自动停止**：用户停止说话后，转写结果不变 → 不发送 → 客户端 timer 正常触发自动停止

支持的语音引擎：
- **browser**: 浏览器内置 Speech Recognition（仅 Chrome 支持）
- **whisper-tiny / whisper-base / whisper-small**: Whisper 本地模型
- **funasr-paraformer-zh / funasr-sensevoice**: FunASR 中文模型

## Docker 部署

```bash
docker build . -t webapp-conversation:latest
docker run -p 3000:3000 webapp-conversation:latest
```

## 项目结构

```
├── app/                          # Next.js App Router
│   ├── api/                      # API 路由
│   │   ├── chat-messages/        # 对话消息 API
│   │   ├── tools/                # 工具管理 API
│   │   └── admin/                # 后台管理 API
│   ├── components/               # UI 组件
│   │   └── chat/
│   │       ├── voice-input.tsx   # 语音输入核心组件
│   │       ├── voice-settings.tsx # 语音设置 UI
│   │       └── voice-recognition/ # 语音识别引擎
│   │           ├── browser-recognition.ts
│   │           └── whisper-recognition.ts
│   ├── admin/                    # 后台管理页面
│   │   ├── agents/               # 智能体管理
│   │   ├── tools/                # 工具管理
│   │   └── mcp-servers/          # MCP Server 管理
│   ├── i18n/                     # 国际化配置
│   └── styles/
│       ├── globals.css           # 全局样式（导入主题文件）
│       ├── themes/               # 主题 CSS 变量
│       │   ├── light.css         # 浅色主题
│       │   ├── dark.css          # 深色主题
│       │   └── tech-blue.css     # 科技蓝主题
│       └── markdown.scss         # Markdown 样式
├── lib/                          # 核心库
│   ├── langgraph/                # LangGraph Agent 编排
│   │   ├── state.ts              # 状态定义
│   │   ├── prompts.ts            # 统一提示词管理
│   │   ├── tiktoken-preload.ts   # tiktoken 预加载
│   │   └── graphs/               # Agent 图定义
│   ├── tools/                    # 工具系统
│   │   ├── types.ts              # 工具类型
│   │   ├── registry.ts           # 工具注册中心
│   │   └── builtin/              # 内置工具
│   ├── services/                 # 业务服务（问数链路）
│   │   ├── data-query-pipeline.ts # 问数链路编排（规范化→表选择→DDL注入）
│   │   ├── query-normalize.ts     # 查询规范化（多轮指代消解 + 相对时间换算）
│   │   ├── schema-select.ts       # 实时 Schema 拉取（TTL 缓存）+ 表选择 + DDL 构建
│   │   └── sql-semantic-check.ts  # 可选的人工/深度 LLM 审计（运行时不再调用）
│   ├── mcp/                      # MCP 集成
│   ├── adapters/                 # 后端适配器
│   └── db/                       # 数据库适配器
├── config/                       # 应用配置
├── i18n/                         # 多语言文件
├── service/                      # API 服务层
├── stores/                       # Zustand 状态管理
└── scripts/                      # 工具脚本
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动 Next.js 开发服务器（端口 3000） |
| `pnpm build` | 生产构建 |
| `pnpm lint` | 代码检查 |
| `pnpm fix` | 自动修复 lint |
| `pnpm typecheck` | TypeScript 类型检查 |

## Agent 执行模式

支持三种执行模式，通过 Admin UI 配置：

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| `chat` | 纯对话模式，不使用工具 | 简单问答 |
| `react` | ReAct 模式，支持工具调用 | 单步查询，动态决策 |
| `plan_and_execute` | Plan-And-Execute 模式 | 复杂多步任务 |

## 工具系统

### 内置工具

| 工具名称 | 执行位置 | 描述 |
|----------|----------|------|
| `get_page_content` | 客户端 | 获取宿主页面 DOM 内容 |
| `get_selected_text` | 客户端 | 获取用户选中的文本 |
| `get_element_by_selector` | 客户端 | 按 CSS 选择器获取元素 |
| `fetch_url` | 服务端 | 抓取网页内容或搜索互联网 |
| `http_request` | 服务端 | 发送 HTTP 请求 |
| `get_current_time` | 服务端 | 获取当前时间 |

### 工具执行流程

- **服务端工具**：直接在服务端执行
- **客户端工具**：通过 SSE 通知客户端执行，客户端回传结果

**注意**：`pendingToolCalls`（客户端工具的待解析 Promise）使用 `globalThis` 存储，确保 HMR 模块重载时不丢失。详见 `lib/tools/registry.ts`。

### MCP 集成

支持 MCP (Model Context Protocol) 协议，可动态加载外部工具：
- Admin UI 管理 MCP Server 连接
- 支持 STDIO、HTTP、SSE 三种传输方式
| `pnpm fix` | 自动修复 lint 问题 |
| `pnpm ws-server` | 启动 WebSocket 服务（端口 8787） |
| `pnpm download-whisper` | 下载 Whisper 模型文件 |

## 注意事项

- ESLint 和 TypeScript 错误在构建时被忽略（`next.config.js` 配置）
- 语音服务使用 npm 管理依赖（有 `package-lock.json`），根目录使用 pnpm
- Whisper 模型首次加载需要下载，请确保网络通畅
- 繁体转简体使用 opencc-js，API：`Converter({ from: 'tw', to: 'cn' })`

## 主题系统

采用 CSS Custom Properties 方案，每个主题定义一套 CSS 变量：

- `app/styles/themes/light.css` — 浅色主题
- `app/styles/themes/dark.css` — 深色主题
- `app/styles/themes/tech-blue.css` — 科技蓝主题

添加新主题步骤：
1. 在 `app/styles/themes/` 创建新 CSS 文件（如 `ocean.css`），定义 `.ocean { --xxx: ... }`
2. 在 `globals.css` 添加 `@import './themes/ocean.css'`
3. 在 `config/theme.ts` 添加 `OCEAN: 'ocean'`
4. 在 `hooks/use-theme.ts` 的 `toggleTheme` 循环中添加
5. 在 `app/components/theme-toggle-button/index.tsx` 添加选项

详细文档见 `../docs/开发指南/添加新主题.md`
