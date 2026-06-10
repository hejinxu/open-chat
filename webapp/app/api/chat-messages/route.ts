import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getInfo, setSession, getAdapterForRequest, getAgentForRequest } from '@/app/api/utils/common'
import { ConversationNotFoundError } from '@/lib/adapters/dify'
import { AgentNotFoundError, NoAgentsConfiguredError, UnauthorizedError } from '@/lib/errors'
import { AgentExecutor } from '@/lib/executors/agent-executor'

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

    if (agent.backend_type === 'direct_llm' && executionMode !== 'chat') {
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
            controller,
          })

          try {
            const result = await executor.execute({
              query,
              messages: messages || [],
              conversationId,
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
          } catch (error: any) {
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
    return new Response(
      JSON.stringify({ message: error.message || 'Internal Server Error', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
