import type { AgentConfig } from '@/types/agent'
import { dbToAgentConfig } from '@/types/agent'
import { API_KEY, API_URL } from '@/config'
import { getDatabaseProvider } from '@/lib/db'

let _cachedAgents: AgentConfig[] | null = null

async function loadAgents(): Promise<AgentConfig[]> {
  if (_cachedAgents) {
    return _cachedAgents
  }

  try {
    const db = getDatabaseProvider()
    const records = await db.getAgents()
    if (records.length > 0) {
      _cachedAgents = records.filter(r => r.is_enabled).map(dbToAgentConfig)
      return _cachedAgents!
    }
  }
  catch {
    // DB not available, fall through to env vars
  }

  // Fallback: use env vars as a single default agent (Dify)
  _cachedAgents = [{
    id: 'default',
    name: 'AI 助手',
    icon: '🤖',
    description: '默认 AI 对话助手',
    backend_type: 'dify',
    api_key: API_KEY,
    api_url: API_URL,
    is_default: true,
    is_enabled: true,
  }]
  return _cachedAgents!
}

export async function getAllAgents(): Promise<AgentConfig[]> {
  return loadAgents()
}

export async function getDefaultAgent(): Promise<AgentConfig> {
  const agents = await getAllAgents()
  return agents.find(a => a.is_default) || agents[0]
}

export async function getAgentById(id: string): Promise<AgentConfig | undefined> {
  return (await getAllAgents()).find(a => a.id === id)
}

export async function getAgentInfoList(): Promise<Omit<AgentConfig, 'api_key' | 'api_url' | 'model' | 'extra_config'>[]> {
  return (await getAllAgents()).map(({ api_key: _, api_url: __, model: ___, extra_config: ____, ...rest }) => rest)
}

export function reloadConfig() {
  _cachedAgents = null
}
