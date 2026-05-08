# WS Server - 通用 WebSocket 服务

基于 Socket.IO 的通用 WebSocket 服务，支持多种服务能力（语音识别、后端推送等）。

## 架构

```
客户端                              WS Server (ws://localhost:8787)
┌──────────────┐    Socket.IO     ┌──────────────────┐
│ socket.io-    │ ──────────────→ │ Handler 注册中心   │
│ client        │ ←────────────── │                  │
└──────────────┘                  │ ┌──────────────┐ │
                                  │ │ /speech      │ │ 语音识别
                                  │ │ /push        │ │ 后端推送
                                  │ └──────────────┘ │
                                  └──────────────────┘
```

## 快速开始

```bash
# 1. 安装依赖（在 monorepo 根目录）
cd open-chat
pnpm install

# 2. 启动服务
pnpm dev:ws
```

## 下载语音模型

```bash
# 在 monorepo 根目录执行
pnpm download-whisper    # 下载 Whisper ONNX 模型
pnpm download-funasr     # 下载 FunASR 模型

# 或直接在 ws-server 目录执行
cd ws-server
node scripts/download-whisper-model.js
node scripts/download-funasr-model.js

# 下载指定的 Whisper 模型
node scripts/download-whisper-model.js whisper-tiny
```

模型文件保存位置：`ws-server/models/`

## Handler 机制

服务通过 Handler 插件架构扩展功能。每个 Handler 实现以下接口：

```javascript
export default {
  name: 'speech',           // Handler 名称（唯一）
  namespace: '/speech',     // Socket.IO namespace

  init(io, ctx) {           // 启动时初始化（可选）
    // 加载模型等
  },

  onConnection(socket, ctx) { // 客户端连接时
    socket.on('audio', (msg) => { ... })
  },

  disconnect(socket, ctx) {   // 客户端断开时
    // 清理状态
  },
}
```

### 内置 Handlers

| Handler | Namespace | 说明 |
|---------|-----------|------|
| `speech` | `/speech` | 语音识别（Whisper + FunASR） |
| `push` | `/push` | 后端推送（预留） |

### 添加自定义 Handler

在 `handlers/` 目录下创建 `.mjs` 文件，导出符合接口的对象即可自动注册。

## 语音识别

### 支持的引擎

| 引擎 | 模型 | 说明 | 速度 | 精度 |
|---|---|---|---|---|
| Whisper Tiny | onnx-community/whisper-tiny | HuggingFace Transformers.js + ONNX | ⚡⚡⚡ | ★★ |
| Whisper Base | onnx-community/whisper-base | HuggingFace Transformers.js + ONNX | ⚡⚡ | ★★★ |
| Whisper Small | onnx-community/whisper-small | HuggingFace Transformers.js + ONNX | ⚡ | ★★★★ |
| FunASR Paraformer | paraformer-zh | Python sidecar + FunASR | ⚡⚡⚡ | ★★★★ |
| FunASR SenseVoice | SenseVoiceSmall | Python sidecar + FunASR | ⚡⚡ | ★★★★★ |

### FunASR 引擎

```bash
# 安装 Python 依赖
pip install funasr torch torchaudio

# 启动服务（会自动启动 Python sidecar）
npm start
```

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `WS_PORT` | `8787` | 服务端口 |
| `SPEECH_MODEL` | `whisper-tiny` | 默认模型 |
| `SPEECH_MODEL_PATH` | `./models` | 模型文件路径 |
| `SPEECH_PROCESS_INTERVAL` | `1500` | 推理间隔（毫秒） |
| `SPEECH_MIN_AUDIO_LENGTH` | `8000` | 最小音频长度 |
| `SPEECH_OFFLINE` | - | 禁止远程下载模型 |
| `SPEECH_MIRROR` | - | 模型下载镜像地址 |
| `FUNASR_PYTHON` | `python3` | FunASR Python 路径 |

## Socket.IO 协议

### /speech Namespace

**客户端 → 服务端：**
```json
{ "type": "config", "model": "whisper-tiny" }
{ "type": "audio", "data": [...] }
{ "type": "stop" }
```

**服务端 → 客户端：**
```json
{ "type": "ready" }
{ "type": "config_ok", "model": "whisper-tiny" }
{ "type": "result", "text": "识别结果", "is_final": true }
{ "type": "stopped" }
{ "type": "error", "message": "错误信息" }
```

### /push Namespace

**客户端 → 服务端：**
```json
{ "type": "subscribe", "topic": "news" }
{ "type": "unsubscribe", "topic": "news" }
```

**服务端 → 客户端：**
```json
{ "type": "message", "topic": "news", "data": {...} }
```

## 开发调试

```bash
# 终端1：启动 webapp
pnpm dev

# 终端2：启动 ws-server
pnpm ws-server
```

## 项目结构

```
ws-server/
├── server.mjs              # 入口（Socket.IO + Handler 注册）
├── handlers/
│   ├── speech.mjs          # 语音识别 Handler
│   └── push.mjs            # 后端推送 Handler（预留）
├── lib/
│   ├── model-loader.mjs    # Whisper 模型加载
│   ├── funasr.mjs          # FunASR sidecar
│   └── audio-utils.mjs     # 音频工具
├── scripts/
│   ├── download-whisper-model.js  # 下载 Whisper 模型
│   └── download-funasr-model.js   # 下载 FunASR 模型
├── models/                 # 模型文件（.gitignore）
└── package.json
```
