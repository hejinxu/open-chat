export type BackendType = 'dify' | 'direct_llm' | 'fastgpt' | 'n8n'

export interface AgentConfig {
  id: string
  name: string
  icon: string
  description: string
  backend_type: BackendType
  api_key: string
  api_url: string
  model?: string
  is_default: boolean
  is_enabled: boolean
  extra_config?: Record<string, any>
}

export type AgentInfo = Omit<AgentConfig, 'api_key' | 'api_url' | 'model' | 'extra_config'>

export interface AgentRecord {
  id: string
  name: string
  icon: string
  description: string
  backend_type: BackendType
  api_key: string
  api_url: string
  model: string | null
  extra_config: string // JSON string
  is_default: boolean
  is_enabled: boolean
  created_at: number
  updated_at: number
}

export function dbToAgentConfig(record: AgentRecord): AgentConfig {
  return {
    id: record.id,
    name: record.name,
    icon: record.icon,
    description: record.description,
    backend_type: record.backend_type,
    api_key: record.api_key,
    api_url: record.api_url,
    model: record.model || undefined,
    is_default: record.is_default,
    is_enabled: record.is_enabled,
    extra_config: record.extra_config ? JSON.parse(record.extra_config) : undefined,
  }
}

export function agentConfigToDb(config: Omit<AgentConfig, 'extra_config'> & { extra_config?: Record<string, any> }, now: number): AgentRecord {
  return {
    id: config.id,
    name: config.name,
    icon: config.icon,
    description: config.description,
    backend_type: config.backend_type,
    api_key: config.api_key,
    api_url: config.api_url,
    model: config.model || null,
    extra_config: config.extra_config ? JSON.stringify(config.extra_config) : '{}',
    is_default: config.is_default,
    is_enabled: config.is_enabled,
    created_at: now,
    updated_at: now,
  }
}
