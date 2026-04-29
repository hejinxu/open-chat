# AGENTS.md

## Project
Next.js 15 + React 19 conversation webapp for Dify AI platform. Connects to a Dify backend via REST/SSE and renders chat with streaming responses, voice input, workflow visualization, and i18n (6 locales).

## Commands
- `pnpm dev` — Start Next.js dev server (port 3000)
- `pnpm build` — Production build (uses `next build`)
- `pnpm lint` — Run ESLint
- `pnpm fix` — Auto-fix lint issues
- `pnpm speech-server` — Start WebSocket speech recognition server (port 8787)
- `pnpm download-whisper` — Download Whisper model files

Pre-commit hook runs `pnpm lint-staged` (ESLint on staged `.ts`/`.tsx` files).

## Architecture
- **App Router**: Entry is `app/layout.tsx` → `app/page.tsx` → `app/components/index.tsx`
- **API proxy**: Routes in `app/api/**/route.ts` use `dify-client` ChatClient to forward requests to Dify backend
- **Client streaming**: `service/base.ts` exports `ssePost` for SSE streaming; `service/index.ts` wraps domain calls (`sendChatMessage`, `fetchConversations`, etc.)
- **State**: Zustand + immer for state management; ahooks for utility hooks
- **Config**: `config/index.ts` holds `APP_ID`, `API_KEY`, `API_URL` from env vars
- **Speech server**: Standalone Node.js WebSocket server in `speech-server/` — runs separately from Next.js

## Voice Recognition

Two engines in `app/components/chat/voice-recognition/`:
- **browser** (`browser-recognition.ts`): Uses Web Speech API (`SpeechRecognition`). Hardcoded `lang: 'zh-CN'`. Triggers callback on both `isFinal` and `isInterim` results. Auto-restarts on `onend`. Check browser support: `window.SpeechRecognition || window.webkitSpeechRecognition`.
- **whisper** (`whisper-recognition.ts`): Connects to speech-server via WebSocket. Supports models: whisper-tiny/base/small, funasr-paraformer-zh, funasr-sensevoice.

Engine switching: `voice-settings.tsx` → `VoiceInput` component in `voice-input.tsx`.

### Core Architecture
- **`voice-input.tsx`**: Core orchestrator — owns `isActive`, `isListening`, engine callbacks, timers, countdown, pending send logic.
- **`index.tsx`**: Parent — manages state, per-engine localStorage, prop passing to `VoiceInput`.
- **`voice-settings.tsx`**: Settings UI — engine selector, timeout input, checkboxes.
- **Speech server** (`speech-server/server.mjs`): Standalone Node.js WebSocket server (port 8787). Audio processing, silence detection, opencc Traditional→Simplified conversion.

### Text Accumulation
- **Browser**: Appends segments with comma separator → `accumulatedRef`
- **Whisper**: Server returns full transcription each time → client replaces `accumulatedRef` directly

### Auto-Stop & Timer Design
- **`autoStopOnNoInput`**: Stops recording after N seconds of silence.
- **`speechTimerRef`**: Fires once from recording start. Reset on **every** engine callback (final + interim). Only fires after genuine silence.
- **`noInputMs`**: Timeout duration in ms. Per-engine stored in localStorage:
  - Browser: `voice-no-input-ms-browser` (default 5000)
  - Whisper: `voice-no-input-ms-whisper` (default 10000)
- **`sendTimerRef`**: Debounce before auto-send. Each new result during pending send resets the 5s countdown (`SEND_DELAY_MS`).

### Auto-Send Flow
1. Timeout fires → `isActive=false`, engine stops
2. If `autoSendOnStop` enabled → `pendingSendRef=true`, countdown starts
3. Each interim result during pending send resets the countdown
4. Final result during pending send → reset countdown
5. Countdown expires → send the accumulated text

### Whisper Server Details
- **`processBuffer`**: Transcribes audio, returns result, does NOT clear buffer (buffer grows until `stop` message)
- **`processTimeout`** (`PROCESS_INTERVAL_MS=1500ms`): Timer that fires periodically, can send transcription results
- **Silence detection**: `SILENCE_THRESHOLD=0.03` (RMS amplitude). Results below threshold are skipped in both `processBuffer` and `processTimeout`.
- **Buffer clearing**: Only happens on `stop` message from client, via `lastProcessedLength` tracking
- **Model preloading**: All three Whisper models (tiny, base, small) loaded in parallel at startup via `Promise.all`

### Key Gotchas & Requirements
1. **DO NOT add `text !== state.lastResult` dedup check**: Prevents server from sending results, blocks timer reset. Server sends all results; client decides what to display.
2. **DO NOT trim audio buffer on silence**: Causes fragmented transcriptions. Buffer grows ~64KB/s at 16kHz. Cleared only on `stop`.
3. **Speech timer must reset on ALL results** (both final and interim): Timer starts once, resets on every callback. Never create new timers.
4. **Countdown resets on each result**: `clearCountdown` + `startCountdown` before each timeout.
5. **Browser recognition auto-restarts**: `onend` handler calls `engineRef.current.start()` again. Do not disable this.
6. **Engine callback in `voice-input.tsx`** must check `isActiveRef.current` before processing any result.
7. **Per-engine timeout in localStorage**: Switching engines loads the timeout from the engine's own localStorage key.
8. **opencc-js API**: Use `Converter({ from: 'tw', to: 'cn' })` — NOT `createConverter`.
9. **Server `processBuffer` with `force=true`**: Bypasses silence check. Used by `stop` handler to get final transcription.
10. **`SEND_DELAY_MS = 5000`**: Debounce delay before auto-sending after timeout.

### Related Files
- `config/voice-input.ts`: Voice config constants (per-engine timeouts, engine types)
- `app/components/chat/voice-input.tsx`: Core voice input component
- `app/components/chat/index.tsx`: Parent component (state, per-engine localStorage)
- `app/components/chat/voice-settings.tsx`: Settings UI
- `app/components/chat/voice-recognition/browser-recognition.ts`: Browser SpeechRecognition wrapper
- `app/components/chat/voice-recognition/whisper-recognition.ts`: Whisper WebSocket client
- `speech-server/server.mjs`: Speech server (audio processing, silence detection, opencc)
- `speech-server/package.json`: Speech server dependencies (opencc-js)
- `docs/语音识别引擎系统.md`: Voice system documentation

## Conventions
- **ESLint**: No semicolons, single quotes, 2-space indent (`@antfu/eslint-config`). Run `pnpm fix` to auto-format.
- **Imports**: Use `@/*` alias (maps to project root). Absolute imports preferred.
- **Components**: `'use client'` required for client components. Server components are the default in App Router.
- **Styling**: Tailwind-first. SCSS only for markdown/code. `classnames` or `tailwind-merge` for conditional classes.
- **Build**: `next.config.js` disables ESLint and TypeScript errors during build (`ignoreDuringBuilds: true`).
- **Docker**: `docker build . -t <repo>/webapp-conversation:latest` then `docker run -p 3000:3000` — uses standalone output mode.
- **After coding**: 每次编写完代码后，主动询问用户是否需要将相关业务规则、设计决策或注意事项更新到 AGENTS.md，以便后续会话保持上下文一致。

## Environment
Required in `.env.local`:
```
NEXT_PUBLIC_APP_ID=<dify-app-id>
NEXT_PUBLIC_APP_KEY=<dify-api-key>
NEXT_PUBLIC_API_URL=https://api.dify.ai/v1
NEXT_PUBLIC_DEFAULT_THEME=tech-blue
```

## Docs
- **README.md**: 用户面向的项目文档（技术栈、功能、部署、项目结构等）
- **AGENTS.md**: AI 面向的工程上下文（架构、约定、gotchas、业务规则）
- **docs/**: 语音识别系统等专项文档
- README.md 更新时同步检查 AGENTS.md 是否需要补充相关工程细节
