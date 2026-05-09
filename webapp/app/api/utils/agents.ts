import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { AgentConfig, AgentsConfig } from '@/types/agent'
import { API_KEY, API_URL } from '@/config'

const CONFIG_PATH = join(process.cwd(), 'config', 'agents.config.json')

let _cachedConfig: AgentsConfig | null = null

function loadConfig(): AgentsConfig {
  if (_cachedConfig) return _cachedConfig

  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, 'utf-8')
      _cachedConfig = JSON.parse(raw)
      return _cachedConfig!
    }
  } catch {
    // ignore
  }

  // Fallback: use env vars as a single default agent (Dify)
  _cachedConfig = {
    agents: [{
      id: 'default',
      name: 'AI 助手',
      icon: '🤖',
      description: '默认 AI 对话助手',
      backend_type: 'dify',
      api_key: API_KEY,
      api_url: API_URL,
      is_default: true,
      is_enabled: true,
    }],
  }
  return _cachedConfig!
}

export function getAllAgents(): AgentConfig[] {
  return loadConfig().agents.filter(a => a.is_enabled)
}

export function getDefaultAgent(): AgentConfig {
  const agents = getAllAgents()
  return agents.find(a => a.is_default) || agents[0]
}

export function getAgentById(id: string): AgentConfig | undefined {
  return getAllAgents().find(a => a.id === id)
}

export function getAgentInfoList(): Omit<AgentConfig, 'api_key' | 'api_url' | 'model' | 'extra_config'>[] {
  return getAllAgents().map(({ api_key: _, api_url: __, model: ___, extra_config: ____, ...rest }) => rest)
}

export function reloadConfig() {
  _cachedConfig = null
  return loadConfig()
}
