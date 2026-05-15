import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDatabaseProvider } from '@/lib/db'
import { comparePassword } from '@/lib/auth/password'
import { signJwt } from '@/lib/auth/jwt'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { identifier, password } = body

    if (!identifier || !password) {
      return NextResponse.json({ error: 'Identifier and password are required' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    await db.ensureReady()

    // Find account by identifier
    const account = await db.getUserAccountByIdentifier(identifier)
    if (!account) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // Check password
    if (!account.password_hash) {
      return NextResponse.json({ error: 'This account does not have a password set' }, { status: 401 })
    }

    const valid = await comparePassword(password, account.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // Get user
    const user = await db.getUserById(account.user_id)
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    if (!user.is_enabled) {
      return NextResponse.json({ error: 'Account is disabled' }, { status: 403 })
    }

    // Sign JWT
    const token = await signJwt({
      sub: user.id,
      type: 'user',
      role: user.role,
    })

    const response = NextResponse.json({
      user: { id: user.id, name: user.name, role: user.role },
    })

    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    })

    return response
  }
  catch (error: any) {
    console.error('Login error:', error)
    return NextResponse.json({ error: error.message || 'Login failed' }, { status: 500 })
  }
}
