import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { summarizeConversationTitle } from '@/lib/services/title-summarization'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { user_message, assistant_message } = body

    if (!user_message || !assistant_message) {
      return NextResponse.json(
        { error: 'user_message and assistant_message are required' },
        { status: 400 },
      )
    }

    const title = await summarizeConversationTitle(user_message, assistant_message)

    return NextResponse.json({ title })
  }
  catch (error: any) {
    console.error('[SummarizeTitle] Error:', error)
    return NextResponse.json(
      { error: error.message, title: null },
      { status: 500 },
    )
  }
}
