import type { AgentConfig } from '@/types/agent'
import { dbToAgentConfig } from '@/types/agent'
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
  catch (error) {
    // DB not available, don't cache empty result — allow retry on next call
    console.error('[agents] Failed to load agents:', error)
    return []
  }

  // No fallback: return empty array, user must configure agents via admin UI
  // Don't cache empty array — allow retry when DB becomes available
  return []
}

export async function getAllAgents(): Promise<AgentConfig[]> {
  return loadAgents()
}

export async function getDefaultAgent(): Promise<AgentConfig | undefined> {
  const agents = await getAllAgents()
  return agents.find(a => a.is_default) || agents[0] || undefined
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
