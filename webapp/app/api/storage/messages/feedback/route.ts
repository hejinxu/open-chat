import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDatabaseProvider } from '@/lib/db'
import { isRequestAuthenticated } from '@/app/api/utils/common'

export async function PATCH(request: NextRequest) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id, feedback } = await request.json()
    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    await db.updateMessageFeedback(id, feedback || null)
    return NextResponse.json({ success: true })
  }
  catch (error: any) {
    console.error('PATCH /api/storage/messages/feedback error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
