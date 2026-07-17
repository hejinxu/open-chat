export interface AgentTypeRecord {
  id: string
  name: string
  icon: string
  description: string
  system_prompt_id: string | null
  backend_type_constraint: string | null // JSON array or null
  execution_mode_constraint: string | null // JSON array or null
  config_schema: string // JSON Schema
  is_enabled: boolean
  created_at: number
  updated_at: number
}

export interface AgentTypeConfig {
  id: string
  name: string
  icon: string
  description: string
  system_prompt_id: string | null
  backend_type_constraint: string[] | null
  execution_mode_constraint: string[] | null
  config_schema: Record<string, any>
  is_enabled: boolean
  created_at: number
  updated_at: number
}

export function dbToAgentType(record: AgentTypeRecord): AgentTypeConfig {
  return {
    id: record.id,
    name: record.name,
    icon: record.icon,
    description: record.description,
    system_prompt_id: record.system_prompt_id,
    backend_type_constraint: record.backend_type_constraint
      ? JSON.parse(record.backend_type_constraint)
      : null,
    execution_mode_constraint: record.execution_mode_constraint
      ? JSON.parse(record.execution_mode_constraint)
      : null,
    config_schema: record.config_schema
      ? JSON.parse(record.config_schema)
      : {},
    is_enabled: record.is_enabled,
    created_at: record.created_at,
    updated_at: record.updated_at,
  }
}

export function agentTypeToDb(config: Partial<AgentTypeConfig>): Partial<AgentTypeRecord> {
  const record: Partial<AgentTypeRecord> = {}
  if (config.id !== undefined) { record.id = config.id }
  if (config.name !== undefined) { record.name = config.name }
  if (config.icon !== undefined) { record.icon = config.icon }
  if (config.description !== undefined) { record.description = config.description }
  if (config.system_prompt_id !== undefined) { record.system_prompt_id = config.system_prompt_id }
  if (config.backend_type_constraint !== undefined) {
    record.backend_type_constraint = config.backend_type_constraint
      ? JSON.stringify(config.backend_type_constraint)
      : null
  }
  if (config.execution_mode_constraint !== undefined) {
    record.execution_mode_constraint = config.execution_mode_constraint
      ? JSON.stringify(config.execution_mode_constraint)
      : null
  }
  if (config.config_schema !== undefined) {
    record.config_schema = JSON.stringify(config.config_schema)
  }
  if (config.is_enabled !== undefined) { record.is_enabled = config.is_enabled }
  return record
}
