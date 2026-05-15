import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getConversationService } from '@/lib/services/conversation'
import { isRequestAuthenticated } from '@/app/api/utils/common'

export async function POST(request: NextRequest, { params }: {
  params: Promise<{ conversationId: string }>
}) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { conversationId } = await params
  try {
    const updated = await getConversationService().updateConversation(conversationId, { name: body.name })
    return NextResponse.json(updated || { name: body.name })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
