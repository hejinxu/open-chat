import { type NextRequest, NextResponse } from 'next/server'
import { signJwt } from '@/lib/auth/jwt'
import { getDatabaseProvider } from '@/lib/db'

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-auth-user-id')
  const integrationId = request.headers.get('x-auth-integration-id')

  if (!userId && !integrationId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    let sub: string
    let role: string

    if (userId) {
      // JWT authenticated — look up real user
      try {
        const db = getDatabaseProvider()
        const user = await db.getUserById(userId)
        if (!user || !user.is_enabled) {
          return NextResponse.json({ error: 'User not found or disabled' }, { status: 401 })
        }
        sub = user.id
        role = user.role
      }
      catch {
        // DB not available — use header info
        sub = userId
        role = 'user'
      }
    }
    else {
      // API Key authenticated — use integration info
      sub = integrationId!
      role = 'user'
    }

    const token = await signJwt({ sub, type: 'user', role })

    return NextResponse.json({ token })
  }
  catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
