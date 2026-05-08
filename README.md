# Open Chat - 开放对话平台

一个支持多种 AI 智能体和大模型后端的统一对话平台，采用 pnpm workspace 管理的 monorepo 架构。

## 项目目标

- **统一对话界面**：一个界面接入多种后端智能体（Dify、FastGPT、n8n、直连大模型等）
- **便捷接入**：通过后台配置即可接入新智能体，无需修改代码
- **完整管理**：用户管理、组织管理、对话记录、模型管理、知识库管理
- **认证系统**：JWT 登录认证 + RBAC 权限控制 + 多租户支持
- **组件复用**：提供可复用的 AI 对话组件库（Vue 2/3、React）

## 项目结构

```
open-chat/
├── package.json              # workspace 根配置
├── pnpm-workspace.yaml       # 定义所有子项目
├── .husky/                   # git hooks
├── webapp/                   # Next.js 主应用（对话 + admin）
│   ├── app/                  # Next.js App Router
│   ├── components/           # React 组件
│   ├── lib/                  # 工具库
│   └── package.json
├── ws-server/                # WebSocket 语音识别服务
│   ├── server.mjs            # 服务入口
│   ├── handlers/             # 功能模块（speech、push）
│   ├── lib/                  # 工具库
│   ├── models/               # 语音模型文件
│   └── package.json
├── chat-component-vue2/      # 未来：Vue 2 AI 对话组件
├── chat-component-vue3/      # 未来：Vue 3 版本
└── chat-component-react/     # 未来：React 版本
```

## 前置要求

- Node.js >= 18
- pnpm >= 8
- PostgreSQL（生产环境）

## 安装

```bash
# 克隆仓库
git clone <repository-url>
cd open-chat

# 安装所有依赖（workspace 自动链接）
pnpm install
```

## 开发

```bash
# 同时启动所有服务（webapp + ws-server）
pnpm dev

# 只启动 webapp（http://localhost:3000）
pnpm dev:webapp

# 只启动 ws-server（ws://localhost:8787）
pnpm dev:ws
```

### 默认端口

| 服务 | 端口 | 说明 |
|------|------|------|
| webapp | 3000 | Next.js 开发服务器 |
| ws-server | 8787 | WebSocket 语音识别服务 |

## 构建

```bash
# 构建 webapp
pnpm build

# 启动生产版本
pnpm start
```

## 下载语音模型

```bash
# 下载 Whisper ONNX 模型（whisper-tiny, whisper-base, whisper-small）
pnpm download-whisper

# 下载 FunASR 模型
pnpm download-funasr

# 下载指定的 Whisper 模型
pnpm --filter ws-server download-whisper -- whisper-tiny
```

## 环境变量

在 `webapp/` 目录下创建 `.env.local` 文件：

```bash
# 数据库（PostgreSQL）
DATABASE_URL="postgresql://user:password@localhost:5432/openchat"

# JWT 认证
JWT_SECRET="your-secret-key-here"

# 默认主题（可选：light / dark / tech-blue）
NEXT_PUBLIC_DEFAULT_THEME=tech-blue

# Dify 后端（向后兼容，无 agent 时 fallback）
NEXT_PUBLIC_APP_ID=
NEXT_PUBLIC_APP_KEY=
NEXT_PUBLIC_API_URL=
```

## 各项目说明

### webapp - Next.js 主应用

基于 Next.js 15 + React 19 的对话客户端和管理后台。

**功能特性**：
- 流式对话（SSE Streaming）
- Markdown 渲染（代码高亮、数学公式 KaTeX）
- 工作流可视化（Mermaid 图表）
- 语音输入（浏览器 Speech Recognition + Whisper）
- 多主题支持（浅色 / 深色 / 科技蓝）
- 多语言 i18n（中文、英文、日文、法文、西班牙文、越南语）
- 管理后台（用户、组织、智能体、模型、知识库管理）

详细文档：[webapp/README.md](./webapp/README.md)

### ws-server - WebSocket 语音识别服务

基于 Socket.IO 的通用 WebSocket 服务，支持语音识别等功能。

**功能特性**：
- Whisper ONNX 模型语音识别
- FunASR 语音识别支持
- 浏览器端语音识别桥接
- 繁体/简体中文转换（opencc-js）
- 静音检测与自动停止

详细文档：[ws-server/README.md](./ws-server/README.md)

### chat-component-vue2 - Vue 2 AI 对话组件（规划中）

让已有 Vue 2 项目快速集成 AI 对话功能的 npm 组件包。

### chat-component-vue3 - Vue 3 AI 对话组件（规划中）

Vue 3 版本的 AI 对话组件。

### chat-component-react - React AI 对话组件（规划中）

React 版本的 AI 对话组件。

## 代码规范

- **ESLint**: @antfu/eslint-config（无分号、单引号、2 空格缩进）
- **格式化**: ESLint 自动修复

```bash
# 检查代码规范
pnpm lint

# 自动修复
pnpm fix
```

## 部署

### Docker

```bash
# 构建镜像
docker build -t open-chat ./webapp

# 运行容器
docker run -p 3000:3000 open-chat
```

### 生产环境

```bash
# 构建
pnpm build

# 启动
pnpm start
```

## 相关文档

- [PRD - 多智能体对话客户端](./docs/PRD-多智能体对话客户端.md)
- [语音识别引擎系统](./docs/语音识别引擎系统.md)
- [添加新主题开发指南](./docs/添加新主题开发指南.md)
- [AGENTS.md](./AGENTS.md) - AI 助手指令

## 许可证

[MIT License](./LICENSE)
