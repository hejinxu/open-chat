# Conversation Web App

基于 Next.js 15 + React 19 的 Dify AI 对话 Web 应用，支持流式对话、语音输入、工作流可视化和多语言。

## 技术栈

- **框架**: Next.js 15 (App Router) + React 19
- **语言**: TypeScript 5.9
- **样式**: Tailwind CSS 3 + SCSS
- **状态管理**: Zustand + Immer
- **国际化**: i18next（支持中文、英文、日文、法文、西班牙文、越南语）
- **语音识别**: Web Speech API (浏览器端) / Whisper (服务端)
- **代码规范**: @antfu/eslint-config（无分号、单引号、2 空格缩进）

## 功能特性

- 流式对话（SSE Streaming）
- Markdown 渲染（代码高亮、数学公式 KaTeX）
- 工作流可视化（Mermaid 图表）
- 语音输入（浏览器 Speech Recognition + Whisper）
- 语音输入自动停止 & 自动发送
- 繁体/简体中文转换（opencc-js）
- 多语言 i18n
- Docker 部署

## 前置要求

- Node.js >= 18
- pnpm（根目录）
- npm（speech-server/ 子目录）

## 快速开始

### 1. 安装依赖

```bash
pnpm install
cd speech-server && npm install && cd ..
```

### 2. 配置环境变量

创建 `.env.local` 文件：

```bash
# Dify App ID（从应用详情页 URL 获取）
NEXT_PUBLIC_APP_ID=your_app_id

# Dify API Key（从 "API Access" 页面生成）
NEXT_PUBLIC_APP_KEY=your_api_key

# Dify API 地址
NEXT_PUBLIC_API_URL=https://api.dify.ai/v1

# 默认主题
NEXT_PUBLIC_DEFAULT_THEME=tech-blue
```

### 3. 启动开发服务器

```bash
pnpm dev
```

访问 http://localhost:3000

## 语音识别服务

语音识别是独立的 WebSocket 服务，需要单独启动。

### 下载 Whisper 模型

```bash
pnpm download-whisper
```

### 启动语音服务

```bash
pnpm speech-server
```

服务运行在 `ws://localhost:8787`，启动时会自动加载全部 Whisper 模型（tiny、base、small）。

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
│   ├── api/                      # API 路由（代理 Dify 后端）
│   ├── components/               # UI 组件
│   │   └── chat/
│   │       ├── voice-input.tsx   # 语音输入核心组件
│   │       ├── voice-settings.tsx # 语音设置 UI
│   │       └── voice-recognition/ # 语音识别引擎
│   │           ├── browser-recognition.ts
│   │           └── whisper-recognition.ts
│   └── i18n/                     # 国际化配置
├── config/                       # 应用配置
│   ├── index.ts                  # App ID、API Key、API URL
│   └── voice-input.ts            # 语音配置常量
├── i18n/                         # 多语言文件
├── service/                      # API 服务层
├── speech-server/                # 语音识别 WebSocket 服务
│   ├── server.mjs                # 服务端（音频处理、静音检测、opencc）
│   └── package.json
├── stores/                       # Zustand 状态管理
├── docs/                         # 文档
└── scripts/                      # 工具脚本
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动 Next.js 开发服务器（端口 3000） |
| `pnpm build` | 生产构建 |
| `pnpm lint` | 代码检查 |
| `pnpm fix` | 自动修复 lint 问题 |
| `pnpm speech-server` | 启动语音识别服务（端口 8787） |
| `pnpm download-whisper` | 下载 Whisper 模型文件 |

## 注意事项

- ESLint 和 TypeScript 错误在构建时被忽略（`next.config.js` 配置）
- 语音服务使用 npm 管理依赖（有 `package-lock.json`），根目录使用 pnpm
- Whisper 模型首次加载需要下载，请确保网络通畅
- 繁体转简体使用 opencc-js，API：`Converter({ from: 'tw', to: 'cn' })`
