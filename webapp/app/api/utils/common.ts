import type { NextRequest } from 'next/server'
import { v4 } from 'uuid'
import { APP_INFO, APP_ID } from '@/config'
import { getAgentById, getDefaultAgent } from './agents'
import { createAdapter } from '@/lib/adapters'
import type { ChatAdapter } from '@/lib/adapters/types'
import { getDatabaseProvider } from '@/lib/db'

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

export async function checkEmbedToken(
  request: NextRequest,
  options?: { requireAgent?: boolean },
): Promise<{ valid: boolean, error?: string } | null> {
  const embedToken = request.headers.get('x-embed-token')
  if (!embedToken) { return null }

  try {
    const db = getDatabaseProvider()
    const tok = await db.getEmbedTokenByValue(embedToken)

    if (!tok) { return { valid: false, error: 'Invalid embed token' } }
    if (!tok.is_enabled) { return { valid: false, error: 'Embed token is disabled' } }

    if (options?.requireAgent) {
      const agentId = getAgentIdFromRequest(request)
      if (!agentId) { return { valid: false, error: 'Missing x-agent-id header for embed request' } }
      if (!tok.allowed_agent_ids.includes('*') && !tok.allowed_agent_ids.includes(agentId)) {
        return { valid: false, error: 'Agent not allowed for this embed token' }
      }
    }

    return { valid: true }
  } catch (e: any) {
    return { valid: false, error: `Token validation failed: ${e.message}` }
  }
}

export async function getAdapterForRequest(request: NextRequest): Promise<ChatAdapter> {
  const result = await checkEmbedToken(request, { requireAgent: true })
  if (result && !result.valid) {
    throw new Error(result.error || 'Unauthorized')
  }

  const agentId = getAgentIdFromRequest(request)
  const agent = agentId ? getAgentById(agentId) : getDefaultAgent()
  if (!agent) { throw new Error(`Agent not found: ${agentId}`) }
  return createAdapter(agent)
}
