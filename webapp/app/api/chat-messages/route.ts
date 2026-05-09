import type { NextRequest } from 'next/server'
import { getInfo, getAdapterForRequest } from '@/app/api/utils/common'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const {
    inputs,
    query,
    files,
    conversation_id: conversationId,
    response_mode: responseMode,
  } = body
  const { user } = getInfo(request)
  const adapter = getAdapterForRequest(request)
  const res = await adapter.sendMessage({
    inputs: inputs || {},
    query,
    user,
    conversation_id: conversationId || undefined,
    files,
    response_mode: responseMode || 'streaming',
  })

  if (res instanceof Response) {
    return res
  }

  return Response.json(res)
}
