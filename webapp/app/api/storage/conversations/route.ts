import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDatabaseProvider } from '@/lib/db'
import { isRequestAuthenticated } from '@/app/api/utils/common'

export async function GET(request: NextRequest) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    const db = getDatabaseProvider()

    if (id) {
      const conv = await db.getConversationById(id)
      return NextResponse.json({ success: true, data: conv })
    }

    const conversations = await db.getConversations()
    return NextResponse.json({ success: true, data: conversations })
  } catch (error: any) {
    console.error('GET /api/storage/conversations error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const conv = await request.json()
    const db = getDatabaseProvider()
    await db.saveConversation(conv)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('POST /api/storage/conversations error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    )
  }
}

export async function DELETE(request: NextRequest) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await request.json()
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing conversation id' },
        { status: 400 },
      )
    }
    const db = getDatabaseProvider()
    await db.deleteConversation(id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE /api/storage/conversations error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    )
  }
}
