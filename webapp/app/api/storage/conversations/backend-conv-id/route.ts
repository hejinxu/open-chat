import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDatabaseProvider } from '@/lib/db'
import { isRequestAuthenticated } from '@/app/api/utils/common'

export async function PATCH(request: NextRequest) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { convId, agentId, backendConvId } = await request.json()
    if (!convId || !agentId) {
      return NextResponse.json({ success: false, error: 'Missing convId or agentId' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    await db.updateConversationBackendConvId(convId, agentId, backendConvId || '')
    return NextResponse.json({ success: true })
  }
  catch (error: any) {
    console.error('PATCH /api/storage/conversations/backend-conv-id error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
