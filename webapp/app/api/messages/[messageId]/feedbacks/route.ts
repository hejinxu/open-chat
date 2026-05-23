import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { isRequestAuthenticated } from '@/app/api/utils/common'
import { getDatabaseProvider } from '@/lib/db'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { messageId } = await params
  const body = await request.json()

  try {
    const db = getDatabaseProvider()
    await db.saveMessage({
      id: messageId,
      conversation_id: '',
      agent_id: null,
      agent_name: null,
      role: 'assistant',
      content: '',
      is_answer: true,
      feedback: body.rating ? { rating: body.rating } : null,
      message_files: [],
      agent_thoughts: [],
      created_at: Math.floor(Date.now() / 1000),
    })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
