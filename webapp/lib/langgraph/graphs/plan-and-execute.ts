import { StateGraph, MemorySaver, START, END } from '@langchain/langgraph'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { Annotation } from '@langchain/langgraph'
import type { ToolRegistry } from '@/lib/tools/registry'
import { getStepExecutionPrompt } from '../prompts'
import type { RequestLogger } from '@/lib/services/agent-logger'
import { truncateToolResult, generateStepId } from '@/lib/services/agent-logger'

const PlannerState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  plan: Annotation<Array<{ step: number, description: string, status: string, result?: string }>>({
    reducer: (left, right) => {
      const merged = [...left]
      for (const item of right) {
        const existingIdx = merged.findIndex(i => i.step === item.step)
        if (existingIdx >= 0) {
          merged[existingIdx] = item
        } else {
          merged.push(item)
        }
      }
      return merged
    },
    default: () => [],
  }),
  currentStep: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),
  results: Annotation<string[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  status: Annotation<'planning' | 'executing' | 'replanning' | 'completed'>({
    reducer: (_, update) => update,
    default: () => 'planning' as const,
  }),
  current_step_id: Annotation<string | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),
})

type PlannerStateType = typeof PlannerState.State

interface CreatePlanAndExecuteAgentOptions {
  model?: string
  apiKey?: string
  apiUrl?: string
  systemPrompt?: string
  maxRetries?: number
  checkpointer?: MemorySaver
  context?: any
  logger?: RequestLogger
  /**
   * Tool names to exclude from binding to the model (e.g. web_search when network is disabled).
   */
  excludeTools?: string[]
}

function createPlannerNode(model: ChatOpenAI, logger?: RequestLogger) {
  return async (state: PlannerStateType) => {
    const lastMessage = state.messages[state.messages.length - 1]
    const userQuery = typeof lastMessage.content === 'string' ? lastMessage.content : ''

    logger?.info('planner', '生成执行计划', { userQuery: userQuery.slice(0, 200) })

    const planningPrompt = `你是一个任务规划专家。请将用户的任务分解为可执行的步骤。

请以JSON格式返回计划（只返回JSON，不要其他内容）：
{
  "steps": [
    { "step": 1, "description": "步骤描述" },
    { "step": 2, "description": "步骤描述" }
  ]
}

注意：
1. 每个步骤应该是独立可执行的
2. 步骤之间应该有逻辑顺序
3. 步骤数量控制在 2-5 个
4. 每个步骤的描述要清晰具体

用户任务：${userQuery}`

    const response = await model.invoke([new HumanMessage(planningPrompt)])
    const content = typeof response.content === 'string' ? response.content : ''

    let steps: Array<{ step: number, description: string }> = []
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        steps = parsed.steps || []
      }
    } catch {
      steps = [{ step: 1, description: userQuery }]
    }

    const plan = steps.map(s => ({
      step: s.step,
      description: s.description,
      status: 'pending' as const,
    }))

    logger?.info('planner', '计划生成完成', {
      steps: plan.map(s => ({ step: s.step, description: s.description })),
    })

    return {
      plan,
      currentStep: 1,
      status: 'executing' as const,
    }
  }
}

function createExecutorNode(model: ChatOpenAI, tools: ToolRegistry, context?: any, excludeTools?: string[], logger?: RequestLogger) {
  return async (state: PlannerStateType) => {
    const currentPlan = state.plan
    const currentStepIdx = state.currentStep

    const currentStepItem = currentPlan.find(s => s.step === currentStepIdx)
    if (!currentStepItem) {
      console.log('[PlanExecute] No step found for index:', currentStepIdx)
      logger?.warn('executor', `未找到步骤: ${currentStepIdx}`)
      return { status: 'completed' as const }
    }

    console.log('[PlanExecute] Executing step:', currentStepItem.step, '-', currentStepItem.description)
    const executorStepId = generateStepId()
    logger?.info('executor', `执行步骤 ${currentStepItem.step}`, {
      step: currentStepItem.step,
      description: currentStepItem.description,
    }, { stepId: executorStepId })

    const langchainTools = tools.toLangChainTools(undefined, excludeTools)
    const userQuery = typeof state.messages[0]?.content === 'string' ? state.messages[0].content : ''

    // 使用统一的提示词管理
    const executionPrompt = getStepExecutionPrompt(
      currentStepItem.step,
      currentStepItem.description,
      userQuery,
    )

    let result: string
    const startTime = Date.now()

    if (langchainTools.length > 0) {
      console.log('[PlanExecute] Tools available:', langchainTools.length)
      const modelWithTools = model.bindTools(langchainTools)
      const response = await modelWithTools.invoke([new HumanMessage(executionPrompt)])

      if (response.tool_calls && response.tool_calls.length > 0) {
        console.log('[PlanExecute] Tool calls:', response.tool_calls.length)
        logger?.info('executor', `步骤 ${currentStepItem.step} 调用工具`, {
          toolCalls: response.tool_calls.map(tc => ({ name: tc.name, args: tc.args })),
        })

        const toolContext = { ...context, parentStepId: executorStepId }
        const toolResults = []
        for (const toolCall of response.tool_calls) {
          console.log('[PlanExecute] Executing tool:', toolCall.name)
          try {
            const tool = tools.get(toolCall.name)
            if (tool && tool.execution === 'client') {
              // 客户端工具：通过 SSE 通知客户端执行
              console.log('[PlanExecute] Client tool detected, executing via client tool flow')
              const toolResult = await tools.executeClientTool(
                toolCall.name,
                toolCall.args as Record<string, any>,
                toolContext,
              )
              toolResults.push(
                `[工具结果] ${toolCall.name}:\n${toolResult.success ? (typeof toolResult.data === 'string' ? toolResult.data : JSON.stringify(toolResult.data, null, 2)) : `错误: ${toolResult.error}`}`,
              )
            } else {
              // 服务端工具：直接执行
              const toolResult = await tools.execute(
                toolCall.name,
                toolCall.args as Record<string, any>,
                toolContext,
              )
              console.log('[PlanExecute] Tool result:', toolResult.success ? 'success' : 'error')
              toolResults.push(
                `[工具结果] ${toolCall.name}:\n${toolResult.success ? (typeof toolResult.data === 'string' ? toolResult.data : JSON.stringify(toolResult.data, null, 2)) : `错误: ${toolResult.error}`}`,
              )
            }
          } catch (e: any) {
            console.log('[PlanExecute] Tool error:', e.message)
            toolResults.push(`[工具错误] ${toolCall.name}: ${e.message}`)
          }
        }
        result = toolResults.join('\n\n')
      } else {
        console.log('[PlanExecute] No tool calls, using direct response')
        logger?.info('executor', `步骤 ${currentStepItem.step} 直接响应`, {
          responseLength: typeof response.content === 'string' ? response.content.length : 0,
        })
        result = typeof response.content === 'string' ? response.content : ''
      }
    } else {
      console.log('[PlanExecute] No tools available')
      const response = await model.invoke([new HumanMessage(executionPrompt)])
      result = typeof response.content === 'string' ? response.content : ''
    }

    const durationMs = Date.now() - startTime
    console.log('[PlanExecute] Step result length:', result.length)

    logger?.info('executor', `步骤 ${currentStepItem.step} 完成`, {
      resultLength: result.length,
      resultPreview: result.slice(0, 500),
    }, { stepId: executorStepId, durationMs })

    const updatedPlan = currentPlan.map(s =>
      s.step === currentStepIdx
        ? { ...s, status: 'completed', result }
        : s,
    )

    const nextStep = currentStepIdx + 1
    const hasMoreSteps = updatedPlan.some(s => s.step === nextStep)

    return {
      plan: updatedPlan,
      results: [result],
      currentStep: hasMoreSteps ? nextStep : currentStepIdx,
      status: hasMoreSteps ? 'executing' as const : 'completed' as const,
    }
  }
}

function createReplannerNode(model: ChatOpenAI, logger?: RequestLogger) {
  return async (state: PlannerStateType) => {
    const completedSteps = state.plan.filter(s => s.status === 'completed')
    const failedSteps = state.plan.filter(s => s.status === 'failed')

    if (failedSteps.length === 0) {
      return { status: 'completed' as const }
    }

    logger?.info('replanner', '重新规划', {
      failedSteps: failedSteps.map(s => ({ step: s.step, description: s.description })),
    })

    const replanningPrompt = `任务执行遇到了问题，请重新规划剩余步骤。

已完成的步骤：
${completedSteps.map(s => `步骤 ${s.step}: ${s.description} - 结果: ${s.result}`).join('\n')}

失败的步骤：
${failedSteps.map(s => `步骤 ${s.step}: ${s.description}`).join('\n')}

原始任务：${state.messages[0]?.content || ''}

请以JSON格式返回新的计划（只返回JSON）：
{
  "steps": [
    { "step": 1, "description": "步骤描述" }
  ]
}`

    const response = await model.invoke([new HumanMessage(replanningPrompt)])
    const content = typeof response.content === 'string' ? response.content : ''

    let newSteps: Array<{ step: number, description: string }> = []
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        newSteps = parsed.steps || []
      }
    } catch {
      return { status: 'completed' as const }
    }

    const maxStep = Math.max(...completedSteps.map(s => s.step), 0)
    const newPlan = [
      ...completedSteps,
      ...newSteps.map((s, i) => ({
        step: maxStep + i + 1,
        description: s.description,
        status: 'pending' as const,
      })),
    ]

    return {
      plan: newPlan,
      currentStep: maxStep + 1,
      status: 'executing' as const,
    }
  }
}

function createSummarizerNode(model: ChatOpenAI, logger?: RequestLogger) {
  return async (state: PlannerStateType) => {
    const completedSteps = state.plan.filter(s => s.status === 'completed')
    const userQuery = state.messages[0]?.content || ''

    logger?.info('summarizer', '生成最终回答', {
      completedSteps: completedSteps.length,
    })

    const summaryPrompt = `请根据以下执行结果，为用户生成一个完整的回答。

用户问题：${userQuery}

执行结果：
${completedSteps.map(s => `步骤 ${s.step} (${s.description}): ${s.result}`).join('\n\n')}

请生成一个清晰、完整的回答：`

    const response = await model.invoke([new HumanMessage(summaryPrompt)])
    const summary = typeof response.content === 'string' ? response.content : ''

    return {
      messages: [new AIMessage(summary)],
      status: 'completed' as const,
    }
  }
}

function shouldContinuePlanning(state: PlannerStateType): typeof END | 'executor' {
  if (state.status === 'completed') {
    return END
  }
  return 'executor'
}

function shouldContinueExecution(state: PlannerStateType): typeof END | 'replanner' | 'executor' | 'summarizer' {
  if (state.status === 'completed') {
    return 'summarizer'
  }

  const failedSteps = state.plan.filter(s => s.status === 'failed')
  if (failedSteps.length > 0) {
    return 'replanner'
  }

  const nextStep = state.currentStep
  const hasMoreSteps = state.plan.some(s => s.step === nextStep && s.status === 'pending')
  if (hasMoreSteps) {
    return 'executor'
  }

  return 'summarizer'
}

function shouldContinueAfterReplan(state: PlannerStateType): typeof END | 'executor' {
  if (state.status === 'completed') {
    return END
  }
  return 'executor'
}

export function createPlanAndExecuteAgent(
  tools: ToolRegistry,
  options: CreatePlanAndExecuteAgentOptions = {},
) {
  const {
    model = 'gpt-4',
    apiKey,
    apiUrl,
    systemPrompt,
    maxRetries = 2,
    checkpointer = new MemorySaver(),
    context,
    logger,
    excludeTools,
  } = options

  const chatModel = new ChatOpenAI({
    modelName: model,
    apiKey,
    configuration: apiUrl ? { baseURL: apiUrl } : undefined,
    streaming: true,
    temperature: 0.7,
  })

  const plannerNode = createPlannerNode(chatModel, logger)
  const executorNode = createExecutorNode(chatModel, tools, context, excludeTools, logger)
  const replannerNode = createReplannerNode(chatModel, logger)
  const summarizerNode = createSummarizerNode(chatModel, logger)

  const graph = new StateGraph(PlannerState)
    .addNode('planner', plannerNode)
    .addNode('executor', executorNode)
    .addNode('replanner', replannerNode)
    .addNode('summarizer', summarizerNode)
    .addEdge(START, 'planner')
    .addConditionalEdges('planner', shouldContinuePlanning)
    .addConditionalEdges('executor', shouldContinueExecution)
    .addConditionalEdges('replanner', shouldContinueAfterReplan)
    .addEdge('summarizer', END)

  return graph.compile({ checkpointer })
}

export async function invokePlanAndExecuteAgent(
  agent: ReturnType<typeof createPlanAndExecuteAgent>,
  messages: Array<{ role: string, content: string }>,
  threadId?: string,
) {
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
    },
    config,
  )

  return result
}
