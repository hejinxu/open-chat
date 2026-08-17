import type { NextRequest } from 'next/server'
import { requireAdmin } from '@/app/api/utils/auth-guard'
import { subscribe, getRequestSummaries, getLogs } from '@/lib/services/agent-logger'

export async function GET(request: NextRequest) {
  const authError = requireAdmin(request)
  if (authError) { return authError }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: any) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          // controller already closed
        }
      }

      // Send initial snapshot
      const summaries = getRequestSummaries()
      for (const summary of summaries) {
        const logs = getLogs(summary.request_id)
        send({ event: 'request_start', request: summary })
        for (const log of logs) {
          send({ event: 'log', entry: log })
        }
        if (summary.status !== 'running') {
          send({ event: 'request_end', request: summary })
        }
      }

      // Subscribe to live events
      const unsubscribe = subscribe((event, data) => {
        send({ event, [event === 'log' ? 'entry' : 'request']: data })
      })

      // Heartbeat every 25s
      const heartbeat = setInterval(() => {
        send({ event: 'ping' })
      }, 25000)

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        unsubscribe()
        try { controller.close() } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
