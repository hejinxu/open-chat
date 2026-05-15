import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getInfo, setSession, isRequestAuthenticated } from '@/app/api/utils/common'
import { getConversationService } from '@/lib/services/conversation'

export async function GET(request: NextRequest) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { sessionId } = getInfo(request)
  try {
    const conversations = await getConversationService().getAllConversations()
    return NextResponse.json({
      data: conversations.map(c => ({ ...c, inputs: {}, introduction: '', suggested_questions: [] })),
    }, {
      headers: setSession(sessionId),
    })
  }
  catch (error: any) {
    return NextResponse.json({
      data: [],
      error: error.message,
    })
  }
}
