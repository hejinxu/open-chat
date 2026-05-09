import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getInfo, setSession } from '@/app/api/utils/common'
import { getMessageService } from '@/lib/services/message'
import type { MessageRecord } from '@/lib/storage/types'

function messageRecordsToResponse(messages: MessageRecord[]) {
  const pairs: any[] = []
  let pendingUser: MessageRecord | null = null
  for (const msg of messages) {
    if (msg.role === 'user') {
      pendingUser = msg
    }
    else if (msg.role === 'assistant' && pendingUser) {
      pairs.push({
        id: msg.id,
        query: pendingUser.content,
        answer: msg.content,
        message_files: [...(pendingUser.message_files || []), ...(msg.message_files || [])],
        agent_thoughts: msg.agent_thoughts || [],
        feedback: msg.feedback,
      })
      pendingUser = null
    }
  }
  return { data: pairs, has_more: false }
}

export async function GET(request: NextRequest) {
  const { sessionId } = getInfo(request)
  const { searchParams } = new URL(request.url)
  const conversationId = searchParams.get('conversation_id')
  if (!conversationId) {
    return NextResponse.json({ data: [], has_more: false }, {
      headers: setSession(sessionId),
    })
  }
  try {
    const messages = await getMessageService().getMessages(conversationId)
    return NextResponse.json(messageRecordsToResponse(messages), {
      headers: setSession(sessionId),
    })
  }
  catch {
    return NextResponse.json({ data: [], has_more: false }, {
      headers: setSession(sessionId),
    })
  }
}
