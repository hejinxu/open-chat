import type { NextRequest } from 'next/server'
import { v4 } from 'uuid'
import { APP_INFO, APP_ID } from '@/config'
import { getAgentById, getDefaultAgent } from './agents'
import { createAdapter } from '@/lib/adapters'
import type { ChatAdapter } from '@/lib/adapters/types'

const userPrefix = `user_${APP_ID}:`

export const getInfo = (request: NextRequest) => {
  const sessionId = request.cookies.get('session_id')?.value || v4()
  const user = userPrefix + sessionId
  return {
    sessionId,
    user,
  }
}

export const setSession = (sessionId: string) => {
  if (APP_INFO.disable_session_same_site) {
    return { 'Set-Cookie': `session_id=${sessionId}; SameSite=None; Secure` }
  }

  return { 'Set-Cookie': `session_id=${sessionId}` }
}

export function getAgentIdFromRequest(request: NextRequest): string | null {
  return request.headers.get('x-agent-id') || null
}

/**
 * Check if the request is authenticated via middleware-injected headers.
 * When AUTH_ENABLED=false, the middleware passes all requests through,
 * so this check is a no-op (returns true).
 * When AUTH_ENABLED=true, the middleware injects x-auth-user-id or x-auth-integration-id.
 */
export function isRequestAuthenticated(request: NextRequest): boolean {
  if (process.env.AUTH_ENABLED !== 'true') {
    return true
  }

  const userId = request.headers.get('x-auth-user-id')
  const integrationId = request.headers.get('x-auth-integration-id')
  return !!(userId || integrationId)
}

export async function getAdapterForRequest(request: NextRequest): Promise<ChatAdapter> {
  if (!isRequestAuthenticated(request)) {
    throw new Error('Unauthorized')
  }

  const agentId = getAgentIdFromRequest(request)
  const agent = agentId ? getAgentById(agentId) : getDefaultAgent()
  if (!agent) { throw new Error(`Agent not found: ${agentId}`) }
  return createAdapter(agent)
}
