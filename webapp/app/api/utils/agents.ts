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
      const configs = records.filter(r => r.is_enabled).map(dbToAgentConfig)

      // Batch-resolve model_id: populate model, api_key, api_url from model/provider
      const modelIds = configs.map(a => a.model_id).filter(Boolean) as string[]
      if (modelIds.length > 0) {
        const allModels = await db.getModels()
        const modelMap = new Map(allModels.map(m => [m.id, m]))
        const allProviders = await db.getModelProviders()
        const providerMap = new Map(allProviders.map(p => [p.id, p]))

        for (const agent of configs) {
          if (!agent.model_id) { continue }
          const model = modelMap.get(agent.model_id)
          if (!model || !model.is_enabled) { continue }
          const provider = providerMap.get(model.provider_id)
          if (!provider || !provider.is_enabled) { continue }
          agent.model = model.model_name
          // direct_llm 类型始终用 Provider 凭证覆盖，避免旧值残留
          if (agent.backend_type === 'direct_llm') {
            agent.api_key = provider.api_key
            agent.api_url = provider.api_base_url
          } else {
            if (!agent.api_key) { agent.api_key = provider.api_key }
            if (!agent.api_url) { agent.api_url = provider.api_base_url }
          }
        }
      }

      _cachedAgents = configs
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

export async function getAgentInfoList(): Promise<Omit<AgentConfig, 'api_key' | 'api_url' | 'model' | 'model_id' | 'extra_config'>[]> {
  return (await getAllAgents()).map(({ api_key: _, api_url: __, model: ___, model_id: ____, extra_config: _____, ...rest }) => rest)
}

export function reloadConfig() {
  _cachedAgents = null
}
