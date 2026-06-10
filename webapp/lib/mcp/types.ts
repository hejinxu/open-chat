export interface MCPServerConfig {
  id: string
  name: string
  display_name: string
  description: string
  transport: 'stdio' | 'http' | 'sse'
  config: Record<string, any>
  is_enabled: boolean
}

export interface MCPToolCallResult {
  content: Array<{
    type: string
    text?: string
  }>
  isError?: boolean
}

export interface MCPTool {
  name: string
  description?: string
  inputSchema?: {
    type: string
    properties?: Record<string, any>
    required?: string[]
  }
}
