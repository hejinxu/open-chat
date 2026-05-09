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

export interface AgentsConfig {
  agents: AgentConfig[]
}
