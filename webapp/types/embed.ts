export interface EmbedTokenRecord {
  id: string
  name: string
  description: string
  token: string
  allowed_agent_ids: string[]
  is_enabled: boolean
  created_at: number
  updated_at: number
}
