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
- **API proxy**: Routes in `app/api/**/route.ts` use `dify-client` ChatClient to forward requests to Dify backend
- **Client streaming**: `service/base.ts` exports `ssePost` for SSE streaming; `service/index.ts` wraps domain calls
- **State**: Zustand + immer for state management; ahooks for utility hooks
- **Config**: `config/index.ts` holds `APP_ID`, `API_KEY`, `API_URL` from env vars
- **认证系统**: JWT + bcrypt，Next.js Middleware 验证（规划中）
- **多租户**: 组织级数据隔离（规划中）

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
- **docs/**: PRD、语音识别系统等专项文档（根目录）
