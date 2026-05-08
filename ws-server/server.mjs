import { createServer } from 'http'
import { Server } from 'socket.io'
import { readdir } from 'fs/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = parseInt(process.env.WS_PORT || '8787', 10)

console.log('[WS Server] Config:')
console.log(`  Port: ${PORT}`)

const httpServer = createServer()
const io = new Server(httpServer, {
  cors: { origin: '*' },
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

  ns.on('connection', (socket) => {
    handler.onConnection(socket, { io, handlers })
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
})

process.on('unhandledRejection', (reason) => {
  console.error('[WS Server] Unhandled rejection:', reason)
})

await loadHandlers()

httpServer.listen(PORT, () => {
  console.log(`[WS Server] Listening on ws://localhost:${PORT}`)
  console.log(`[WS Server] Namespaces: ${[...handlers.values()].map(h => h.namespace).join(', ')}`)
})
