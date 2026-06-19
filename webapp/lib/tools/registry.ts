import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod/v4'
import type { ToolDefinition, ToolContext, ToolResult } from './types'

const g = globalThis as any
if (!g.__openchat_pendingToolCalls) {
  g.__openchat_pendingToolCalls = new Map<string, (result: ToolResult) => void>()
}
const pendingToolCalls: Map<string, (result: ToolResult) => void> = g.__openchat_pendingToolCalls

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>()

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool)
  }

  registerMany(tools: ToolDefinition[]): void {
    tools.forEach(tool => this.register(tool))
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }

  getByCategory(category: string): ToolDefinition[] {
    return this.getAll().filter(t => t.category === category)
  }

  getByExecution(execution: 'client' | 'server'): ToolDefinition[] {
    return this.getAll().filter(t => t.execution === execution)
  }

  getEnabled(): ToolDefinition[] {
    return this.getAll().filter(t => t.isEnabled !== false)
  }

  unregister(name: string): boolean {
    return this.tools.delete(name)
  }

  clear(): void {
    this.tools.clear()
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  size(): number {
    return this.tools.size
  }

  toLangChainTools(context?: Partial<ToolContext>): DynamicStructuredTool[] {
    return this.getEnabled().map(tool => this.toLangChainTool(tool, context))
  }

  toLangChainTool(tool: ToolDefinition, context?: Partial<ToolContext>): DynamicStructuredTool {
    const zodSchema = this.jsonSchemaToZod(tool.inputSchema)

    return new DynamicStructuredTool({
      name: tool.name,
      description: tool.description,
      schema: zodSchema,
      func: async (input: Record<string, any>) => {
        let result: ToolResult

        if (tool.execution === 'client') {
          result = await this.executeClientTool(tool.name, input, context || {})
        } else {
          result = await this.execute(tool.name, input, context || {})
        }

        if (!result.success) {
          throw new Error(result.error || 'Tool execution failed')
        }
        return typeof result.data === 'string' ? result.data : JSON.stringify(result.data)
      },
      metadata: {
        category: tool.category,
        execution: tool.execution,
      },
    })
  }

  async execute(
    name: string,
    input: Record<string, any>,
    context: Partial<ToolContext>,
  ): Promise<ToolResult> {
    const tool = this.get(name)
    if (!tool) {
      console.error(`[ToolRegistry] Tool "${name}" not found`)
      return { success: false, error: `Tool "${name}" not found` }
    }

    if (tool.isEnabled === false) {
      console.error(`[ToolRegistry] Tool "${name}" is disabled`)
      return { success: false, error: `Tool "${name}" is disabled` }
    }

    if (!tool.handler) {
      console.error(`[ToolRegistry] Tool "${name}" has no handler`)
      return { success: false, error: `Tool "${name}" has no handler` }
    }

    console.log(`[ToolRegistry] Executing tool: ${name}`, { input, execution: tool.execution })
    try {
      const fullContext: ToolContext = {
        ...context,
        pendingToolCalls,
      }
      const result = await tool.handler(input, fullContext)
      console.log(`[ToolRegistry] Tool "${name}" completed:`, result.success ? 'success' : 'error')
      return result
    } catch (error) {
      console.error(`[ToolRegistry] Tool "${name}" error:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  async executeClientTool(
    name: string,
    input: Record<string, any>,
    context: Partial<ToolContext>,
  ): Promise<ToolResult> {
    const tool = this.get(name)
    if (!tool) {
      return { success: false, error: `Tool "${name}" not found` }
    }

    if (tool.execution !== 'client') {
      return { success: false, error: `Tool "${name}" is not a client tool` }
    }

    const toolCallId = `tc_${Date.now()}_${Math.random().toString(36).slice(2)}`

    if (context.controller) {
      const encoder = new TextEncoder()
      const event = {
        event: 'tool_call' as const,
        tool_call_id: toolCallId,
        tool_name: name,
        tool_input: input,
        execution: 'client' as const,
      }
      console.log('[executeClientTool] Sending tool_call event:', toolCallId, name)
      context.controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
    } else {
      console.log('[executeClientTool] No controller available for sending SSE event')
      return { success: false, error: 'No controller available for client tool execution' }
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingToolCalls.delete(toolCallId)
        reject(new Error(`Client tool "${name}" execution timeout`))
      }, 30000)

      pendingToolCalls.set(toolCallId, (result) => {
        clearTimeout(timeout)
        resolve(result)
      })
    })
  }

  resolveClientToolResult(toolCallId: string, result: ToolResult): boolean {
    const resolver = pendingToolCalls.get(toolCallId)
    if (resolver) {
      resolver(result)
      pendingToolCalls.delete(toolCallId)
      return true
    }
    return false
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

let globalRegistry: ToolRegistry | null = null

export function getToolRegistry(): ToolRegistry {
  if (!globalRegistry) {
    globalRegistry = new ToolRegistry()
    // Auto-register builtin tools
    const { allBuiltinTools } = require('@/lib/tools/builtin')
    globalRegistry.registerMany(allBuiltinTools)
  }
  return globalRegistry
}

export function resetToolRegistry(): void {
  globalRegistry = null
}

export function setToolRegistry(registry: ToolRegistry): void {
  globalRegistry = registry
}
