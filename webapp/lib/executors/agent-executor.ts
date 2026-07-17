import { createReactAgent, createChatExecutor } from '@/lib/langgraph/graphs/react-agent'
import { createPlanAndExecuteAgent } from '@/lib/langgraph/graphs/plan-and-execute'
import { preloadTiktoken } from '@/lib/langgraph/tiktoken-preload'
import { getSystemPrompt } from '@/lib/langgraph/prompts'
import type { ToolRegistry } from '@/lib/tools/registry'
import { getToolRegistry } from '@/lib/tools/registry'
import { allBuiltinTools } from '@/lib/tools/builtin'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import type { AgentConfig } from '@/types/agent'
import type { ToolResult } from '@/lib/tools/types'

let tiktokenPreloaded = false

export interface AgentExecutorOptions {
  agent: AgentConfig
  userId?: string
  sessionId?: string
  requestId?: string
  controller?: ReadableStreamDefaultController
}

export class AgentExecutor {
  private toolRegistry: ToolRegistry
  private agent: AgentConfig
  private userId?: string
  private sessionId?: string
  private requestId?: string
  private controller?: ReadableStreamDefaultController

  constructor(options: AgentExecutorOptions) {
    this.agent = options.agent
    this.userId = options.userId
    this.sessionId = options.sessionId
    this.requestId = options.requestId
    this.controller = options.controller
    // Use global registry to share pendingToolCalls with tool-result route
    this.toolRegistry = getToolRegistry()
    this.initializeTools()
  }

  private initializeTools(): void {
    // Only register if not already registered
    if (this.toolRegistry.size() === 0) {
      this.toolRegistry.registerMany(allBuiltinTools)
    }
  }

  async execute(params: {
    query: string
    messages?: Array<{ role: string, content: string }>
    conversationId?: string
    systemPrompt?: string
  }): Promise<{
    response: string
    conversationId?: string
    toolCalls?: Array<{ name: string, args: Record<string, any>, result: any }>
  }> {
    const { query, messages = [], conversationId, systemPrompt } = params
    const executionMode = this.agent.execution_mode || 'chat'

    const allMessages = [
      ...messages,
      { role: 'user', content: query },
    ]

    switch (executionMode) {
      case 'chat':
        return this.executeChat(allMessages, systemPrompt)
      case 'react':
        return this.executeReAct(allMessages, conversationId, systemPrompt)
      case 'plan_and_execute':
        return this.executePlanAndExecute(allMessages, conversationId, systemPrompt)
      default:
        return this.executeChat(allMessages, systemPrompt)
    }
  }

  private async executeChat(
    messages: Array<{ role: string, content: string }>,
    systemPrompt?: string,
  ): Promise<{ response: string }> {
    const executor = createChatExecutor(
      this.agent.model || 'gpt-4',
      this.agent.api_key,
      this.agent.api_url,
    )

    const response = await executor(messages, systemPrompt)
    return { response }
  }

  private async executeReAct(
    messages: Array<{ role: string, content: string }>,
    conversationId?: string,
    systemPrompt?: string,
  ): Promise<{
    response: string
    conversationId?: string
    toolCalls?: Array<{ name: string, args: Record<string, any>, result: any }>
  }> {
    console.log('[AgentExecutor] executeReAct called with', messages.length, 'messages')

    if (!tiktokenPreloaded) {
      tiktokenPreloaded = true
      preloadTiktoken().catch(() => {})
    }

    const agent = createReactAgent(this.toolRegistry, {
      model: this.agent.model || 'gpt-4',
      apiKey: this.agent.api_key,
      apiUrl: this.agent.api_url,
      systemPrompt,
      context: {
        controller: this.controller,
        agentConfig: this.agent.agent_config || {},
      },
    })

    const threadId = conversationId || `thread_${this.userId}_${Date.now()}`

    const formattedMessages = []

    // 系统提示词：优先使用用户自定义的 systemPrompt，否则用默认提示词
    const currentDate = new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'long',
    })
    if (systemPrompt) {
      // 用户自定义系统提示词（来自 extra_config.system_prompt）
      const finalPrompt = systemPrompt.replace(/\{\{current_date\}\}/g, currentDate)
      formattedMessages.push(new SystemMessage(finalPrompt))
      console.log('[AgentExecutor] Using custom system prompt, length:', finalPrompt.length)
    } else {
      // 默认系统提示词
      const systemMessage = getSystemPrompt(currentDate)
      formattedMessages.push(new SystemMessage(systemMessage))
      console.log('[AgentExecutor] Using default system prompt')
    }

    // 添加用户消息
    for (const msg of messages) {
      switch (msg.role) {
        case 'system':
          formattedMessages.push(new SystemMessage(msg.content))
          break
        case 'assistant':
          formattedMessages.push(new AIMessage(msg.content))
          break
        default:
          formattedMessages.push(new HumanMessage(msg.content))
      }
    }

    console.log('[AgentExecutor] Invoking agent with', formattedMessages.length, 'formatted messages')

    try {
      const result = await agent.invoke(
        {
          messages: formattedMessages,
          executionMode: 'react' as const,
        },
        {
          configurable: { thread_id: threadId },
        },
      )

      console.log('[AgentExecutor] Agent invocation completed')

      const resultAny = result as any
      const lastMessage = resultAny.messages[resultAny.messages.length - 1]
      const response = typeof lastMessage.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage.content)

      console.log('[AgentExecutor] Response length:', response.length)

      return {
        response,
        conversationId: threadId,
      }
    } catch (error: any) {
      console.error('[AgentExecutor] Error during agent invocation:', error)
      throw error
    }
  }

  private async executePlanAndExecute(
    messages: Array<{ role: string, content: string }>,
    conversationId?: string,
    systemPrompt?: string,
  ): Promise<{
    response: string
    conversationId?: string
  }> {
    if (!tiktokenPreloaded) {
      tiktokenPreloaded = true
      preloadTiktoken().catch(() => {})
    }

    const agent = createPlanAndExecuteAgent(this.toolRegistry, {
      model: this.agent.model || 'gpt-4',
      apiKey: this.agent.api_key,
      apiUrl: this.agent.api_url,
      context: {
        controller: this.controller,
        agentConfig: this.agent.agent_config || {},
      },
    })

    const threadId = conversationId || `plan_${this.userId}_${Date.now()}`

    const formattedMessages = []

    // 系统提示词：优先使用用户自定义的 systemPrompt，否则用默认提示词
    const currentDate = new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'long',
    })
    if (systemPrompt) {
      const finalPrompt = systemPrompt.replace(/\{\{current_date\}\}/g, currentDate)
      formattedMessages.push(new SystemMessage(finalPrompt))
    } else {
      formattedMessages.push(new SystemMessage(`当前日期：${currentDate}。你是一个有用的助手，可以使用工具来帮助用户。`))
    }

    // 添加用户消息
    for (const msg of messages) {
      switch (msg.role) {
        case 'system':
          formattedMessages.push(new SystemMessage(msg.content))
          break
        case 'assistant':
          formattedMessages.push(new AIMessage(msg.content))
          break
        default:
          formattedMessages.push(new HumanMessage(msg.content))
      }
    }

    const result = await agent.invoke(
      {
        messages: formattedMessages,
      },
      {
        configurable: { thread_id: threadId },
      },
    )

    const resultAny = result as any
    const lastMessage = resultAny.messages[resultAny.messages.length - 1]
    const response = typeof lastMessage.content === 'string'
      ? lastMessage.content
      : JSON.stringify(lastMessage.content)

    return {
      response,
      conversationId: threadId,
    }
  }

  resolveClientToolResult(toolCallId: string, result: ToolResult): boolean {
    return this.toolRegistry.resolveClientToolResult(toolCallId, result)
  }
}

export function getAgentExecutor(options: AgentExecutorOptions): AgentExecutor {
  return new AgentExecutor(options)
}
