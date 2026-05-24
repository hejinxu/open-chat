import { createServer } from 'http'
import { Server } from 'socket.io'
import { readdir } from 'fs/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config as loadDotenv } from 'dotenv'
import { loadAuthConfig, verifySelf, verifyRemote } from './lib/auth.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env file
loadDotenv({ path: resolve(__dirname, '.env') })

const PORT = parseInt(process.env.WS_PORT || '8787', 10)
const AUTH_ENABLED = process.env.AUTH_ENABLED !== 'false'
const AUTH_MODE = process.env.AUTH_MODE || 'self'
const VERIFY_ENDPOINT = process.env.VERIFY_ENDPOINT || ''
const VERIFY_TIMEOUT = parseInt(process.env.VERIFY_TIMEOUT || '5000', 10)

// Startup validation
if (AUTH_ENABLED && AUTH_MODE === 'remote' && !VERIFY_ENDPOINT) {
  console.error('[WS Server] FATAL: AUTH_MODE=remote requires VERIFY_ENDPOINT')
  process.exit(1)
}

console.log('[WS Server] Config:')
console.log(`  Port: ${PORT}`)
console.log(`  Auth: ${AUTH_ENABLED ? AUTH_MODE : 'disabled'}`)
if (AUTH_ENABLED && AUTH_MODE === 'remote') {
  console.log(`  Verify Endpoint: ${VERIFY_ENDPOINT}`)
}

const httpServer = createServer()
const io = new Server(httpServer, {
  cors: { origin: '*' },
  maxHttpBufferSize: 10 * 1024 * 1024, // 10MB limit for audio data
})

const handlers = new Map()

async function registerHandler(handler) {
  if (handlers.has(handler.name)) {
    console.warn(`[WS Server] Handler '${handler.name}' already registered, skipping`)
    return
  }

  handlers.set(handler.name, handler)
  console.log(`[WS Server] Registered handler: ${handler.name} (namespace: ${handler.namespace})`)

  const ns = io.of(handler.namespace)

  // Auth middleware
  if (AUTH_ENABLED) {
    ns.use(async (socket, next) => {
      const token = socket.handshake.auth?.token
      if (!token) {
        return next(new Error('Authentication required'))
      }

      try {
        let result
        if (AUTH_MODE === 'remote') {
          if (!VERIFY_ENDPOINT) {
            return next(new Error('VERIFY_ENDPOINT not configured'))
          }
          result = await verifyRemote(token, VERIFY_ENDPOINT, VERIFY_TIMEOUT)
        } else {
          result = verifySelf(token)
        }

        if (result.success) {
          socket.data.user = result.data
          next()
        } else {
          next(new Error(result.msg || 'Authentication failed'))
        }
      } catch (e) {
        next(new Error('Authentication error: ' + e.message))
      }
    })
  }

  ns.on('connection', (socket) => {
    handler.onConnection(socket, { io, handlers })
    socket.on('disconnect', () => {
      handler.disconnect?.(socket)
    })
  })

  if (handler.init) {
    await handler.init(ns, { io, handlers })
  }
}

async function loadHandlers() {
  const handlersDir = resolve(__dirname, 'handlers')
  try {
    const files = await readdir(handlersDir)
    const handlerFiles = files.filter(f => f.endsWith('.mjs'))

    for (const file of handlerFiles) {
      try {
        const mod = await import(`./handlers/${file}`)
        const handler = mod.default
        if (handler && handler.name && handler.namespace) {
          await registerHandler(handler)
        } else {
          console.warn(`[WS Server] Skipping ${file}: missing name or namespace`)
        }
      } catch (e) {
        console.error(`[WS Server] Failed to load handler ${file}:`, e.message)
      }
    }
  } catch (e) {
    console.error('[WS Server] Failed to read handlers directory:', e.message)
  }
}

process.on('uncaughtException', (err) => {
  console.error('[WS Server] Uncaught exception:', err.message)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('[WS Server] Unhandled rejection:', reason)
})

await loadHandlers()

httpServer.listen(PORT, () => {
  console.log(`[WS Server] Listening on ws://localhost:${PORT}`)
  console.log(`[WS Server] Namespaces: ${[...handlers.values()].map(h => h.namespace).join(', ')}`)
})

// Graceful shutdown
let isShuttingDown = false

async function gracefulShutdown(signal) {
  if (isShuttingDown) return
  isShuttingDown = true
  console.log(`\n[WS Server] ${signal} received, shutting down...`)

  // Stop accepting new connections
  httpServer.close(() => {
    console.log('[WS Server] HTTP server closed')
  })

  // Disconnect all Socket.IO clients
  io.close(() => {
    console.log('[WS Server] Socket.IO connections closed')
  })

  // Call cleanup on handlers that support it
  for (const handler of handlers.values()) {
    if (handler.cleanup) {
      try {
        await handler.cleanup()
        console.log(`[WS Server] Handler '${handler.name}' cleaned up`)
      } catch (e) {
        console.error(`[WS Server] Handler '${handler.name}' cleanup failed:`, e.message)
      }
    }
  }

  console.log('[WS Server] Shutdown complete')
  process.exit(0)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
