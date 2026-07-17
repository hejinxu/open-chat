export interface SystemPromptRecord {
  id: string
  name: string
  description: string
  content: string
  created_at: number
  updated_at: number
}

export interface SystemPromptConfig {
  id: string
  name: string
  description: string
  content: string
  created_at: number
  updated_at: number
}

export function dbToSystemPrompt(record: SystemPromptRecord): SystemPromptConfig {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    content: record.content,
    created_at: record.created_at,
    updated_at: record.updated_at,
  }
}
