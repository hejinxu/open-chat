import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getConversationService } from '@/lib/services/conversation'
import { checkEmbedToken } from '@/app/api/utils/common'

export async function POST(request: NextRequest, { params }: {
  params: Promise<{ conversationId: string }>
}) {
  const result = await checkEmbedToken(request)
  if (result && !result.valid) {
    return NextResponse.json({ error: result.error }, { status: result.error === 'Invalid embed token' ? 401 : 403 })
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
