import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDatabaseProvider } from '@/lib/db'
import { comparePassword } from '@/lib/auth/password'
import { signJwt, getAuthCookieOptions } from '@/lib/auth/jwt'
import { verifyCaptcha } from '@/lib/auth/captcha-store'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { identifier, password, captchaId, captcha } = body

    if (!identifier || !password) {
      return NextResponse.json({ error: 'Identifier and password are required', code: 'MISSING_FIELDS' }, { status: 400 })
    }

    // 验证码校验（服务端验证）
    if (!captchaId || !captcha || !verifyCaptcha(captchaId, captcha)) {
      return NextResponse.json({ error: 'Invalid captcha', code: 'INVALID_CAPTCHA' }, { status: 400 })
    }

    const db = getDatabaseProvider()
    await db.ensureReady()

    // Find account by identifier
    const account = await db.getUserAccountByIdentifier(identifier)
    if (!account) {
      return NextResponse.json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' }, { status: 401 })
    }

    // Check password
    if (!account.password_hash) {
      return NextResponse.json({ error: 'This account does not have a password set', code: 'NO_PASSWORD' }, { status: 401 })
    }

    const valid = await comparePassword(password, account.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' }, { status: 401 })
    }

    // Get user
    const user = await db.getUserById(account.user_id)
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' }, { status: 401 })
    }

    if (!user.is_enabled) {
      return NextResponse.json({ error: 'Account is disabled', code: 'ACCOUNT_DISABLED' }, { status: 403 })
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

    response.cookies.set('auth_token', token, getAuthCookieOptions())

    return response
  }
  catch (error: any) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
