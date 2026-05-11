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
    const { conversation_id } = await request.json()
    if (!conversation_id) {
      return NextResponse.json(
        { success: false, error: 'Missing conversation_id' },
        { status: 400 }
      )
    }
    const db = getDatabaseProvider()
    await db.deleteMessages(conversation_id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE /api/storage/messages error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
