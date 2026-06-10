import type { NextRequest } from 'next/server'
import { v4 } from 'uuid'
import { APP_INFO } from '@/config'
import { getAgentById, getDefaultAgent } from './agents'
import { createAdapter } from '@/lib/adapters'
import type { ChatAdapter } from '@/lib/adapters/types'
import type { AgentConfig } from '@/types/agent'
import { AgentNotFoundError, NoAgentsConfiguredError, UnauthorizedError } from '@/lib/errors'

export const getInfo = (request: NextRequest) => {
  const userId = request.headers.get('x-auth-user-id')
  const integrationId = request.headers.get('x-auth-integration-id')
  const sessionId = request.cookies.get('session_id')?.value || v4()

  // Dify user 优先级：登录用户 > API Key 集成 > session_id
  const difyUser = userId || integrationId || sessionId

  return {
    sessionId,
    user: difyUser,
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
 * The middleware always validates JWT or API Key and injects x-auth-user-id or x-auth-integration-id.
 */
export function isRequestAuthenticated(request: NextRequest): boolean {
  const userId = request.headers.get('x-auth-user-id')
  const integrationId = request.headers.get('x-auth-integration-id')
  return !!(userId || integrationId)
}

export async function getAgentForRequest(request: NextRequest): Promise<AgentConfig> {
  if (!isRequestAuthenticated(request)) {
    throw new UnauthorizedError()
  }

  const agentId = getAgentIdFromRequest(request)
  const agent = agentId ? await getAgentById(agentId) : await getDefaultAgent()
  if (!agent) {
    throw agentId
      ? new AgentNotFoundError(agentId)
      : new NoAgentsConfiguredError()
  }
  return agent
}

export async function getAdapterForRequest(request: NextRequest): Promise<ChatAdapter> {
  if (!isRequestAuthenticated(request)) {
    throw new UnauthorizedError()
  }

  const agentId = getAgentIdFromRequest(request)
  const agent = agentId ? await getAgentById(agentId) : await getDefaultAgent()
  if (!agent) {
    throw agentId
      ? new AgentNotFoundError(agentId)
      : new NoAgentsConfiguredError()
  }
  return createAdapter(agent)
}
