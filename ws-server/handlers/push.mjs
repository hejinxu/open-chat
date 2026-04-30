/**
 * Push handler - Backend → Frontend push messaging
 *
 * Namespaces:
 *   /push - General push channel
 *
 * Events (client → server):
 *   subscribe   { topic: string }    Subscribe to a topic
 *   unsubscribe { topic: string }    Unsubscribe from a topic
 *
 * Events (server → client):
 *   message     { topic: string, data: any }   Pushed message
 *
 * Usage from other handlers or backend:
 *   const pushHandler = handlers.get('push')
 *   pushHandler.broadcast('news', { title: 'Hello' })        // all subscribers
 *   pushHandler.to(socketId).emit('message', { ... })        // specific client
 */

const clientTopics = new Map() // socketId → Set<topic>

export default {
  name: 'push',
  namespace: '/push',

  init() {
    console.log('[Push] Handler registered (no init needed)')
  },

  onConnection(socket) {
    console.log(`[Push] Client connected: ${socket.id}`)
    clientTopics.set(socket.id, new Set())

    socket.on('subscribe', (msg) => {
      if (!msg.topic) return
      const topics = clientTopics.get(socket.id)
      topics.add(msg.topic)
      socket.join(msg.topic)
      console.log(`[Push] Client ${socket.id} subscribed to: ${msg.topic}`)
      socket.emit('subscribed', { topic: msg.topic })
    })

    socket.on('unsubscribe', (msg) => {
      if (!msg.topic) return
      const topics = clientTopics.get(socket.id)
      topics.delete(msg.topic)
      socket.leave(msg.topic)
      console.log(`[Push] Client ${socket.id} unsubscribed from: ${msg.topic}`)
      socket.emit('unsubscribed', { topic: msg.topic })
    })
  },

  disconnect(socket) {
    clientTopics.delete(socket.id)
    console.log(`[Push] Client disconnected: ${socket.id}`)
  },

  /** Broadcast to all subscribers of a topic (call from outside) */
  broadcast(topic, data, io) {
    if (io) {
      io.of('/push').to(topic).emit('message', { topic, data })
    }
  },
}
