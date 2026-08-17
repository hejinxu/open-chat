'use client'

import { useState } from 'react'

interface LogEntry {
  id: string
  timestamp: number
  level: string
  node: string
  message: string
  data?: Record<string, any>
  duration_ms?: number
  step_id?: string
  parent_step_id?: string
}

interface LogStep {
  id: string
  type: string
  startEntry?: LogEntry
  endEntry?: LogEntry
  children: LogStep[]
}

const NODE_LABELS: Record<string, string> = {
  agent: '模型',
  tools: '工具',
  shouldContinue: '路由',
  summarize: '总结',
  planner: '规划',
  executor: '执行',
  replanner: '重规划',
  summarizer: '总结',
  request: '请求',
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
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

function StepItem({ step, depth }: { step: LogStep, depth: number }) {
  const [expanded, setExpanded] = useState(true)
  const hasEnd = !!step.endEntry
  const duration = step.endEntry?.duration_ms
  const isError = step.endEntry?.level === 'error' || step.startEntry?.level === 'error'
  const hasChildren = step.children.length > 0

  return (
    <div className="my-0.5">
      <button
        onClick={() => hasChildren && setExpanded(!expanded)}
        className={`flex items-center gap-1.5 w-full text-left hover:bg-surface-hover rounded px-1 py-0.5 ${!hasChildren ? 'cursor-default' : ''}`}
      >
        {hasChildren ? <span className="text-xs w-3 shrink-0">{expanded ? '▼' : '▶'}</span> : <span className="w-3 shrink-0"></span>}
        <span className="text-xs text-content-tertiary shrink-0 font-mono">{formatTime(step.startEntry?.timestamp || 0)}</span>
        <span className={`text-xs shrink-0 font-medium ${isError ? 'text-red-500' : 'text-content-secondary'}`}>
          {NODE_LABELS[step.type] || step.type}
        </span>
        <span className="text-xs text-content truncate flex-1">{step.startEntry?.message}</span>
        {duration != null && <span className="text-xs text-content-tertiary shrink-0">{duration}ms</span>}
        {!hasEnd && <span className="text-xs text-yellow-600 shrink-0">...</span>}
        {hasEnd && !isError && <span className="text-xs text-green-600 shrink-0">✓</span>}
        {hasEnd && isError && <span className="text-xs text-red-500 shrink-0">✗</span>}
      </button>
      {expanded && hasChildren && (
        <div className={`mt-0.5 ${depth > 0 ? 'ml-4 border-l border-border-subtle pl-2' : 'ml-2'}`}>
          {step.children.map(child => (
            <StepItem key={child.id} step={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function StandaloneItem({ log }: { log: LogEntry }) {
  return (
     <div className="flex items-center gap-1.5 w-full px-1 py-0.5">
       <span className="w-3 shrink-0"></span>
       <span className="text-xs text-content-tertiary shrink-0 font-mono">{formatTime(log.timestamp)}</span>
       <span className={`text-xs shrink-0 font-medium ${log.level === 'error' ? 'text-red-500' : 'text-content-secondary'}`}>
        {NODE_LABELS[log.node] || log.node}
      </span>
      <span className="text-xs text-content truncate flex-1">{log.message}</span>
      {log.level === 'error' && <span className="text-xs text-red-500 shrink-0">✗</span>}
    </div>
  )
}

export default function AgentProcess({ steps, isResponding }: { steps: any[], isResponding?: boolean }) {
  const [expanded, setExpanded] = useState(true)

  if (!steps || steps.length === 0) { return null }

  const stepTree = buildStepTree(steps as LogEntry[])
  const lastStep = steps[steps.length - 1]
  const totalDuration = lastStep?.duration_ms ? `${(lastStep.duration_ms / 1000).toFixed(1)}s` : ''

  return (
    <div className="mb-3 border border-border-subtle rounded-lg overflow-hidden bg-surface">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-surface-hover transition-colors"
      >
        <span className="text-xs text-content-secondary">{expanded ? '▼' : '▶'}</span>
        <span className="text-sm font-medium text-content-secondary">执行过程</span>
        <span className="text-xs text-content-tertiary">
          ({steps.length}步{totalDuration ? ` · ${totalDuration}` : ''}{isResponding ? ' · 运行中' : ''})
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-2 pt-1 border-t border-border-subtle">
          {stepTree.map(item => {
            if ('startEntry' in item) {
              return <StepItem key={item.id} step={item as LogStep} depth={0} />
            } else {
              return <StandaloneItem key={item.id} log={item as LogEntry} />
            }
          })}
        </div>
      )}
    </div>
  )
}
