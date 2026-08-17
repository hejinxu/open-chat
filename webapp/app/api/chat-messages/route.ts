import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getInfo, setSession, getAdapterForRequest, getAgentForRequest } from '@/app/api/utils/common'
import { ConversationNotFoundError } from '@/lib/adapters/dify'
import { AgentNotFoundError, NoAgentsConfiguredError, UnauthorizedError, RiskAuthFailedError, PermissionDeniedError } from '@/lib/errors'
import { AgentExecutor } from '@/lib/executors/agent-executor'
import { verifyRiskToken, checkSmartQueryPermission } from '@/lib/services/risk-auth-verify'
import { startRequest, endRequest, RequestLogger } from '@/lib/services/agent-logger'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      inputs,
      query,
      files,
      conversation_id: conversationId,
      response_mode: responseMode,
      messages,
    } = body
    const { sessionId, user } = getInfo(request)

    const agent = await getAgentForRequest(request)
    const executionMode = agent.execution_mode || 'chat'

    // Risk 平台智能问数：验证 token + 权限检查 + 区划注入
    const isSmartQuery = agent.extra_config?.feature === 'smart_query'
    if (isSmartQuery && inputs) {
      const authToken = inputs.auth_token
      const userInfoApi = inputs.user_info_api

      if (!authToken || !userInfoApi) {
        throw new RiskAuthFailedError('Missing auth_token or user_info_api in inputs')
      }

      // 服务端验证 token（含 RSA 验签）
      const userInfo = await verifyRiskToken(authToken, userInfoApi)
      console.log('[chat-messages] Risk user verified:', { userId: userInfo.userId, userType: userInfo.userType, dictCode: userInfo.dictCode })

      // 权限检查：仅企业法人用户
      checkSmartQueryPermission(userInfo)

      // 服务端覆盖区划信息（防止客户端伪造）
      inputs.region_code = userInfo.dictCode || ''
      inputs.region_name = userInfo.distName || ''
      inputs.user_type = userInfo.userType
      inputs.corname = userInfo.corname || ''
      inputs.cornumber = userInfo.cornumber || ''
    }

    if (agent.backend_type === 'direct_llm' && executionMode !== 'chat') {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const logger = new RequestLogger(requestId)

      startRequest({
        requestId,
        agentId: agent.id,
        agentName: agent.name,
        userId: user,
        query: query || '',
        executionMode,
      })

      console.log('[chat-messages] Agent config:', {
        id: agent.id,
        name: agent.name,
        backend_type: agent.backend_type,
        execution_mode: agent.execution_mode,
        model: agent.model,
        hasApiKey: !!agent.api_key,
        hasApiUrl: !!agent.api_url,
      })

      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          const executor = new AgentExecutor({
            agent,
            userId: user,
            sessionId,
            requestId,
            controller,
          })

          try {
            const { getDatabaseProvider } = await import('@/lib/db')
            const db = getDatabaseProvider()

            // Get agent type and built-in prompt
            let agentType = null
            let builtInPrompt = null
            if (agent.agent_type) {
              const agentTypes = await db.getAgentTypes()
              agentType = agentTypes.find(t => t.id === agent.agent_type || t.name === agent.agent_type)
              if (agentType?.system_prompt_id) {
                builtInPrompt = await db.getSystemPromptById(agentType.system_prompt_id)
              }
            }

            // Run the data-query pipeline: query normalization + table selection + DDL injection
            const { runDataQueryPipeline } = await import('@/lib/services/data-query-pipeline')
            const pipeline = await runDataQueryPipeline({
              agent,
              agentType,
              builtInPrompt,
              query,
              messages: messages || [],
              inputs,
            })

            let systemPrompt = pipeline.systemPrompt
            const canonicalQuery = pipeline.canonicalQuery
            const toolContext = pipeline.toolContext

            // Replace template variables in the final prompt
            if (systemPrompt && inputs) {
              for (const [key, value] of Object.entries(inputs)) {
                if (typeof value === 'string' || typeof value === 'number') {
                  systemPrompt = systemPrompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value))
                } else if (typeof value === 'object' && value !== null) {
                  for (const [subKey, subValue] of Object.entries(value)) {
                    systemPrompt = systemPrompt.replace(
                      new RegExp(`\\{\\{${key}\\.${subKey}\\}\\}`, 'g'),
                      String(subValue),
                    )
                  }
                }
              }
            }

            console.log('[chat-messages] Final system prompt (first 200):', systemPrompt?.substring(0, 200))

            const result = await executor.execute({
              query: canonicalQuery,
              messages: messages || [],
              conversationId,
              systemPrompt,
              toolContext,
            })

            console.log('[chat-messages] Result:', {
              responseLength: result.response?.length,
              responsePreview: result.response?.substring(0, 100),
              conversationId: result.conversationId,
            })

            const messageId = `msg_${Date.now()}`
            const messageEvent = {
              event: 'message',
              id: messageId,
              message_id: messageId,
              conversation_id: result.conversationId || conversationId,
              answer: result.response,
              created_at: Math.floor(Date.now() / 1000),
            }
            console.log('[chat-messages] Sending message event:', JSON.stringify(messageEvent).substring(0, 200))
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(messageEvent)}\n\n`))

            const endEvent = {
              event: 'message_end',
              id: messageId,
              metadata: {},
            }
            console.log('[chat-messages] Sending message_end event')
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(endEvent)}\n\n`))

            logger.info('request', '执行完成', { responseLength: result.response?.length })
            endRequest(requestId, 'completed')
          } catch (error: any) {
            logger.error('request', '执行失败', { error: error.message })
            endRequest(requestId, 'error')
            const errorEvent = {
              event: 'error',
              status: 500,
              message: error.message || 'Internal Server Error',
              code: 'AGENT_EXECUTION_ERROR',
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`))
          } finally {
            controller.close()
          }
        },
      })

      const sessionCookie = setSession(sessionId)
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Set-Cookie': sessionCookie['Set-Cookie'],
        },
      })
    }

    const adapter = await getAdapterForRequest(request)

    const sendParams = {
      inputs: inputs || {},
      query,
      user,
      conversation_id: conversationId || undefined,
      files,
      messages,
      response_mode: responseMode || 'streaming',
    }

    try {
      const res = await adapter.sendMessage(sendParams)
      if (res instanceof Response) {
        const headers = new Headers(res.headers)
        const sessionCookie = setSession(sessionId)
        headers.append('Set-Cookie', sessionCookie['Set-Cookie'])
        return new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers,
        })
      }
      const response = NextResponse.json(res)
      const sessionCookie = setSession(sessionId)
      response.headers.append('Set-Cookie', sessionCookie['Set-Cookie'])
      return response
    }
    catch (error: any) {
      if (error instanceof ConversationNotFoundError) {
        const retryRes = await adapter.sendMessage({ ...sendParams, conversation_id: undefined })
        if (retryRes instanceof Response) {
          const headers = new Headers(retryRes.headers)
          const sessionCookie = setSession(sessionId)
          headers.append('Set-Cookie', sessionCookie['Set-Cookie'])
          return new Response(retryRes.body, {
            status: retryRes.status,
            statusText: retryRes.statusText,
            headers,
          })
        }
        const response = NextResponse.json(retryRes)
        const sessionCookie = setSession(sessionId)
        response.headers.append('Set-Cookie', sessionCookie['Set-Cookie'])
        return response
      }
      throw error
    }
  }
  catch (error: any) {
    if (error instanceof NoAgentsConfiguredError) {
      return new Response(
        JSON.stringify({ message: error.message, code: error.code }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }
    if (error instanceof AgentNotFoundError) {
      return new Response(
        JSON.stringify({ message: error.message, code: error.code }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }
    if (error instanceof UnauthorizedError) {
      return new Response(
        JSON.stringify({ message: error.message, code: error.code }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      )
    }
    if (error instanceof RiskAuthFailedError) {
      return new Response(
        JSON.stringify({ message: error.message, code: error.code }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      )
    }
    if (error instanceof PermissionDeniedError) {
      return new Response(
        JSON.stringify({ message: error.message, code: error.code }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return new Response(
      JSON.stringify({ message: error.message || 'Internal Server Error', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
