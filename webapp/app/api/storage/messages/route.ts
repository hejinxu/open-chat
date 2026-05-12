import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDatabaseProvider } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversation_id')

    if (!conversationId) {
      return NextResponse.json(
        { success: false, error: 'Missing conversation_id parameter' },
        { status: 400 }
      )
    }

    const db = getDatabaseProvider()
    const messages = await db.getMessages(conversationId)
    return NextResponse.json({ success: true, data: messages })
  } catch (error: any) {
    console.error('GET /api/storage/messages error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const msg = await request.json()
    const db = getDatabaseProvider()
    await db.saveMessage(msg)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('POST /api/storage/messages error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const db = getDatabaseProvider()

    if (body.conversation_id) {
      await db.deleteMessages(body.conversation_id)
      return NextResponse.json({ success: true })
    }

    if (body.ids && Array.isArray(body.ids) && body.ids.length > 0) {
      await db.deleteMessagesByIds(body.ids)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json(
      { success: false, error: 'Missing conversation_id or ids' },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('DELETE /api/storage/messages error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
