'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { BASE_PATH } from '@/config'
import type { LogEntry, RequestSummary } from '@/types/agent-log'

interface LogStep {
  id: string
  type: string
  startEntry?: LogEntry
  endEntry?: LogEntry
  children: LogStep[]
}

interface RequestGroup extends RequestSummary {
  logs: LogEntry[]
  expanded: boolean
}

const LEVEL_COLORS: Record<string, string> = {
  info: 'text-content-secondary',
  warn: 'text-yellow-600',
  error: 'text-red-500',
}

const NODE_COLORS: Record<string, string> = {
  agent: 'bg-accent-bg text-accent',
  tools: 'bg-green-100 text-green-800',
  shouldContinue: 'bg-yellow-100 text-yellow-800',
  summarize: 'bg-purple-100 text-purple-800',
  planner: 'bg-blue-100 text-blue-800',
  executor: 'bg-green-100 text-green-800',
  replanner: 'bg-orange-100 text-orange-800',
  summarizer: 'bg-purple-100 text-purple-800',
  request: 'bg-gray-100 text-gray-600',
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes}m${remainingSeconds}s`
}

function matchesFilter(log: LogEntry | undefined, filterLevel: string, filterNode: string): boolean {
  if (!log) { return false }
  if (filterLevel !== 'all' && log.level !== filterLevel) { return false }
  if (filterNode !== 'all' && log.node !== filterNode) { return false }
  return true
}

function buildStepTree(logs: LogEntry[]): (LogStep | LogEntry)[] {
  const stepMap = new Map<string, LogStep>()
  const standalone: LogEntry[] = []

  for (const log of logs) {
    if (log.step_id) {
      if (!stepMap.has(log.step_id)) {
        stepMap.set(log.step_id, {
          id: log.step_id,
          type: log.node,
          startEntry: log,
          children: [],
        })
      } else {
        stepMap.get(log.step_id)!.endEntry = log
      }
    } else {
      standalone.push(log)
    }
  }

  const roots: (LogStep | LogEntry)[] = []
  for (const step of stepMap.values()) {
    const parentId = step.startEntry?.parent_step_id
    if (parentId && stepMap.has(parentId)) {
      stepMap.get(parentId)!.children.push(step)
    } else {
      roots.push(step)
    }
  }

  const allItems: (LogStep | LogEntry)[] = [...roots, ...standalone]
  allItems.sort((a, b) => {
    const aTime = 'startEntry' in a ? (a.startEntry?.timestamp || 0) : (a as LogEntry).timestamp
    const bTime = 'startEntry' in b ? (b.startEntry?.timestamp || 0) : (b as LogEntry).timestamp
    return aTime - bTime
  })

  return allItems
}

function StepCard({ step, depth, filterLevel, filterNode }: {
  step: LogStep
  depth: number
  filterLevel: string
  filterNode: string
}) {
  const [expanded, setExpanded] = useState(true)
  const hasEnd = !!step.endEntry
  const duration = step.endEntry?.duration_ms
  const isSuccess = step.endEntry?.level !== 'error'

  const startMatch = matchesFilter(step.startEntry, filterLevel, filterNode)
  const endMatch = matchesFilter(step.endEntry, filterLevel, filterNode)
  if (!startMatch && !endMatch && step.children.length === 0) { return null }

  return (
    <div className="mb-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1 hover:bg-surface-hover transition-colors rounded text-left"
      >
        <span className="text-xs shrink-0">{expanded ? '▼' : '▶'}</span>
        <span className="text-xs text-content-tertiary shrink-0 font-mono">
          {formatTime(step.startEntry?.timestamp || 0)}
        </span>
        <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${NODE_COLORS[step.type] || 'bg-surface-hover text-content-secondary'}`}>
          {step.type}
        </span>
        <span className="text-sm text-content truncate flex-1">
          {step.startEntry?.message}
        </span>
        {duration != null && (
          <span className="text-xs text-content-tertiary shrink-0">({duration}ms)</span>
        )}
        {!hasEnd && (
          <span className="text-xs text-yellow-600 shrink-0">⚠ 未收到结果</span>
        )}
        {hasEnd && (
          <span className={`text-xs shrink-0 ${isSuccess ? 'text-green-600' : 'text-red-500'}`}>
            {isSuccess ? '✓' : '✗'}
          </span>
        )}
      </button>
      {expanded && (
        <div className={`mt-0.5 ${depth > 0 ? 'ml-4 border-l border-border-subtle pl-3' : 'ml-2'}`}>
          {step.startEntry?.data && Object.keys(step.startEntry.data).length > 0 && (
            <div className="mb-1">
              <div className="text-xs text-content-tertiary font-medium">请求</div>
              <pre className="text-xs text-content-secondary bg-surface rounded p-2 overflow-auto max-h-40 font-mono">
                {JSON.stringify(step.startEntry.data, null, 2)}
              </pre>
            </div>
          )}
          {step.endEntry?.data && Object.keys(step.endEntry.data).length > 0 && (
            <div className="mb-1">
              <div className="text-xs text-content-tertiary font-medium">结果</div>
              <pre className="text-xs text-content-secondary bg-surface rounded p-2 overflow-auto max-h-40 font-mono">
                {JSON.stringify(step.endEntry.data, null, 2)}
              </pre>
            </div>
          )}
          {step.children.length > 0 && (
            <div>
              {step.children.map(child => (
                <StepCard
                  key={child.id}
                  step={child}
                  depth={depth + 1}
                  filterLevel={filterLevel}
                  filterNode={filterNode}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LogLine({ log, filterLevel, filterNode }: {
  log: LogEntry
  filterLevel: string
  filterNode: string
}) {
  const [expanded, setExpanded] = useState(false)
  if (!matchesFilter(log, filterLevel, filterNode)) { return null }

  const hasData = log.data && Object.keys(log.data).length > 0

  return (
    <div className="mb-1">
      <button
        onClick={() => hasData && setExpanded(!expanded)}
        className={`w-full flex items-center gap-2 px-2 py-1 hover:bg-surface-hover transition-colors rounded text-left ${!hasData ? 'cursor-default' : ''}`}
      >
        {hasData
          ? <span className="text-xs shrink-0 w-3">{expanded ? '▼' : '▶'}</span>
          : <span className="text-xs shrink-0 w-3"></span>}
        <span className="text-xs text-content-tertiary shrink-0 font-mono">
          {formatTime(log.timestamp)}
        </span>
        <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${NODE_COLORS[log.node] || 'bg-surface-hover text-content-secondary'}`}>
          {log.node}
        </span>
        <span className={`text-xs shrink-0 ${LEVEL_COLORS[log.level] || 'text-content-secondary'}`}>
          [{log.level}]
        </span>
        <span className="text-sm text-content truncate flex-1">{log.message}</span>
      </button>
      {expanded && hasData && (
        <div className="mt-0.5 ml-6">
          <pre className="text-xs text-content-secondary bg-surface rounded p-2 overflow-auto max-h-40 font-mono">
            {JSON.stringify(log.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

export default function AgentLogsPage() {
  const { t } = useTranslation()
  const [groups, setGroups] = useState<Map<string, RequestGroup>>(new Map())
  const [connected, setConnected] = useState(false)
  const [filterLevel, setFilterLevel] = useState<'all' | 'info' | 'warn' | 'error'>('all')
  const [filterNode, setFilterNode] = useState<string>('all')
  const [autoExpandRunning, setAutoExpandRunning] = useState(true)
  const groupsRef = useRef<Map<string, RequestGroup>>(new Map())
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleUpdate = useCallback(() => {
    if (updateTimerRef.current) { return }
    updateTimerRef.current = setTimeout(() => {
      updateTimerRef.current = null
      setGroups(new Map(groupsRef.current))
    }, 100)
  }, [])

  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const res = await fetch(`${BASE_PATH}/api/admin/agent-logs`)
        const data = await res.json()
        const map = new Map<string, RequestGroup>()
        for (const req of (data.requests || [])) {
          map.set(req.request_id, { ...req, logs: [], expanded: req.status === 'running' })
        }
        groupsRef.current = map
        setGroups(new Map(map))
      } catch {
        // ignore
      }
    }
    fetchInitial()

    let aborted = false
    const controller = new AbortController()

    const connectStream = async () => {
      try {
        const res = await fetch(`${BASE_PATH}/api/admin/agent-logs/stream`, {
          signal: controller.signal,
        })
        if (aborted) { return }
        setConnected(true)

        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) { break }
          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) { continue }
            const jsonStr = line.slice(6).trim()
            if (!jsonStr) { continue }
            try {
              const evt = JSON.parse(jsonStr)
              handleStreamEvent(evt)
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch {
        if (!aborted) {
          setConnected(false)
        }
      }
    }

    connectStream()

    return () => {
      aborted = true
      controller.abort()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleStreamEvent = useCallback((evt: any) => {
    const map = groupsRef.current

    if (evt.event === 'ping') { return }

    if (evt.event === 'request_start' && evt.request) {
      const req = evt.request as RequestSummary
      map.set(req.request_id, {
        ...req,
        logs: [],
        expanded: autoExpandRunning,
      })
      scheduleUpdate()
    }

    if (evt.event === 'request_end' && evt.request) {
      const req = evt.request as RequestSummary
      const existing = map.get(req.request_id)
      if (existing) {
        Object.assign(existing, req)
      }
      scheduleUpdate()
    }

    if (evt.event === 'log' && evt.entry) {
      const entry = evt.entry as LogEntry
      const group = map.get(entry.request_id)
      if (group) {
        group.logs.push(entry)
        group.log_count = group.logs.length
        group.last_node = entry.node
      }
      scheduleUpdate()
    }
  }, [autoExpandRunning, scheduleUpdate])

  const toggleExpand = (requestId: string) => {
    const group = groupsRef.current.get(requestId)
    if (group) {
      group.expanded = !group.expanded
      setGroups(new Map(groupsRef.current))
    }
  }

  const clearLogs = () => {
    groupsRef.current.clear()
    setGroups(new Map())
  }

  const sortedGroups = Array.from(groups.values()).sort((a, b) => b.started_at - a.started_at)

  const availableNodes = new Set<string>()
  for (const g of sortedGroups) {
    for (const log of g.logs) {
      availableNodes.add(log.node)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium text-content">{t('common.auth.agentLogs', '智能体日志')}</h2>
          <span className={`text-xs px-2 py-0.5 rounded-full ${connected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
            {connected ? t('common.auth.connected', '实时连接中') : t('common.auth.disconnected', '未连接')}
          </span>
        </div>
        <button
          onClick={clearLogs}
          className="px-3 py-1.5 text-sm bg-surface-hover text-content-secondary rounded-md hover:text-content transition-colors"
        >
          {t('common.auth.clearLogs', '清空')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 shrink-0">
        <select
          value={filterLevel}
          onChange={e => setFilterLevel(e.target.value as any)}
          className="px-3 py-1.5 text-sm bg-surface border border-border rounded text-content"
        >
          <option value="all">{t('common.auth.allLevels', '全部级别')}</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
        <select
          value={filterNode}
          onChange={e => setFilterNode(e.target.value)}
          className="px-3 py-1.5 text-sm bg-surface border border-border rounded text-content"
        >
          <option value="all">{t('common.auth.allNodes', '全部节点')}</option>
          {Array.from(availableNodes).sort().map(node => (
            <option key={node} value={node}>{node}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-content-secondary">
          <input
            type="checkbox"
            checked={autoExpandRunning}
            onChange={e => setAutoExpandRunning(e.target.checked)}
            className="rounded border-border"
          />
          {t('common.auth.autoExpandRunning', '自动展开运行中的请求')}
        </label>
      </div>

      {/* Log list */}
      <div className="flex-1 overflow-auto">
        {sortedGroups.length === 0 && (
          <div className="text-center py-12 text-content-secondary">
            {t('common.auth.noLogs', '暂无日志，请发送消息触发智能体执行')}
          </div>
        )}

        {sortedGroups.map(group => {
          const stepTree = buildStepTree(group.logs)
          return (
            <div key={group.request_id} className="mb-3 bg-surface-elevated rounded-lg border border-border overflow-hidden">
              {/* Request header */}
              <button
                onClick={() => toggleExpand(group.request_id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs shrink-0">{group.expanded ? '▼' : '▶'}</span>
                  <span className="text-xs text-content-tertiary shrink-0 font-mono">
                    {formatTime(group.started_at)}
                  </span>
                  <span className="text-sm font-medium text-content truncate">
                    {group.agent_name}
                  </span>
                  <span className="text-xs text-content-tertiary truncate">
                    {group.query.slice(0, 50)}{group.query.length > 50 ? '...' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    group.status === 'running' ? 'bg-accent-bg text-accent' :
                    group.status === 'completed' ? 'bg-green-100 text-green-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {group.status === 'running' ? t('common.auth.running', '运行中') :
                     group.status === 'completed' ? t('common.auth.completed', '已完成') :
                     t('common.auth.error', '错误')}
                  </span>
                  <span className="text-xs text-content-tertiary">
                    {group.log_count} {t('common.auth.entries', '条')}
                  </span>
                  <span className="text-xs text-content-tertiary">
                    {group.ended_at ? formatDuration(group.ended_at - group.started_at) : t('common.auth.running', '运行中')}
                  </span>
                </div>
              </button>

              {/* Step tree */}
              {group.expanded && (
                <div className="border-t border-border p-3">
                  {stepTree.length === 0 && (
                    <div className="px-4 py-3 text-sm text-content-tertiary">
                      {t('common.auth.noMatchingLogs', '无匹配日志')}
                    </div>
                  )}
                  {stepTree.map(item => {
                    if ('startEntry' in item) {
                      return (
                        <StepCard
                          key={item.id}
                          step={item}
                          depth={0}
                          filterLevel={filterLevel}
                          filterNode={filterNode}
                        />
                      )
                    } else {
                      return (
                        <LogLine
                          key={item.id}
                          log={item as LogEntry}
                          filterLevel={filterLevel}
                          filterNode={filterNode}
                        />
                      )
                    }
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
