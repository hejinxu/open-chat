import type { NextRequest } from 'next/server'
import { getInfo, getAgentIdFromRequest } from '@/app/api/utils/common'
import { getAgentById, getDefaultAgent } from '@/app/api/utils/agents'
import { createAdapter } from '@/lib/adapters'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params
  const { user } = getInfo(request)
  const agentId = getAgentIdFromRequest(request)

  try {
    const agent = agentId ? getAgentById(agentId) : getDefaultAgent()
    if (!agent) throw new Error('No agent found')
    const adapter = createAdapter(agent)
    await adapter.stopMessage(taskId, user)
    return new Response(JSON.stringify({ result: 'success' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Failed to stop' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
