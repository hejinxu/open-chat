'use client'

import React, { useState, useEffect, useRef } from 'react'
import type { AgentInfo } from '@/types/agent'
import { BASE_PATH } from '@/config'

interface AgentSelectorProps {
  value: string | null
  onChange: (agentId: string | null) => void
  apiKey?: string
}

export function AgentSelector({ value, onChange, apiKey }: AgentSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const headers = apiKey ? { 'x-api-key': apiKey } : undefined
    fetch(`${BASE_PATH}/api/config/agents`, { headers })
      .then(res => res.json())
      .then(data => setAgents(data.agents || []))
      .catch(() => {})
  }, [apiKey])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (agents.length === 0) return null

  const currentAgent = agents.find(a => a.id === value) || agents.find(a => a.is_default) || agents[0]

  if (agents.length === 1) {
    return (
      <div className="flex items-center gap-1 px-2 py-1 text-sm text-content-tertiary" title={currentAgent.description}>
        <span className="text-base leading-none">{currentAgent.icon}</span>
        <span className="max-w-[80px] truncate">{currentAgent.name}</span>
      </div>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 px-2 py-1 text-sm rounded-md transition-colors cursor-pointer whitespace-nowrap ${
          value
            ? 'text-primary bg-primary/10 hover:bg-primary/20'
            : 'text-content-tertiary hover:text-content-secondary hover:bg-surface-hover'
        }`}
        title="选择智能体"
      >
        <span className="text-base leading-none">{currentAgent.icon}</span>
        <span className="max-w-[80px] truncate">{currentAgent.name}</span>
        <svg className="w-3 h-3 opacity-50" viewBox="0 0 12 12" fill="none">
          <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-1 w-56 bg-surface-elevated border border-border rounded-xl shadow-lg z-50 py-1 overflow-hidden">
          {agents.map(agent => (
            <button
              key={agent.id}
              type="button"
              onClick={() => {
                onChange(value === agent.id ? null : agent.id)
                setIsOpen(false)
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors cursor-pointer ${
                value === agent.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-content hover:bg-surface-hover'
              }`}
            >
              <span className="text-base leading-none shrink-0">{agent.icon}</span>
              <div className="min-w-0">
                <div className="font-medium truncate">{agent.name}</div>
                <div className="text-xs text-content-quaternary truncate">{agent.description}</div>
              </div>
              {value === agent.id && (
                <svg className="w-4 h-4 ml-auto shrink-0 text-primary" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13L9 17L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          ))}
          {value && (
            <>
              <div className="my-1 border-t border-border-subtle" />
              <button
                type="button"
                onClick={() => {
                  onChange(null)
                  setIsOpen(false)
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-content-tertiary hover:bg-surface-hover transition-colors cursor-pointer"
              >
                <span className="text-base leading-none">⚙️</span>
                <span>使用默认智能体</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
