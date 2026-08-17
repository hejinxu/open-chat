import { EventEmitter } from 'events'
import type { LogEntry, LogLevel, RequestSummary } from '@/types/agent-log'

const MAX_LOGS_PER_REQUEST = 200
const MAX_REQUESTS = 50
const EXPIRE_MS = 5 * 60 * 1000

interface StoredRequest extends RequestSummary {
  logs: LogEntry[]
}

const g = globalThis as any
if (!g.__openchat_agentLogger) {
  g.__openchat_agentLogger = {
    requests: new Map<string, StoredRequest>(),
    emitter: new EventEmitter(),
  }
}

const store = g.__openchat_agentLogger
const requests: Map<string, StoredRequest> = store.requests
const emitter: EventEmitter = store.emitter
emitter.setMaxListeners(100)

function generateId(): string {
  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function generateStepId(): string {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export interface LogOptions {
  stepId?: string
  parentStepId?: string
  durationMs?: number
}

function trimRequest(requestId: string): void {
  const req = requests.get(requestId)
  if (req && req.logs.length > MAX_LOGS_PER_REQUEST) {
    req.logs = req.logs.slice(-MAX_LOGS_PER_REQUEST)
  }
}

function evictOldRequests(): void {
  if (requests.size <= MAX_REQUESTS) { return }
  const now = Date.now()
  for (const [id, req] of requests) {
    if (req.status !== 'running' && req.ended_at && now - req.ended_at > EXPIRE_MS) {
      requests.delete(id)
    }
  }
  if (requests.size > MAX_REQUESTS) {
    const sorted = Array.from(requests.values()).sort((a, b) => a.started_at - b.started_at)
    while (requests.size > MAX_REQUESTS && sorted.length > 0) {
      const oldest = sorted.shift()
      if (oldest) { requests.delete(oldest.request_id) }
    }
  }
}

export function startRequest(params: {
  requestId: string
  agentId: string
  agentName: string
  userId: string
  query: string
  executionMode: string
}): void {
  const req: StoredRequest = {
    ...params,
    agent_id: params.agentId,
    agent_name: params.agentName,
    user_id: params.userId,
    execution_mode: params.executionMode,
    request_id: params.requestId,
    status: 'running',
    started_at: Date.now(),
    log_count: 0,
    logs: [],
  }
  requests.set(params.requestId, req)
  evictOldRequests()
  emitter.emit('request_start', req as RequestSummary)
}

export function endRequest(requestId: string, status: 'completed' | 'error'): void {
  const req = requests.get(requestId)
  if (!req) { return }
  req.status = status
  req.ended_at = Date.now()
  emitter.emit('request_end', req as RequestSummary)

  setTimeout(() => {
    requests.delete(requestId)
  }, EXPIRE_MS)
}

export function log(
  requestId: string,
  level: LogLevel,
  node: string,
  message: string,
  data?: Record<string, any>,
  stepId?: string,
  parentStepId?: string,
  durationMs?: number,
): void {
  const entry: LogEntry = {
    id: generateId(),
    request_id: requestId,
    timestamp: Date.now(),
    level,
    node,
    message,
    data,
    duration_ms: durationMs,
    step_id: stepId,
    parent_step_id: parentStepId,
  }

  const req = requests.get(requestId)
  if (req) {
    req.logs.push(entry)
    req.log_count = req.logs.length
    req.last_node = node
    trimRequest(requestId)
  }

  emitter.emit('log', entry)
}

export function getLogs(requestId: string): LogEntry[] {
  const req = requests.get(requestId)
  return req ? req.logs : []
}

export function getRequestSummaries(): RequestSummary[] {
  return Array.from(requests.values())
    .map(req => {
      const { logs, ...summary } = req
      return summary
    })
    .sort((a, b) => b.started_at - a.started_at)
}

export function getRequest(requestId: string): RequestSummary | null {
  const req = requests.get(requestId)
  if (!req) { return null }
  const { logs, ...summary } = req
  return summary
}

export function subscribe(listener: (event: string, data: any) => void): () => void {
  const logListener = (entry: LogEntry) => listener('log', entry)
  const startListener = (req: RequestSummary) => listener('request_start', req)
  const endListener = (req: RequestSummary) => listener('request_end', req)

  emitter.on('log', logListener)
  emitter.on('request_start', startListener)
  emitter.on('request_end', endListener)

  return () => {
    emitter.off('log', logListener)
    emitter.off('request_start', startListener)
    emitter.off('request_end', endListener)
  }
}

export class RequestLogger {
  constructor(private requestId: string) {}

  info(node: string, message: string, data?: Record<string, any>, options?: LogOptions): void {
    log(this.requestId, 'info', node, message, data, options?.stepId, options?.parentStepId, options?.durationMs)
  }

  warn(node: string, message: string, data?: Record<string, any>, options?: LogOptions): void {
    log(this.requestId, 'warn', node, message, data, options?.stepId, options?.parentStepId)
  }

  error(node: string, message: string, data?: Record<string, any>, options?: LogOptions): void {
    log(this.requestId, 'error', node, message, data, options?.stepId, options?.parentStepId)
  }
}

function truncateForLog(text: string, maxLen: number = 2000): string {
  if (text.length <= maxLen) { return text }
  return `${text.slice(0, maxLen)}...(已截断, 共${text.length}字符)`
}

export function truncateMessages(messages: any[]): any[] {
  return messages.map(msg => {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    return {
      role: msg._getType ? msg._getType() : (msg.role || 'unknown'),
      content: truncateForLog(content),
    }
  })
}

export function truncateToolResult(result: any): any {
  if (!result) { return result }
  if (typeof result.data === 'string') {
    return { ...result, data: truncateForLog(result.data, 3000) }
  }
  if (result.data && typeof result.data === 'object') {
    const str = JSON.stringify(result.data)
    if (str.length > 3000) {
      return { ...result, data: truncateForLog(str, 3000) }
    }
  }
  return result
}
