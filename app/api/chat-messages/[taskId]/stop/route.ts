import type { NextRequest } from 'next/server'
import { getInfo } from '@/app/api/utils/common'
import { API_URL, API_KEY } from '@/config'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params
  const { user } = getInfo(request)

  try {
    const res = await fetch(`${API_URL}/chat-messages/${taskId}/stop`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user }),
    })

    const data = await res.json()
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Failed to stop' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
