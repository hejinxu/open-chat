import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function requireAdmin(request: NextRequest): NextResponse | null {
  const userId = request.headers.get('x-auth-user-id')
  const role = request.headers.get('x-auth-user-role')

  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  return null
}
