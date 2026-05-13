import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getInfo, setSession, checkEmbedToken } from '@/app/api/utils/common'
import { getConversationService } from '@/lib/services/conversation'

export async function GET(request: NextRequest) {
  const result = await checkEmbedToken(request)
  if (result && !result.valid) {
    return NextResponse.json({ error: result.error }, { status: result.error === 'Invalid embed token' ? 401 : 403 })
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
