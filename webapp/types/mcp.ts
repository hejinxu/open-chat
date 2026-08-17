export type MCPTransport = 'stdio' | 'http' | 'sse'

export interface MCPServerRecord {
  id: string
  name: string
  display_name: string
  description: string
  transport: MCPTransport
  config: string
  is_enabled: boolean
  last_connected_at: number | null
  created_at: number
  updated_at: number
}
