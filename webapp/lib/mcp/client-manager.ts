import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { ToolDefinition } from '@/lib/tools/types'

export interface MCPServerConfig {
  id: string
  name: string
  transport: 'stdio' | 'http' | 'sse'
  config: Record<string, any>
}

export class MCPClientManager {
  private clients = new Map<string, Client>()
  private tools = new Map<string, ToolDefinition[]>()

  async connectServer(server: MCPServerConfig): Promise<ToolDefinition[]> {
    try {
      const client = new Client(
        { name: `openchat-${server.name}`, version: '1.0.0' },
        { capabilities: {} },
      )

      let transport: any

      switch (server.transport) {
        case 'stdio':
          transport = new StdioClientTransport({
            command: server.config.command || 'npx',
            args: server.config.args || [],
            env: server.config.env,
          })
          break

        case 'http':
        case 'sse': {
          const url = new URL(server.config.url || 'http://localhost:3000/mcp')
          transport = new StreamableHTTPClientTransport(url)
          break
        }

        default:
          throw new Error(`Unsupported transport: ${server.transport}`)
      }

      await client.connect(transport)
      this.clients.set(server.id, client)

      const { tools } = await client.listTools()
      const toolDefinitions: ToolDefinition[] = tools.map(tool => ({
        name: `${server.name}__${tool.name}`,
        displayName: tool.name,
        description: tool.description || '',
        category: 'mcp' as const,
        execution: 'server' as const,
        inputSchema: (tool.inputSchema || { type: 'object', properties: {} }) as any,
        isBuiltin: false,
        isEnabled: true,
        permissions: ['all'],
        metadata: {
          serverId: server.id,
          serverName: server.name,
          originalToolName: tool.name,
        },
      }))

      this.tools.set(server.id, toolDefinitions)
      return toolDefinitions
    } catch (error: any) {
      console.error(`Failed to connect to MCP server ${server.name}:`, error)
      throw error
    }
  }

  async disconnectServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId)
    if (client) {
      await client.close()
      this.clients.delete(serverId)
      this.tools.delete(serverId)
    }
  }

  async disconnectAll(): Promise<void> {
    for (const [serverId] of this.clients) {
      await this.disconnectServer(serverId)
    }
  }

  getClient(serverId: string): Client | undefined {
    return this.clients.get(serverId)
  }

  getTools(serverId: string): ToolDefinition[] {
    return this.tools.get(serverId) || []
  }

  getAllTools(): ToolDefinition[] {
    const allTools: ToolDefinition[] = []
    for (const tools of this.tools.values()) {
      allTools.push(...tools)
    }
    return allTools
  }

  isConnected(serverId: string): boolean {
    return this.clients.has(serverId)
  }

  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, any>,
  ): Promise<any> {
    const client = this.clients.get(serverId)
    if (!client) {
      throw new Error(`MCP server ${serverId} not connected`)
    }

    const result = await client.callTool({
      name: toolName,
      arguments: args,
    })

    return result
  }
}

let globalManager: MCPClientManager | null = null

export function getMCPClientManager(): MCPClientManager {
  if (!globalManager) {
    globalManager = new MCPClientManager()
  }
  return globalManager
}
