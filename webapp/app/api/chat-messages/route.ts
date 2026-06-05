import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getInfo, setSession, getAdapterForRequest } from '@/app/api/utils/common'
import { ConversationNotFoundError } from '@/lib/adapters/dify'
import { AgentNotFoundError, NoAgentsConfiguredError, UnauthorizedError } from '@/lib/errors'

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
        // Ensure session_id cookie is set for consistent user identity
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
      // Backend conversation_id expired — retry without conversation_id
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
    // Use instanceof for reliable error type checking
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
