export type BackendType = 'dify' | 'direct_llm' | 'fastgpt' | 'n8n'

export type ExecutionMode = 'chat' | 'react' | 'plan_and_execute'

export interface AgentConfig {
  id: string
  name: string
  icon: string
  description: string
  backend_type: BackendType
  api_key: string
  api_url: string
  model?: string
  model_id?: string
  is_default: boolean
  is_enabled: boolean
  extra_config?: Record<string, any>
  execution_mode?: ExecutionMode
  tools_config?: Record<string, any>
  mcp_servers?: string[]
}

export type AgentInfo = Omit<AgentConfig, 'api_key' | 'api_url' | 'model' | 'model_id' | 'extra_config' | 'tools_config' | 'mcp_servers'>

export interface AgentRecord {
  id: string
  name: string
  icon: string
  description: string
  backend_type: BackendType
  api_key: string
  api_url: string
  model_id: string | null
  extra_config: string // JSON string
  execution_mode: string
  tools_config: string // JSON string
  mcp_servers: string // JSON string
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
    model_id: record.model_id || undefined,
    is_default: record.is_default,
    is_enabled: record.is_enabled,
    extra_config: record.extra_config ? JSON.parse(record.extra_config) : undefined,
    execution_mode: (record.execution_mode as ExecutionMode) || 'chat',
    tools_config: record.tools_config ? JSON.parse(record.tools_config) : undefined,
    mcp_servers: record.mcp_servers ? JSON.parse(record.mcp_servers) : undefined,
  }
}

export function agentConfigToDb(config: Omit<AgentConfig, 'extra_config' | 'tools_config' | 'mcp_servers'> & {
  extra_config?: Record<string, any>
  tools_config?: Record<string, any>
  mcp_servers?: string[]
}, now: number): AgentRecord {
  return {
    id: config.id,
    name: config.name,
    icon: config.icon,
    description: config.description,
    backend_type: config.backend_type,
    api_key: config.api_key,
    api_url: config.api_url,
    model_id: config.model_id || null,
    extra_config: config.extra_config ? JSON.stringify(config.extra_config) : '{}',
    execution_mode: config.execution_mode || 'chat',
    tools_config: config.tools_config ? JSON.stringify(config.tools_config) : '{}',
    mcp_servers: config.mcp_servers ? JSON.stringify(config.mcp_servers) : '[]',
    is_default: config.is_default,
    is_enabled: config.is_enabled,
    created_at: now,
    updated_at: now,
  }
}
