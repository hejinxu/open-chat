import { StateGraph, MemorySaver, START, END } from '@langchain/langgraph'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { AgentState } from '../state'
import type { ToolRegistry } from '@/lib/tools/registry'

function createAgentNode(model: ChatOpenAI, tools: ToolRegistry, excludeTools?: string[]) {
  const langchainTools = tools.toLangChainTools(undefined, excludeTools)
  const modelWithTools = langchainTools.length > 0 ? model.bindTools(langchainTools) : model

  console.log('[createAgentNode] Tools count:', langchainTools.length)

  return async (state: { messages: BaseMessage[] }) => {
    console.log('[agentNode] Invoking with', state.messages.length, 'messages')

    const messages = state.messages.map((msg) => {
      if (msg instanceof HumanMessage) { return msg }
      if (msg instanceof AIMessage) { return msg }
      if (msg instanceof ToolMessage) { return msg }
      if (msg instanceof SystemMessage) { return msg }
      return new HumanMessage(String(msg.content))
    })

    console.log('[agentNode] Calling model...')
    const response = await modelWithTools.invoke(messages)
    console.log('[agentNode] Response type:', response.constructor.name)
    console.log('[agentNode] Response content length:', typeof response.content === 'string' ? response.content.length : 'not string')
    console.log('[agentNode] Has tool_calls:', !!(response as AIMessage).tool_calls?.length)

    return { messages: [response] }
  }
}

function createToolNode(tools: ToolRegistry, context?: any) {
  return async (state: { messages: BaseMessage[] }) => {
    const lastMessage = state.messages[state.messages.length - 1]

    console.log('[toolNode] Called, last message type:', lastMessage.constructor.name)
    console.log('[toolNode] Has tool_calls:', !!(lastMessage as any).tool_calls?.length)

    if (!(lastMessage instanceof AIMessage || lastMessage.constructor.name === 'AIMessageChunk') || !(lastMessage as any).tool_calls?.length) {
      console.log('[toolNode] No tool calls, returning empty')
      return { messages: [] }
    }

    const toolCalls = (lastMessage as any).tool_calls
    console.log('[toolNode] Processing', toolCalls.length, 'tool calls')

    const results = []

    for (const toolCall of toolCalls) {
      console.log('[toolNode] Executing tool:', toolCall.name)
      console.log('[toolNode] Tool args:', JSON.stringify(toolCall.args))

      const tool = tools.get(toolCall.name)

      if (!tool) {
        console.log('[toolNode] Tool not found:', toolCall.name)
        results.push(
          new ToolMessage({
            content: `Error: Tool "${toolCall.name}" not found`,
            tool_call_id: toolCall.id!,
          }),
        )
        continue
      }

      let result: any

      if (tool.execution === 'client') {
        console.log('[toolNode] Client tool detected, executing via client tool flow')
        // Client tools need to be executed on the client side via SSE
        try {
          result = await tools.executeClientTool(
            toolCall.name,
            toolCall.args as Record<string, any>,
            context || {},
          )
        } catch (error: any) {
          console.log('[toolNode] Error executing client tool:', error.message)
          result = { success: false, error: error.message }
        }
      } else {
        console.log('[toolNode] Server tool, using execute')
        try {
          result = await tools.execute(
            toolCall.name,
            toolCall.args as Record<string, any>,
            context || {},
          )
        } catch (error: any) {
          console.log('[toolNode] Error executing tool:', error.message)
          result = { success: false, error: error.message }
        }
      }

      console.log('[toolNode] Tool result:', result.success ? 'success' : 'error')

      const content = result.success
        ? typeof result.data === 'string' ? result.data : JSON.stringify(result.data)
        : `Error: ${result.error}`

      console.log('[toolNode] Tool message content length:', content.length)

      // 格式化为易读的工具结果
      const formattedContent = `[工具调用结果] ${toolCall.name}\n${content}`

      results.push(
        new ToolMessage({
          content: formattedContent,
          tool_call_id: toolCall.id!,
        }),
      )
    }

    console.log('[toolNode] Returning', results.length, 'tool results')
    return { messages: results }
  }
}

// 搜索工具最大调用轮数
const MAX_SEARCH_ROUNDS = 5
// 总工具调用轮数上限（防止无限循环）
const MAX_TOTAL_ROUNDS = 12

function shouldContinue(state: { messages: BaseMessage[] }): typeof END | 'tools' | 'summarize' {
  const lastMessage = state.messages[state.messages.length - 1]
  const messageCount = state.messages.length

  // 统计搜索工具调用次数
  let searchToolCount = 0
  let totalToolCount = 0
  for (const msg of state.messages) {
    if (msg instanceof ToolMessage) {
      totalToolCount++
      const content = String(msg.content)
      if (content.includes('[工具调用结果] fetch_url') || content.includes('[工具调用结果] web_search')) {
        searchToolCount++
      }
    }
  }

  console.log('[shouldContinue] Message count:', messageCount, 'Search tool calls:', searchToolCount, 'Total tool calls:', totalToolCount)
  console.log('[shouldContinue] Last message type:', lastMessage.constructor.name)
  console.log('[shouldContinue] Has tool_calls:', !!(lastMessage as any).tool_calls?.length)

  // 检查是否有 tool_calls
  const hasToolCalls = (lastMessage instanceof AIMessage || lastMessage.constructor.name === 'AIMessageChunk')
    && !!(lastMessage as any).tool_calls?.length

  // 搜索工具达到上限，强制总结
  if (searchToolCount >= MAX_SEARCH_ROUNDS && hasToolCalls) {
    console.log('[shouldContinue] Max search tool rounds reached, routing to summarize')
    return 'summarize'
  }

  // 总工具调用达到上限，强制总结
  if (totalToolCount >= MAX_TOTAL_ROUNDS && hasToolCalls) {
    console.log('[shouldContinue] Max total tool rounds reached, routing to summarize')
    return 'summarize'
  }

  // 正常工具调用
  if (hasToolCalls) {
    console.log('[shouldContinue] Routing to tools')
    return 'tools'
  }

  // 没有 tool_calls，正常结束
  console.log('[shouldContinue] Routing to END')
  return END
}

export interface CreateReactAgentOptions {
  model?: string
  apiKey?: string
  apiUrl?: string
  systemPrompt?: string
  maxIterations?: number
  checkpointer?: MemorySaver
  context?: any
  /**
   * Tool names to exclude from binding to the model (e.g. web_search when network is disabled).
   */
  excludeTools?: string[]
}

export function createReactAgent(
  tools: ToolRegistry,
  options: CreateReactAgentOptions = {},
) {
  const {
    model = 'gpt-4',
    apiKey,
    apiUrl,
    systemPrompt,
    checkpointer = new MemorySaver(),
    context,
    excludeTools,
  } = options

  const chatModel = new ChatOpenAI({
    modelName: model,
    apiKey,
    configuration: apiUrl ? { baseURL: apiUrl } : undefined,
    streaming: true,
    temperature: 0.1,
    maxTokens: 4096,
  })

  const agentNode = createAgentNode(chatModel, tools, excludeTools)
  const toolNode = createToolNode(tools, context)

  // 创建总结节点 - 当工具调用达到上限时强制总结
  const summarizeNode = async (state: { messages: BaseMessage[] }) => {
    console.log('[summarizeNode] Forcing summary after max tool rounds')

    // 获取用户原始问题
    const userMessages = state.messages.filter(m => m instanceof HumanMessage)
    const originalQuestion = userMessages.length > 0
      ? String(userMessages[userMessages.length - 1].content)
      : ''

    // 收集所有工具调用结果
    const toolResults: string[] = []
    for (const msg of state.messages) {
      if (msg instanceof ToolMessage) {
        toolResults.push(String(msg.content))
      }
    }

    // 构建总结提示
    const summaryPrompt = `用户问题：${originalQuestion}

以下是工具调用获取的数据：
${toolResults.join('\n\n---\n\n')}

请根据以上数据回答用户的问题：
- 如果数据足以回答，请直接给出答案
- 如果数据不足以回答或查询失败，请明确告知用户"查询未能完成，已达到工具调用次数限制，请重试或简化问题"
- 不要编造数据或猜测答案
- 不要总结工具调用过程，只关注回答用户的问题`

    const response = await chatModel.invoke([new HumanMessage(summaryPrompt)])
    return { messages: [response] }
  }

  console.log('[createReactAgent] Building graph with agent, tools, and summarize nodes')

  const graph = new StateGraph(AgentState)
    .addNode('agent', agentNode)
    .addNode('tools', toolNode)
    .addNode('summarize', summarizeNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue)
    .addEdge('tools', 'agent')
    .addEdge('summarize', END)

  console.log('[createReactAgent] Compiling graph')
  return graph.compile({ checkpointer })
}

export interface InvokeAgentOptions {
  messages: Array<{ role: string, content: string }>
  threadId?: string
  systemPrompt?: string
  executionMode?: 'chat' | 'react' | 'plan_and_execute'
}

export async function invokeAgent(
  agent: ReturnType<typeof createReactAgent>,
  options: InvokeAgentOptions,
) {
  const { messages, threadId, executionMode = 'react' } = options

  const formattedMessages = messages.map((msg) => {
    switch (msg.role) {
      case 'system':
        return new SystemMessage(msg.content)
      case 'assistant':
        return new AIMessage(msg.content)
      default:
        return new HumanMessage(msg.content)
    }
  })

  const config = threadId
    ? { configurable: { thread_id: threadId } }
    : undefined

  const result = await agent.invoke(
    {
      messages: formattedMessages,
      executionMode,
    },
    config,
  )

  return result
}

export function createChatExecutor(
  model: string,
  apiKey?: string,
  apiUrl?: string,
) {
  const chatModel = new ChatOpenAI({
    modelName: model,
    apiKey: apiKey,
    configuration: apiUrl ? { baseURL: apiUrl } : undefined,
    streaming: true,
    temperature: 0.7,
  })

  return async (messages: Array<{ role: string, content: string }>, systemPrompt?: string) => {
    const formattedMessages = []

    if (systemPrompt) {
      formattedMessages.push(new SystemMessage(systemPrompt))
    }

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

    const response = await chatModel.invoke(formattedMessages)
    return response.content as string
  }
}
