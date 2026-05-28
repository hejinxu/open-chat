import type { NextRequest } from 'next/server'
import { getInfo, getAdapterForRequest } from '@/app/api/utils/common'

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
    const { user } = getInfo(request)
    const adapter = await getAdapterForRequest(request)
    const res = await adapter.sendMessage({
      inputs: inputs || {},
      query,
      user,
      conversation_id: conversationId || undefined,
      files,
      messages,
      response_mode: responseMode || 'streaming',
    })

    if (res instanceof Response) {
      return res
    }

    return Response.json(res)
  }
  catch (error: any) {
    return new Response(
      JSON.stringify({ message: error.message || 'Internal Server Error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
