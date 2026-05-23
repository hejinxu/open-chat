import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDatabaseProvider } from '@/lib/db'

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-auth-user-id')
  const integrationId = request.headers.get('x-auth-integration-id')

  // No authentication at all
  if (!userId && !integrationId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // API Key authentication — return default user identity
  if (integrationId && !userId) {
    return NextResponse.json({
      user: { id: integrationId, name: 'API User', role: 'user' },
    })
  }

  // JWT authentication — look up user from DB
  try {
    const db = getDatabaseProvider()
    const user = await db.getUserById(userId!)

    if (!user || !user.is_enabled) {
      return NextResponse.json({ error: 'User not found or disabled' }, { status: 401 })
    }

    return NextResponse.json({
      user: { id: user.id, name: user.name, role: user.role },
    })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
