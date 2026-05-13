import { getDatabaseProvider } from '@/lib/db'

export async function validateEmbedToken(
  rawToken: string,
  agentId: string,
): Promise<{ valid: boolean, error?: string }> {
  try {
    const db = getDatabaseProvider()
    const tok = await db.getEmbedTokenByValue(rawToken)

    if (!tok) {
      return { valid: false, error: 'Invalid embed token' }
    }

    if (!tok.is_enabled) {
      return { valid: false, error: 'Embed token is disabled' }
    }

    if (!tok.allowed_agent_ids.includes('*') && !tok.allowed_agent_ids.includes(agentId)) {
      return { valid: false, error: 'Agent not allowed for this embed token' }
    }

    return { valid: true }
  } catch (e: any) {
    return { valid: false, error: `Token validation failed: ${e.message}` }
  }
}
