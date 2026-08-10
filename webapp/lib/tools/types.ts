export interface JSONSchema {
  type: string
  properties?: Record<string, JSONSchemaProperty>
  required?: string[]
  items?: JSONSchemaProperty
  enum?: string[]
  default?: any
  description?: string
}

export interface JSONSchemaProperty {
  type: string
  description?: string
  enum?: string[]
  default?: any
  items?: JSONSchemaProperty
  properties?: Record<string, JSONSchemaProperty>
  required?: string[]
}

export type ToolCategory = 'builtin' | 'mcp' | 'custom'

export type ToolExecution = 'client' | 'server'

export type ToolHandlerType = 'function' | 'mcp' | 'http'

export interface ToolDefinition {
  id?: string
  name: string
  displayName: string
  description: string
  category: ToolCategory
  execution: ToolExecution
  inputSchema: JSONSchema
  outputSchema?: JSONSchema
  handler?: ToolHandler
  handlerType?: ToolHandlerType
  handlerConfig?: Record<string, any>
  isBuiltin?: boolean
  isEnabled?: boolean
  permissions?: string[]
  metadata?: Record<string, any>
}

export interface ToolContext {
  userId?: string
  sessionId?: string
  agentId?: string
  requestId?: string
  controller?: ReadableStreamDefaultController
  pendingToolCalls?: Map<string, (result: ToolResult) => void>
  agentConfig?: Record<string, any>
  /**
   * Runtime context for the data-query pipeline, e.g.
   * { canonicalQuery, userQuery, dialect, enableSemanticCheck, llm }
   * Kept loosely typed to avoid coupling the tools layer to services.
   */
  queryContext?: Record<string, any>
}

export interface ToolResult {
  success: boolean
  data?: any
  error?: string
  metadata?: Record<string, any>
}

export type ToolHandler = (
  input: Record<string, any>,
  context: ToolContext,
) => Promise<ToolResult>

export interface ToolCallEvent {
  event: 'tool_call'
  tool_call_id: string
  tool_name: string
  tool_input: Record<string, any>
  execution: ToolExecution
}

export interface ToolResultEvent {
  event: 'tool_result'
  tool_call_id: string
  tool_name: string
  result: any
  error?: string
}

export interface AgentThinkingEvent {
  event: 'agent_thinking'
  thought: string
  next_action: 'tool_call' | 'respond'
}

export interface PlanCreatedEvent {
  event: 'plan_created'
  plan: PlanStep[]
}

export interface PlanStepUpdateEvent {
  event: 'plan_step_update'
  step: number
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  result?: string
}

export interface InterruptEvent {
  event: 'interrupt'
  interrupt_id: string
  question: string
  options?: string[]
}

export type AgentSSEEvent
  = | AgentThinkingEvent
    | ToolCallEvent
    | ToolResultEvent
    | PlanCreatedEvent
    | PlanStepUpdateEvent
    | InterruptEvent

export interface PlanStep {
  step: number
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  result?: string
}

export interface ToolPermission {
  id: string
  toolId: string
  role: string
  isAllowed: boolean
  createdAt: number
}

export interface AgentToolConfig {
  id: string
  agentId: string
  toolId: string
  config: Record<string, any>
  createdAt: number
}
