import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getMessageService } from '@/lib/services/message'
import { getStorageProvider } from '@/lib/storage'
import { checkEmbedToken } from '@/app/api/utils/common'

export async function POST(request: NextRequest, { params }: {
  params: Promise<{ messageId: string }>
}) {
  const result = await checkEmbedToken(request)
  if (result && !result.valid) {
    return NextResponse.json({ error: result.error }, { status: result.error === 'Invalid embed token' ? 401 : 403 })
  }

  const body = await request.json()
  const { rating } = body
  const { messageId } = await params
  try {
    const storage = getStorageProvider()
    const conversations = await storage.getConversations()
    for (const conv of conversations) {
      const messages = await storage.getMessages(conv.id)
      const target = messages.find(m => m.id === messageId)
      if (target) {
        target.feedback = { rating }
        await storage.saveMessage(target)
        return NextResponse.json({ success: true })
      }
    }
    return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
