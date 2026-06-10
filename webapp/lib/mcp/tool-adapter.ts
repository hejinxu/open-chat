import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod/v4'
import type { MCPClientManager } from './client-manager'
import type { ToolDefinition } from '@/lib/tools/types'

export class MCPToolAdapter {
  private manager: MCPClientManager

  constructor(manager: MCPClientManager) {
    this.manager = manager
  }

  convertToLangChainTool(tool: ToolDefinition): DynamicStructuredTool {
    const serverId = tool.metadata?.serverId
    const originalToolName = tool.metadata?.originalToolName

    if (!serverId || !originalToolName) {
      throw new Error(`Invalid MCP tool: ${tool.name}`)
    }

    const zodSchema = this.jsonSchemaToZod(tool.inputSchema)

    return new DynamicStructuredTool({
      name: tool.name,
      description: tool.description,
      schema: zodSchema,
      func: async (input: Record<string, any>) => {
        try {
          const result = await this.manager.callTool(
            serverId,
            originalToolName,
            input,
          )

          if (result.isError) {
            return `Error: ${JSON.stringify(result.content)}`
          }

          const textContent = result.content
            ?.filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n')

          return textContent || JSON.stringify(result.content)
        } catch (error: any) {
          return `Error: ${error.message}`
        }
      },
      metadata: {
        category: 'mcp',
        serverId,
        originalToolName,
      },
    })
  }

  convertAllToLangChainTools(tools: ToolDefinition[]): DynamicStructuredTool[] {
    return tools.map(tool => this.convertToLangChainTool(tool))
  }

  private jsonSchemaToZod(schema: Record<string, any>): z.ZodType<any> {
    const shape: Record<string, z.ZodType<any>> = {}

    if (schema.type === 'object' && schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties) as [string, any][]) {
        let field: z.ZodType<any>

        switch (prop.type) {
          case 'string':
            field = z.string()
            break
          case 'number':
            field = z.number()
            break
          case 'boolean':
            field = z.boolean()
            break
          case 'array':
            field = z.array(z.any())
            break
          case 'object':
            field = z.record(z.string(), z.any())
            break
          default:
            field = z.any()
        }

        if (prop.description) {
          field = field.describe(prop.description)
        }

        if (prop.default !== undefined) {
          field = field.default(prop.default)
        }

        if (!schema.required?.includes(key)) {
          field = field.optional()
        }

        shape[key] = field
      }
    }

    return z.object(shape)
  }
}

export function createMCPToolAdapter(manager: MCPClientManager): MCPToolAdapter {
  return new MCPToolAdapter(manager)
}
