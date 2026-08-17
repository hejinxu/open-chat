export type LogLevel = 'info' | 'warn' | 'error'

export interface LogEntry {
  id: string
  request_id: string
  timestamp: number
  level: LogLevel
  node: string
  message: string
  data?: Record<string, any>
  duration_ms?: number
  step_id?: string
  parent_step_id?: string
}

export interface RequestSummary {
  request_id: string
  agent_id: string
  agent_name: string
  user_id: string
  query: string
  execution_mode: string
  status: 'running' | 'completed' | 'error'
  started_at: number
  ended_at?: number
  log_count: number
  last_node?: string
}

export interface LogStreamEvent {
  event: 'log' | 'request_start' | 'request_end' | 'ping'
  entry?: LogEntry
  request?: RequestSummary
}
